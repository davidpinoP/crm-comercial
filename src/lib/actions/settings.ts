"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuth, getContext } from "@/lib/data/context";
import { goalSchema, isoDate, optText, optUuid, zoneSchema } from "@/lib/validation";
import { ORDER_STATUSES } from "@/lib/domain/revenue";
import { validateTiers, type CommissionTier } from "@/lib/domain/commissions";
import { parseEurosToCents, parsePercentToBp } from "@/lib/domain/money";
import { monthEndISO, monthStartISO, todayISO } from "@/lib/domain/dates";
import { MONETARY_METRICS } from "@/lib/domain/goals";
import { loadOrdersForRange, monthCommission } from "@/lib/data/sales";
import type { ActionResult } from "@/lib/types";
import { action, describeDbError, fail } from "./helpers";

const ok = (message: string): ActionResult => {
  revalidatePath("/", "layout");
  return { ok: true, data: undefined, message };
};

export async function updateProfile(input: unknown): Promise<ActionResult> {
  return action(async () => {
    const d = z.object({ full_name: optText(120), phone: optText(40), company: optText(120) }).parse(input);
    const { supabase, user } = await getAuth();
    const { error } = await supabase.from("profiles").upsert({ id: user.id, ...d });
    if (error) return fail(describeDbError(error));
    return ok("Datos personales guardados.");
  });
}

const settingsSchema = z.object({
  inactivity_days: z.coerce.number().int().min(1, "Mínimo 1 día.").max(3650),
  cohort_maturity_days: z.coerce.number().int().min(1).max(3650),
  working_weekdays: z.array(z.number().int().min(1).max(7)),
  default_work_hours: z.coerce.number().min(0).max(24),
  work_start_time: z.string().regex(/^\d{2}:\d{2}/),
  work_end_time: z.string().regex(/^\d{2}:\d{2}/),
  countable_order_statuses: z.array(z.enum(ORDER_STATUSES)).min(1, "Elige al menos un estado computable."),
  theme: z.enum(["system", "light", "dark"]),
});

export async function updateSettings(input: unknown): Promise<ActionResult> {
  return action(async () => {
    const d = settingsSchema.partial().parse(input);
    const { supabase, user } = await getAuth();
    if (d.countable_order_statuses?.some((s) => s === "draft" || s === "cancelled")) {
      return fail("Los borradores y los pedidos cancelados no pueden computar como venta.");
    }
    const { error } = await supabase.from("app_settings").upsert({ user_id: user.id, ...d });
    if (error) return fail(describeDbError(error));
    return ok("Configuración guardada.");
  });
}

// -----------------------------------------------------------------------------
// Catálogos simples (tipos de establecimiento, categorías)
// -----------------------------------------------------------------------------
const TABLES = { types: "establishment_types", categories: "product_categories" } as const;

export async function saveLookup(kind: keyof typeof TABLES, input: unknown): Promise<ActionResult> {
  return action(async () => {
    const d = z
      .object({ id: optUuid, name: z.string().trim().min(1, "El nombre es obligatorio.").max(80), active: z.boolean().optional(), sort_order: z.number().int().optional() })
      .parse(input);
    const { supabase } = await getAuth();
    const table = TABLES[kind];
    const row: Record<string, unknown> = { name: d.name };
    if (d.sort_order != null) row.sort_order = d.sort_order;
    if (kind === "types" && d.active != null) row.active = d.active;
    const res = d.id ? await supabase.from(table).update(row).eq("id", d.id) : await supabase.from(table).insert(row);
    if (res.error) return fail(describeDbError(res.error));
    return ok("Guardado.");
  });
}

export async function deleteLookup(kind: keyof typeof TABLES, id: string): Promise<ActionResult> {
  return action(async () => {
    const { supabase } = await getAuth();
    // Las referencias existentes quedan a null (ON DELETE SET NULL); el historial no se borra
    const { error } = await supabase.from(TABLES[kind]).delete().eq("id", id);
    if (error) return fail(describeDbError(error));
    return ok("Eliminado.");
  });
}

const resultSchema = z.object({
  id: optUuid,
  name: z.string().trim().min(1).max(80),
  is_effective_contact: z.boolean(),
  is_interest: z.boolean(),
  is_rejection: z.boolean(),
  active: z.boolean(),
  sort_order: z.number().int().optional(),
});

