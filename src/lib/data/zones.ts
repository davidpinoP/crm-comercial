import "server-only";
import type { AppContext } from "./context";
import { eachDayISO, isoWeekday, type ISODate } from "@/lib/domain/dates";
import type { Zone } from "@/lib/types";

/** Zona prevista para cada día: sobrescritura de fecha > asignación semanal > ninguna */
export async function zonesForDays(ctx: AppContext, from: ISODate, to: ISODate): Promise<Map<ISODate, Zone | null>> {
  const [wd, ov] = await Promise.all([
    ctx.supabase.from("zone_weekday_assignments").select("weekday, zone_id"),
    ctx.supabase.from("zone_date_overrides").select("date, zone_id").gte("date", from).lte("date", to),
  ]);
  if (wd.error) throw new Error(`No se han podido cargar las zonas: ${wd.error.message}`);
  if (ov.error) throw new Error(`No se han podido cargar las zonas: ${ov.error.message}`);
  const byId = new Map(ctx.zones.map((z) => [z.id, z]));
  const weekly = new Map((wd.data as { weekday: number; zone_id: string }[]).map((r) => [r.weekday, r.zone_id]));
  const overrides = new Map((ov.data as { date: string; zone_id: string | null }[]).map((r) => [r.date, r.zone_id]));
  const out = new Map<ISODate, Zone | null>();
  for (const d of eachDayISO(from, to)) {
    const id = overrides.has(d) ? overrides.get(d)! : (weekly.get(isoWeekday(d)) ?? null);
    out.set(d, id ? (byId.get(id) ?? null) : null);
  }
  return out;
}

export async function weekdayAssignments(ctx: AppContext): Promise<Map<number, string>> {
  const { data, error } = await ctx.supabase.from("zone_weekday_assignments").select("weekday, zone_id");
  if (error) throw new Error(error.message);
  return new Map((data as { weekday: number; zone_id: string }[]).map((r) => [r.weekday, r.zone_id]));
}
