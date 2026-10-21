import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  AppSettings,
  CommissionSettings,
  CommissionTierRow,
  EstablishmentType,
  ProductCategory,
  Profile,
  ProspectingResult,
  WorkdayRow,
  Zone,
} from "@/lib/types";
import type { WorkCalendar } from "@/lib/domain/goals";
import type { CommissionTier } from "@/lib/domain/commissions";
import { DEFAULT_COUNTABLE } from "@/lib/domain/revenue";

/** Usuario autenticado + cliente con su sesión. Redirige al login si no hay sesión. */
export const getAuth = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  return { supabase, user };
});

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`No se han podido cargar ${what}: ${res.error.message}`);
  return res.data as T;
}

const FALLBACK_SETTINGS = (userId: string): AppSettings => ({
  user_id: userId,
  inactivity_days: 60,
  cohort_maturity_days: 60,
  countable_order_statuses: DEFAULT_COUNTABLE,
  working_weekdays: [1, 2, 3, 4, 5],
  default_work_hours: 8,
  work_start_time: "09:00",
  work_end_time: "18:00",
  close_rate_include_followups: false,
  theme: "system",
});

/** Configuración y catálogos del usuario (una vez por petición) */
export const getContext = cache(async () => {
  const { supabase, user } = await getAuth();
  const [settings0, profile, types, results, categories, zones, commission0, tiers] = await Promise.all([
    supabase.from("app_settings").select("*").maybeSingle(),
    supabase.from("profiles").select("*").maybeSingle(),
    supabase.from("establishment_types").select("*").order("sort_order").order("name"),
    supabase.from("prospecting_results").select("*").order("sort_order"),
    supabase.from("product_categories").select("*").order("sort_order").order("name"),
    supabase.from("commercial_zones").select("*, zone_populations(id, population)").is("archived_at", null).order("name"),
    supabase.from("commission_settings").select("*").maybeSingle(),
    supabase.from("commission_tiers").select("*").order("lower_cents"),
  ]);

  let settings = settings0;
  let commission = commission0;
  // Usuarios creados antes de aplicar las migraciones: crear valores mínimos
  if (!settings.error && !settings.data) {
    await supabase.rpc("ensure_my_defaults");
    settings = await supabase.from("app_settings").select("*").maybeSingle();
    commission = await supabase.from("commission_settings").select("*").maybeSingle();
  }

  const s = (must(settings, "la configuración") as AppSettings | null) ?? FALLBACK_SETTINGS(user.id);
  return {
    supabase,
    user,
    settings: { ...s, default_work_hours: Number(s.default_work_hours) },
    profile: must(profile, "el perfil") as Profile | null,
    types: must(types, "los tipos de establecimiento") as EstablishmentType[],
    results: must(results, "los resultados de prospección") as ProspectingResult[],
    categories: must(categories, "las categorías") as ProductCategory[],
    zones: must(zones, "las zonas") as Zone[],
    commission: ((must(commission, "las comisiones") as CommissionSettings | null) ?? {
      method: "flat",
      method_confirmed: false,
      base_type: "net",
    }) as CommissionSettings,
    tiers: (must(tiers, "los tramos") as CommissionTierRow[]).map(
      (t): CommissionTier => ({ lowerCents: Number(t.lower_cents), lowerInclusive: t.lower_inclusive, rateBp: t.rate_bp }),
    ),
  };
});

export type AppContext = Awaited<ReturnType<typeof getContext>>;

/** Calendario laboral con las excepciones del rango */
export async function getWorkCalendar(ctx: AppContext, from: string, to: string): Promise<WorkCalendar> {
  const { data, error } = await ctx.supabase.from("workdays").select("*").gte("date", from).lte("date", to);
  if (error) throw new Error(`No se ha podido cargar el calendario laboral: ${error.message}`);
  return {
    workingWeekdays: ctx.settings.working_weekdays,
    defaultHours: ctx.settings.default_work_hours,
    overrides: new Map(
      (data as WorkdayRow[]).map((w) => [w.date, { kind: w.kind, hours_worked: w.hours_worked == null ? null : Number(w.hours_worked) }]),
    ),
  };
}

export function resultFlags(ctx: AppContext) {
  return new Map(ctx.results.map((r) => [r.id, r]));
}