export async function saveResult(input: unknown): Promise<ActionResult> {
  return action(async () => {
    const d = resultSchema.parse(input);
    const { supabase } = await getAuth();
    const { id, ...row } = d;
    const res = id
      ? await supabase.from("prospecting_results").update(row).eq("id", id)
      : await supabase.from("prospecting_results").insert({
          ...row,
          code: `custom_${Date.now().toString(36)}`,
        });
    if (res.error) return fail(describeDbError(res.error));
    return ok("Resultado guardado. Las métricas se recalculan con la nueva definición.");
  });
}

// -----------------------------------------------------------------------------
// Zonas comerciales
// -----------------------------------------------------------------------------
export async function saveZone(input: unknown): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const { populations, id, ...row } = zoneSchema.parse(input);
    const { supabase } = await getAuth();
    const res = id
      ? await supabase.from("commercial_zones").update(row).eq("id", id).select("id").single()
      : await supabase.from("commercial_zones").insert(row).select("id").single();
    if (res.error) return fail(describeDbError(res.error));
    const zoneId = res.data.id as string;
    const unique = [...new Map(populations.map((p) => [p.toLowerCase(), p])).values()];
    const del = await supabase.from("zone_populations").delete().eq("zone_id", zoneId);
    if (del.error) return fail(describeDbError(del.error));
    if (unique.length) {
      const ins = await supabase.from("zone_populations").insert(unique.map((population) => ({ zone_id: zoneId, population })));
      if (ins.error) return fail(describeDbError(ins.error));
    }
    revalidatePath("/", "layout");
    return { ok: true, data: { id: zoneId }, message: "Zona guardada." };
  });
}

export async function archiveZone(id: string): Promise<ActionResult> {
  return action(async () => {
    const { supabase } = await getAuth();
    const { error } = await supabase.from("commercial_zones").update({ archived_at: new Date().toISOString() }).eq("id", id);
    if (error) return fail(describeDbError(error));
    await supabase.from("zone_weekday_assignments").delete().eq("zone_id", id);
    return ok("Zona archivada.");
  });
}

export async function setWeekdayZone(weekday: number, zoneId: string | null): Promise<ActionResult> {
  return action(async () => {
    const wd = z.number().int().min(1).max(7).parse(weekday);
    const { supabase, user } = await getAuth();
    const res = zoneId
      ? await supabase.from("zone_weekday_assignments").upsert({ user_id: user.id, weekday: wd, zone_id: zoneId })
      : await supabase.from("zone_weekday_assignments").delete().eq("weekday", wd);
    if (res.error) return fail(describeDbError(res.error));
    return ok("Asignación guardada.");
  });
}

/** Sobrescribe la zona de una fecha. mode "clear" elimina la sobrescritura. */
export async function setDateZone(date: string, zoneId: string | null, mode: "set" | "clear" = "set"): Promise<ActionResult> {
  return action(async () => {
    const d = isoDate.parse(date);
    const { supabase, user } = await getAuth();
    const res =
      mode === "clear"
        ? await supabase.from("zone_date_overrides").delete().eq("date", d)
        : await supabase.from("zone_date_overrides").upsert({ user_id: user.id, date: d, zone_id: zoneId });
    if (res.error) return fail(describeDbError(res.error));
    return ok("Zona del día actualizada.");
  });
}

// -----------------------------------------------------------------------------
// Calendario laboral
// -----------------------------------------------------------------------------
export async function setWorkday(input: unknown): Promise<ActionResult> {
  return action(async () => {
    const d = z
      .object({
        date: isoDate,
        kind: z.enum(["work", "vacation", "holiday", "off", "default"]),
        hours_worked: z
          .union([z.string(), z.number()])
          .optional()
          .nullable()
          .transform((v) => (v === "" || v == null ? null : Number(String(v).replace(",", "."))))
          .pipe(z.number().min(0).max(24).nullable()),
        note: optText(200),
      })
      .parse(input);
    const { supabase, user } = await getAuth();
    const res =
      d.kind === "default"
        ? await supabase.from("workdays").delete().eq("date", d.date)
        : await supabase.from("workdays").upsert({ user_id: user.id, date: d.date, kind: d.kind, hours_worked: d.hours_worked, note: d.note });
    if (res.error) return fail(describeDbError(res.error));
    return ok("Calendario laboral actualizado.");
  });
}

