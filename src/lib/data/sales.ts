import "server-only";
import type { AppContext } from "./context";
import type { OrderWithTotals } from "@/lib/domain/revenue";
import { periodRevenue } from "@/lib/domain/revenue";
import { computeCommission, type CommissionResult } from "@/lib/domain/commissions";
import { monthEndISO, type ISODate } from "@/lib/domain/dates";
import type { Order } from "@/lib/types";
import { fetchAll } from "./paginate";

export type OrderFull = Order & OrderWithTotals;

async function chunked<T>(ids: string[], size: number, fn: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += size) out.push(...(await fn(ids.slice(i, i + size))));
  return out;
}

/** Añade totales (vista order_totals) y devoluciones a una lista de pedidos */
export async function attachTotals(ctx: AppContext, orders: Order[]): Promise<OrderFull[]> {
  if (orders.length === 0) return [];
  const ids = orders.map((o) => o.id);
  const totals = await chunked(ids, 150, async (chunk) => {
    const { data, error } = await ctx.supabase.from("order_totals").select("*").in("order_id", chunk);
    if (error) throw new Error(`No se han podido cargar los importes: ${error.message}`);
    return data as { order_id: string; base_cents: number; vat_cents: number; total_cents: number }[];
  });
  const returns = await chunked(ids, 150, async (chunk) => {
    const { data, error } = await ctx.supabase.from("order_returns").select("order_id, return_date, base_cents, total_cents").in("order_id", chunk);
    if (error) throw new Error(`No se han podido cargar las devoluciones: ${error.message}`);
    return data as { order_id: string; return_date: string; base_cents: number; total_cents: number }[];
  });
  const tMap = new Map(totals.map((t) => [t.order_id, t]));
  return orders.map((o) => {
    const t = tMap.get(o.id);
    return {
      ...o,
      base_cents: Number(t?.base_cents ?? 0),
      vat_cents: Number(t?.vat_cents ?? 0),
      total_cents: Number(t?.total_cents ?? 0),
      returns: returns
        .filter((r) => r.order_id === o.id)
        .map((r) => ({ return_date: r.return_date, base_cents: Number(r.base_cents), total_cents: Number(r.total_cents) })),
    };
  });
}

/**
 * Pedidos relevantes para un rango: con fecha de pedido o de cobro en el rango,
 * o con alguna devolución en el rango.
 */
export async function loadOrdersForRange(ctx: AppContext, from: ISODate, to: ISODate): Promise<OrderFull[]> {
  const { supabase } = ctx;
  const [byDates, rets] = await Promise.all([
    fetchAll<Order>(
      (a, b) =>
        supabase
          .from("orders")
          .select("*")
          .is("deleted_at", null)
          .or(`and(order_date.gte.${from},order_date.lte.${to}),and(paid_date.gte.${from},paid_date.lte.${to})`)
          .order("order_date")
          .range(a, b),
      "los pedidos",
    ),
    fetchAll<{ order_id: string }>(
      (a, b) => supabase.from("order_returns").select("order_id").gte("return_date", from).lte("return_date", to).range(a, b),
      "las devoluciones",
    ),
  ]);
  const have = new Set(byDates.map((o) => o.id));
  const missing = [...new Set(rets.map((r) => r.order_id))].filter((id) => !have.has(id));
  let extra: Order[] = [];
  if (missing.length) {
    extra = await chunked(missing, 150, async (chunk) => {
      const { data, error } = await supabase.from("orders").select("*").in("id", chunk).is("deleted_at", null);
      if (error) throw new Error(error.message);
      return data as Order[];
    });
  }
  return attachTotals(ctx, [...byDates, ...extra]);
}

export interface MonthCommission {
  monthStart: ISODate;
  revenue: ReturnType<typeof periodRevenue>;
  result: CommissionResult;
}

export function monthCommission(ctx: AppContext, orders: OrderFull[], monthStart: ISODate): MonthCommission {
  const revenue = periodRevenue(orders, monthStart, monthEndISO(monthStart), ctx.settings.countable_order_statuses, ctx.commission.base_type);
  return { monthStart, revenue, result: computeCommission(revenue.computable.netCents, ctx.tiers, ctx.commission.method) };
}
