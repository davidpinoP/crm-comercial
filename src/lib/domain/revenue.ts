/**
 * Contabilidad comercial de pedidos.
 *
 * Métricas separadas (todas por fecha del pedido salvo devoluciones y cobros):
 *  - Pedidos registrados: todos los pedidos no eliminados (incluye borradores y cancelados).
 *  - Ventas confirmadas: estado distinto de borrador y cancelado.
 *  - Ventas entregadas: entregado, facturado, cobrado o con devoluciones.
 *  - Facturación emitida: facturado o cobrado (o con devoluciones tras facturar).
 *  - Cobrado: estado «cobrado» o con fecha de cobro, por fecha de cobro.
 *  - Devoluciones: abonos por fecha de devolución.
 *
 * Base computable (objetivos y comisiones) de un periodo =
 *   Σ base de pedidos del periodo cuyo estado computa  −  Σ devoluciones del periodo de pedidos computables.
 * Un pedido devuelto fue una venta real: sus estados «devuelto parcial/totalmente» siguen computando
 * su venta original y la devolución se resta en el periodo en que se produce (sin borrar historial).
 */
import type { Cents } from "./money";
import type { ISODate } from "./dates";

export const ORDER_STATUSES = [
  "draft",
  "confirmed",
  "delivered",
  "invoiced",
  "paid",
  "cancelled",
  "partially_returned",
  "fully_returned",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const DEFAULT_COUNTABLE: OrderStatus[] = ["confirmed", "delivered", "invoiced", "paid", "partially_returned"];
const RETURNED: OrderStatus[] = ["partially_returned", "fully_returned"];

export interface ReturnRow {
  return_date: ISODate;
  base_cents: Cents;
  total_cents: Cents;
}

export interface OrderWithTotals {
  id: string;
  customer_id: string;
  order_date: ISODate;
  status: OrderStatus;
  paid_date?: ISODate | null;
  base_cents: Cents;
  vat_cents: Cents;
  total_cents: Cents;
  returns: ReturnRow[];
  deleted_at?: string | null;
}

export type BaseType = "net" | "gross";

export function orderCounts(o: Pick<OrderWithTotals, "status" | "deleted_at">, countable: readonly string[]): boolean {
  if (o.deleted_at) return false;
  if (o.status === "draft" || o.status === "cancelled") return false;
  return countable.includes(o.status) || RETURNED.includes(o.status);
}

const inRange = (d: ISODate | null | undefined, from: ISODate, to: ISODate) => !!d && d >= from && d <= to;

export interface PeriodRevenue {
  registered: { count: number; totalCents: Cents };
  confirmed: { count: number; baseCents: Cents; totalCents: Cents };
  delivered: { count: number; baseCents: Cents };
  invoiced: { count: number; baseCents: Cents; vatCents: Cents; totalCents: Cents };
  collected: { count: number; totalCents: Cents };
  returns: { count: number; baseCents: Cents; totalCents: Cents };
  computable: {
    salesCents: Cents;
    returnsCents: Cents;
    netCents: Cents;
    orderIds: string[];
    /** pedidos computables del periodo (para ticket medio) */
    orderCount: number;
  };
}

export function periodRevenue(
  orders: OrderWithTotals[],
  from: ISODate,
  to: ISODate,
  countable: readonly string[] = DEFAULT_COUNTABLE,
  baseType: BaseType = "net",
): PeriodRevenue {
  const r: PeriodRevenue = {
    registered: { count: 0, totalCents: 0 },
    confirmed: { count: 0, baseCents: 0, totalCents: 0 },
    delivered: { count: 0, baseCents: 0 },
    invoiced: { count: 0, baseCents: 0, vatCents: 0, totalCents: 0 },
    collected: { count: 0, totalCents: 0 },
    returns: { count: 0, baseCents: 0, totalCents: 0 },
    computable: { salesCents: 0, returnsCents: 0, netCents: 0, orderIds: [], orderCount: 0 },
  };
  const pick = (base: Cents, total: Cents) => (baseType === "net" ? base : total);

  for (const o of orders) {
    if (o.deleted_at) continue;
    const inPeriod = inRange(o.order_date, from, to);
    if (inPeriod) {
      r.registered.count++;
      r.registered.totalCents += o.total_cents;
      if (o.status !== "draft" && o.status !== "cancelled") {
        r.confirmed.count++;
        r.confirmed.baseCents += o.base_cents;
        r.confirmed.totalCents += o.total_cents;
      }
      if (["delivered", "invoiced", "paid", ...RETURNED].includes(o.status)) {
        r.delivered.count++;
        r.delivered.baseCents += o.base_cents;
      }
      if (o.status === "invoiced" || o.status === "paid") {
        r.invoiced.count++;
        r.invoiced.baseCents += o.base_cents;
        r.invoiced.vatCents += o.vat_cents;
        r.invoiced.totalCents += o.total_cents;
      }
      if (orderCounts(o, countable)) {
        r.computable.salesCents += pick(o.base_cents, o.total_cents);
        r.computable.orderIds.push(o.id);
        r.computable.orderCount++;
      }
    }
    const paidDate = o.paid_date ?? null;
    if (o.status !== "cancelled" && inRange(paidDate, from, to)) {
      r.collected.count++;
      r.collected.totalCents += o.total_cents;
    }
    for (const ret of o.returns) {
      if (!inRange(ret.return_date, from, to)) continue;
      r.returns.count++;
      r.returns.baseCents += ret.base_cents;
      r.returns.totalCents += ret.total_cents;
      if (orderCounts(o, countable)) r.computable.returnsCents += pick(ret.base_cents, ret.total_cents);
    }
  }
  r.computable.netCents = r.computable.salesCents - r.computable.returnsCents;
  return r;
}

/** Base neta de un pedido descontando todas sus devoluciones (para fichas y rankings) */
export function netOrderBase(o: Pick<OrderWithTotals, "base_cents" | "returns">): Cents {
  return o.base_cents - o.returns.reduce((s, r) => s + r.base_cents, 0);
}