// -----------------------------------------------------------------------------
// Comisiones
// -----------------------------------------------------------------------------
const commissionSchema = z.object({
  method: z.enum(["flat", "marginal"]),
  method_confirmed: z.boolean(),
  base_type: z.enum(["net", "gross"]),
  tiers: z.array(z.object({ lower: z.string(), lower_inclusive: z.boolean(), rate: z.string() })).min(1),
});

export async function saveCommissionSettings(input: unknown): Promise<ActionResult> {
  return action(async () => {
    const d = commissionSchema.parse(input);
    const tiers: CommissionTier[] = [];
    for (const t of d.tiers) {
      const lower = parseEurosToCents(t.lower);
      const rate = parsePercentToBp(t.rate);
      if (lower == null || lower < 0) return fail(`Límite no válido: «${t.lower}».`);
      if (rate == null) return fail(`Porcentaje no válido: «${t.rate}».`);
      tiers.push({ lowerCents: lower, lowerInclusive: t.lower_inclusive, rateBp: rate });
    }
    if (!tiers.some((t) => t.lowerCents === 0)) tiers.push({ lowerCents: 0, lowerInclusive: true, rateBp: 0 });
    const errors = validateTiers(tiers);
    if (errors.length) return fail(errors[0]);

    const { supabase, user } = await getAuth();
    const s = await supabase.from("commission_settings").upsert({
      user_id: user.id,
      method: d.method,
      method_confirmed: d.method_confirmed,
      base_type: d.base_type,
      updated_at: new Date().toISOString(),
    });
    if (s.error) return fail(describeDbError(s.error));
    const del = await supabase.from("commission_tiers").delete().eq("user_id", user.id);
    if (del.error) return fail(describeDbError(del.error));
    const ins = await supabase
      .from("commission_tiers")
      .insert(tiers.map((t) => ({ lower_cents: t.lowerCents, lower_inclusive: t.lowerInclusive, rate_bp: t.rateBp })));
    if (ins.error) return fail(`Se borraron los tramos anteriores pero no se pudieron guardar los nuevos: ${describeDbError(ins.error)}`);
    return ok("Escala de comisiones guardada. Las estimaciones se recalculan con la nueva configuración.");
  });
}

/** Guarda una instantánea del cálculo de un mes (los anteriores se conservan para consulta) */
export async function snapshotCommission(month: string): Promise<ActionResult> {
  return action(async () => {
    const monthStart = monthStartISO(isoDate.parse(month));
    const ctx = await getContext();
    const orders = await loadOrdersForRange(ctx, monthStart, monthEndISO(monthStart));
    const mc = monthCommission(ctx, orders, monthStart);
    const { error } = await ctx.supabase.from("commission_calculations").insert({
      period_month: monthStart,
      gross_sales_cents: mc.revenue.computable.salesCents,
      returns_cents: mc.revenue.computable.returnsCents,
      base_cents: mc.result.baseCents,
      method: ctx.commission.method,
      base_type: ctx.commission.base_type,
      tier_label: mc.result.tierLabel,
      rate_bp: mc.result.rateBp,
      amount_cents: mc.result.amountCents,
      order_ids: mc.revenue.computable.orderIds,
      tiers_snapshot: ctx.tiers,
      is_provisional: !ctx.commission.method_confirmed,
    });
    if (error) return fail(describeDbError(error));
    return ok("Cálculo guardado en el historial.");
  });
}

/** Registro explícito de liquidación: sólo así una comisión figura como liquidada */
export async function settleCommission(id: string, amount: string, note?: string | null): Promise<ActionResult> {
  return action(async () => {
    const cents = parseEurosToCents(amount);
    if (cents == null || cents < 0) return fail("Importe liquidado no válido.");
    const { supabase } = await getAuth();
    const { error } = await supabase
      .from("commission_calculations")
      .update({ settled_at: new Date().toISOString(), settled_amount_cents: cents, settlement_note: note ?? null })
      .eq("id", id);
    if (error) return fail(describeDbError(error));
    return ok("Liquidación registrada.");
  });
}

