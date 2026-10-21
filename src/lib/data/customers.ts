import "server-only";
import type { AppContext } from "./context";
import type { Customer } from "@/lib/types";
import { addDaysISO, madridDateKey, todayISO, type ISODate } from "@/lib/domain/dates";

export interface CustomerFilters {
  q?: string;
  status?: string;
  type?: string;
  zone?: string;
  city?: string;
  archived?: boolean;
  reactivation?: boolean;
  page?: number;
  pageSize?: number;
}

export interface CustomerListRow extends Customer {
  last_visit_at: string | null;
  last_order_date: ISODate | null;
  last_activity_at: string | null;
}

async function lastDates(ctx: AppContext, ids: string[]) {
  if (!ids.length) return { visits: new Map<string, string>(), orders: new Map<string, string>(), acts: new Map<string, string>() };
  const [v, o, a] = await Promise.all([
    ctx.supabase.from("visits").select("customer_id, occurred_at").in("customer_id", ids).is("deleted_at", null).order("occurred_at", { ascending: false }),
    ctx.supabase
      .from("orders")
      .select("customer_id, order_date")
      .in("customer_id", ids)
      .is("deleted_at", null)
      .not("status", "in", "(draft,cancelled)")
      .order("order_date", { ascending: false }),
    ctx.supabase
      .from("prospecting_activities")
      .select("customer_id, occurred_at")
      .in("customer_id", ids)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false }),
  ]);
  const first = (rows: { customer_id: string }[] | null, key: string) => {
    const m = new Map<string, string>();
    for (const r of rows ?? []) if (!m.has(r.customer_id)) m.set(r.customer_id, (r as unknown as Record<string, string>)[key]);
    return m;
  };
  return { visits: first(v.data, "occurred_at"), orders: first(o.data, "order_date"), acts: first(a.data, "occurred_at") };
}

/** Clientes cuya última compra válida supera el umbral de inactividad configurado */
export async function reactivationCandidates(ctx: AppContext): Promise<{ id: string; trade_name: string; city: string | null; last_order_date: ISODate | null; days: number | null }[]> {
  const threshold = addDaysISO(todayISO(), -ctx.settings.inactivity_days);
  const { data: customers, error } = await ctx.supabase
    .from("customers")
    .select("id, trade_name, city, customer_since_date, status")
    .is("archived_at", null)
    .in("status", ["customer_new", "customer_active", "customer_inactive"]);
  if (error) throw new Error(`No se han podido cargar los clientes: ${error.message}`);
  const ids = customers.map((c) => c.id as string);
  const { orders } = await lastDates(ctx, ids);
  const today = todayISO();
  const out = [];
  for (const c of customers) {
    const last = orders.get(c.id) ?? null;
    const ref = last ?? (c.customer_since_date as string | null);
    if (ref && ref < threshold) {
      out.push({
        id: c.id as string,
        trade_name: c.trade_name as string,
        city: c.city as string | null,
        last_order_date: last,
        days: Math.round((Date.parse(today) - Date.parse(ref)) / 86400000),
      });
    }
  }
  return out.sort((a, b) => (b.days ?? 0) - (a.days ?? 0));
}

export async function listCustomers(ctx: AppContext, f: CustomerFilters): Promise<{ rows: CustomerListRow[]; total: number }> {
  const pageSize = f.pageSize ?? 50;
  const page = Math.max(1, f.page ?? 1);
  let q = ctx.supabase.from("customers").select("*", { count: "exact" });
  q = f.archived ? q.not("archived_at", "is", null) : q.is("archived_at", null);
  if (f.status) q = q.eq("status", f.status);
  if (f.type) q = q.eq("establishment_type_id", f.type);
  if (f.zone) q = q.eq("zone_id", f.zone);
  if (f.city) q = q.ilike("city", f.city);
  if (f.q) {
    const t = f.q.replace(/[%,()]/g, " ").trim();
    const digits = t.replace(/\D/g, "");
    const ors = [`trade_name.ilike.%${t}%`, `legal_name.ilike.%${t}%`, `city.ilike.%${t}%`, `contact_name.ilike.%${t}%`];
    if (digits.length >= 3) ors.push(`phone.ilike.%${digits}%`);
    q = q.or(ors.join(","));
  }
  if (f.reactivation) {
    const ids = (await reactivationCandidates(ctx)).map((c) => c.id);
    if (!ids.length) return { rows: [], total: 0 };
    q = q.in("id", ids);
  }
  const { data, count, error } = await q
    .order("trade_name")
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw new Error(`No se han podido cargar los clientes: ${error.message}`);
  const rows = data as Customer[];
  const ld = await lastDates(ctx, rows.map((r) => r.id));
  return {
    rows: rows.map((r) => ({
      ...r,
      last_visit_at: ld.visits.get(r.id) ?? null,
      last_order_date: ld.orders.get(r.id) ?? null,
      last_activity_at: ld.acts.get(r.id) ?? null,
    })),
    total: count ?? rows.length,
  };
}

/** Último contacto = la más reciente entre visita y prospección */
export function lastContact(r: Pick<CustomerListRow, "last_visit_at" | "last_activity_at">): ISODate | null {
  const xs = [r.last_visit_at, r.last_activity_at].filter(Boolean) as string[];
  if (!xs.length) return null;
  return madridDateKey(xs.sort().at(-1)!);
}

// -----------------------------------------------------------------------------
// Posibles duplicados
// -----------------------------------------------------------------------------
const STOP = new Set(["la", "el", "los", "las", "de", "del", "y", "sl", "sa", "slu", "cb", "s", "l", "u"]);

export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .join(" ");
}

export async function findDuplicateGroups(ctx: AppContext): Promise<Customer[][]> {
  const { data, error } = await ctx.supabase.from("customers").select("*").is("archived_at", null).order("created_at");
  if (error) throw new Error(`No se han podido cargar los clientes: ${error.message}`);
  const rows = data as Customer[];
  const byKey = new Map<string, Customer[]>();
  const add = (k: string, c: Customer) => byKey.set(k, [...(byKey.get(k) ?? []), c]);
  for (const c of rows) {
    const n = normalizeName(c.trade_name);
    if (n) add(`n:${n}|${normalizeName(c.city ?? "")}`, c);
    const phone = (c.phone ?? "").replace(/\D/g, "").slice(-9);
    if (phone.length === 9) add(`p:${phone}`, c);
  }
  const seen = new Set<string>();
  const groups: Customer[][] = [];
  for (const g of byKey.values()) {
    if (g.length < 2) continue;
    const sig = g.map((c) => c.id).sort().join(",");
    if (seen.has(sig)) continue;
    seen.add(sig);
    groups.push(g);
  }
  return groups;
}
