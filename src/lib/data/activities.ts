import "server-only";
import type { AppContext } from "./context";
import type { ProspectingActivity } from "@/lib/types";
import { startOfMadridDay, addDaysISO, type ISODate } from "@/lib/domain/dates";

export type ActivityWithCustomer = ProspectingActivity & {
  customer: { id: string; trade_name: string; city: string | null; status: string } | null;
};

export async function loadActivities(
  ctx: AppContext,
  from: ISODate,
  to: ISODate,
  opts: { resultId?: string; onlyIncomplete?: boolean; customerId?: string; limit?: number; includeDeleted?: boolean } = {},
): Promise<ActivityWithCustomer[]> {
  let q = ctx.supabase
    .from("prospecting_activities")
    .select("*, customer:customers(id, trade_name, city, status)")
    .gte("occurred_at", startOfMadridDay(from).toISOString())
    .lt("occurred_at", startOfMadridDay(addDaysISO(to, 1)).toISOString())
    .order("occurred_at", { ascending: false })
    .limit(opts.limit ?? 2000);
  if (!opts.includeDeleted) q = q.is("deleted_at", null);
  if (opts.resultId === "none") q = q.is("result_id", null);
  else if (opts.resultId) q = q.eq("result_id", opts.resultId);
  if (opts.onlyIncomplete) q = q.eq("is_provisional", true);
  if (opts.customerId) q = q.eq("customer_id", opts.customerId);
  const { data, error } = await q;
  if (error) throw new Error(`No se han podido cargar las prospecciones: ${error.message}`);
  return data as ActivityWithCustomer[];
}