// -----------------------------------------------------------------------------
// Objetivos
// -----------------------------------------------------------------------------
export async function saveGoal(input: unknown): Promise<ActionResult> {
  return action(async () => {
    const d = goalSchema.parse(input);
    let value: number;
    if (MONETARY_METRICS.includes(d.metric)) {
      const c = parseEurosToCents(d.target);
      if (c == null || c < 0) return fail("Importe del objetivo no válido.");
      value = c;
    } else {
      value = Number(String(d.target).replace(",", "."));
      if (!Number.isFinite(value) || value < 0) return fail("El objetivo debe ser un número positivo.");
    }
    const { supabase } = await getAuth();
    let existing = supabase.from("sales_goals").select("id").eq("period_type", d.period_type).eq("metric", d.metric);
    existing = d.period_start ? existing.eq("period_start", d.period_start) : existing.is("period_start", null);
    const { data: ex } = await existing.maybeSingle();
    const res = ex
      ? await supabase.from("sales_goals").update({ target_value: value }).eq("id", ex.id)
      : await supabase.from("sales_goals").insert({ period_type: d.period_type, period_start: d.period_start, metric: d.metric, target_value: value });
    if (res.error) return fail(describeDbError(res.error));
    return ok("Objetivo guardado.");
  });
}

export async function deleteGoal(id: string): Promise<ActionResult> {
  return action(async () => {
    const { supabase } = await getAuth();
    const { error } = await supabase.from("sales_goals").delete().eq("id", id);
    if (error) return fail(describeDbError(error));
    return ok("Objetivo eliminado.");
  });
}

