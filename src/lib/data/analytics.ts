import "server-only";
import type { AppContext } from "./context";
import { loadOrdersForRange } from "./sales";
import { fetchAll } from "./paginate";
import { addDaysISO, startOfMadridDay, type ISODate } from "@/lib/domain/dates";
import type { CustomerLite, PeriodData, StatusChange } from "@/lib/domain/analytics";
import type { VisitRow } from "@/lib/domain/metrics";

/** Registros originales de un rango para calcular cualquier métrica (paginado, sin límites silenciosos) */
export async function loadPeriodData(ctx: AppContext, from: ISODate, to: ISODate): Promise<PeriodData> {
  const { supabase } = ctx;
  const start = startOfMadridDay(from).toISOString();
  const end = startOfMadridDay(addDaysISO(to, 1)).toISOString();
  const [activities, visits, orders, followUpsDone, statusChanges, customers, initials] = await Promise.all([
    fetchAll(
      (a, b) =>
        supabase
          .from("prospecting_activities")
          .select("id, occurred_at, customer_id, result_id, is_provisional, city, establishment_type_id")
          .is("deleted_at", null)
          .gte("occurred_at", start)
          .lt("occurred_at", end)
          .order("occurred_at")
          .range(a, b),
      "las prospecciones",
    ),
    fetchAll(
      (a, b) =>
        supabase
          .from("visits")
          .select("id, customer_id, occurred_at, visit_kind, is_commercial")
          .is("deleted_at", null)
          .gte("occurred_at", start)
          .lt("occurred_at", end)
          .order("occurred_at")
          .range(a, b),
      "las visitas",
    ),
    loadOrdersForRange(ctx, from, to),
    fetchAll(
      (a, b) =>
        supabase.from("follow_ups").select("id, customer_id, completed_at").eq("status", "done").gte("completed_at", start).lt("completed_at", end).range(a, b),
      "los seguimientos",
    ),
    fetchAll(
      (a, b) =>
        supabase.from("customer_status_history").select("customer_id, from_status, to_status, changed_at").gte("changed_at", start).lt("changed_at", end).range(a, b),
      "el historial de estados",
    ),
    fetchAll(
      (a, b) =>
        supabase
          .from("customers")
          .select("id, status, city, zone_id, establishment_type_id, first_contact_date, customer_since_date, created_at")
          .order("created_at")
          .range(a, b),
      "los clientes",
    ),
    fetchAll(
      (a, b) => supabase.from("customer_status_history").select("customer_id, to_status").is("from_status", null).range(a, b),
      "el historial de estados",
    ),
  ]);
  const initial = new Map((initials as { customer_id: string; to_status: string }[]).map((r) => [r.customer_id, r.to_status]));
  return {
    activities: activities as PeriodData["activities"],
    visits: visits as VisitRow[],
    orders,
    followUpsDone: followUpsDone as PeriodData["followUpsDone"],
    statusChanges: statusChanges as StatusChange[],
    customers: (customers as Omit<CustomerLite, "initial_status">[]).map((c) => ({ ...c, initial_status: initial.get(c.id) ?? null })),
  };
}