// -----------------------------------------------------------------------------
// Datos de demostración (marcados is_demo; nombres claramente ficticios)
// -----------------------------------------------------------------------------
export async function generateDemoData(): Promise<ActionResult> {
  return action(async () => {
    const ctx = await getContext();
    const { supabase } = ctx;
    const { count } = await supabase.from("customers").select("id", { count: "exact", head: true }).eq("is_demo", true);
    if (count) return fail("Ya existen datos de demostración. Elimínalos antes de generar otros.");

    let seed = 42;
    const rnd = (n: number) => {
      seed = (seed * 16807) % 2147483647;
      return seed % n;
    };
    const pick = <T,>(arr: T[]) => arr[rnd(arr.length)];
    const today = todayISO();
    const daysAgo = (n: number) => {
      const d = new Date(`${today}T10:00:00Z`);
      d.setUTCDate(d.getUTCDate() - n);
      return d;
    };

    const zoneRows = ["A", "B", "C"].map((l, i) => ({
      name: `[DEMO] Zona ${l}`,
      color: ["#8c2f55", "#5b7183", "#7fa08a"][i],
      daily_prospecting_target: 15,
      is_demo: true,
    }));
    const zones = await supabase.from("commercial_zones").insert(zoneRows).select("id, name");
    if (zones.error) return fail(describeDbError(zones.error));
    const zoneIds = zones.data.map((z) => z.id as string);
    const towns = ["Población demo 1", "Población demo 2", "Población demo 3", "Población demo 4", "Población demo 5", "Población demo 6"];
    await supabase.from("zone_populations").insert(towns.map((t, i) => ({ zone_id: zoneIds[i % 3], population: t })));

    const cat = new Map(ctx.categories.map((c) => [c.name, c.id]));
    const prodRows = [
      ["[DEMO] Crema hidratante", "DEMO-CR-01", "Cosmética", 1450, 2100],
      ["[DEMO] Sérum facial", "DEMO-SE-02", "Cosmética", 2290, 2100],
      ["[DEMO] Base de maquillaje", "DEMO-MQ-03", "Maquillaje", 1690, 2100],
      ["[DEMO] Paleta de sombras", "DEMO-MQ-04", "Maquillaje", 1990, 2100],
      ["[DEMO] Cera tibia 800 ml", "DEMO-CE-05", "Cera depilatoria", 1150, 2100],
      ["[DEMO] Cera en discos 1 kg", "DEMO-CE-06", "Cera depilatoria", 1890, 2100],
    ].map(([name, reference, c, price, vat]) => ({
      name,
      reference,
      category_id: cat.get(c as string) ?? null,
      price_cents: price,
      vat_rate_bp: vat,
      is_demo: true,
    }));
    const products = await supabase.from("products").insert(prodRows).select("*");
    if (products.error) return fail(describeDbError(products.error));

    const statuses = ["prospect_contacted", "interested", "follow_up_pending", "customer_new", "customer_active", "customer_active", "customer_inactive", "prospect_uncontacted"] as const;
    const custRows = Array.from({ length: 32 }, (_, i) => {
      const first = daysAgo(5 + rnd(110));
      const status = statuses[rnd(statuses.length)];
      return {
        trade_name: `[DEMO] Establecimiento ${String(i + 1).padStart(2, "0")}`,
        establishment_type_id: ctx.types.length ? pick(ctx.types).id : null,
        city: towns[i % towns.length],
        zone_id: zoneIds[i % 3],
        status,
        first_contact_date: first.toISOString().slice(0, 10),
        customer_since_date: status.startsWith("customer_") ? daysAgo(rnd(60)).toISOString().slice(0, 10) : null,
        is_demo: true,
      };
    });
    const customers = await supabase.from("customers").insert(custRows).select("id, status, first_contact_date");
    if (customers.error) return fail(describeDbError(customers.error));

    const results = ctx.results.filter((r) => r.active);
    const acts = Array.from({ length: 260 }, () => {
      const c = rnd(3) === 0 ? null : pick(customers.data);
      const when = daysAgo(rnd(75));
      when.setUTCHours(8 + rnd(9), rnd(60));
      return {
        customer_id: c?.id ?? null,
        establishment_name: c ? null : `[DEMO] Sin identificar ${rnd(1000)}`,
        city: pick(towns),
        result_id: results.length ? pick(results).id : null,
        occurred_at: when.toISOString(),
        is_demo: true,
      };
    });
    const ia = await supabase.from("prospecting_activities").insert(acts);
    if (ia.error) return fail(describeDbError(ia.error));

    const visits = Array.from({ length: 70 }, () => {
      const c = pick(customers.data);
      const when = daysAgo(rnd(75));
      when.setUTCHours(9 + rnd(8));
      return {
        customer_id: c.id,
        occurred_at: when.toISOString(),
        visit_kind: String(c.status).startsWith("customer_") ? "customer" : "prospect",
        is_commercial: rnd(6) !== 0,
        is_demo: true,
      };
    });
    const iv = await supabase.from("visits").insert(visits);
    if (iv.error) return fail(describeDbError(iv.error));

    const buyers = customers.data.filter((c) => String(c.status).startsWith("customer_"));
    for (let i = 0; i < 40 && buyers.length; i++) {
      const c = pick(buyers);
      const date = daysAgo(rnd(95)).toISOString().slice(0, 10);
      const lines = Array.from({ length: 1 + rnd(3) }, () => {
        const p = pick(products.data);
        return {
          product_id: p.id,
          category_id: p.category_id,
          description: p.name,
          quantity: 1 + rnd(12),
          unit_price_cents: p.price_cents,
          discount_bp: pick([0, 0, 500, 1000]),
          vat_rate_bp: p.vat_rate_bp,
        };
      });
      const status = pick(["confirmed", "delivered", "invoiced", "paid", "paid", "cancelled"]);
      const { data: oid, error } = await supabase.rpc("save_order", {
        p_order: { customer_id: c.id, order_date: date, status, order_number: `DEMO-${1000 + i}` },
        p_items: lines,
      });
      if (error) return fail(describeDbError(error));
      await supabase.from("orders").update({ is_demo: true, paid_date: status === "paid" ? date : null }).eq("id", oid);
    }

    const fus = customers.data.slice(0, 12).map((c, i) => ({
      customer_id: c.id,
      follow_up_type: pick(["call", "visit", "catalog_presentation", "restock"]),
      due_date: daysAgo(6 - i).toISOString().slice(0, 10),
      reason: "[DEMO] Seguimiento de ejemplo",
      is_demo: true,
    }));
    await supabase.from("follow_ups").insert(fus);

    const events = Array.from({ length: 14 }, (_, i) => {
      const c = pick(customers.data);
      const when = daysAgo(-(i % 10));
      when.setUTCHours(8 + rnd(8), 0);
      return {
        title: `[DEMO] Visita ${i + 1}`,
        event_type: String(c.status).startsWith("customer_") ? "customer_visit" : "prospect_visit",
        customer_id: c.id,
        starts_at: when.toISOString(),
        ends_at: new Date(when.getTime() + 45 * 60000).toISOString(),
        is_demo: true,
      };
    });
    await supabase.from("calendar_events").insert(events);
    return ok("Datos de demostración generados. Todos llevan la marca [DEMO].");
  });
}

export async function deleteDemoData(): Promise<ActionResult> {
  return action(async () => {
    const { supabase } = await getAuth();
    const { data, error } = await supabase.rpc("delete_demo_data");
    if (error) return fail(describeDbError(error));
    return ok(`Se han eliminado ${data ?? 0} registros de demostración. Tus datos reales no se han tocado.`);
  });
}
