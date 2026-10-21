/**
 * Agregados comerciales de un periodo a partir de los registros originales.
 * No se guarda ningún contador: todo se recalcula desde las filas, así que editar
 * o eliminar una actividad se refleja de inmediato y sin inconsistencias.
 *
 * Definiciones (periodo [from, to], días civiles de Madrid):
 *  - Puertas frías: actividades de prospección no eliminadas (incluidas provisionales).
 *  - Contactos efectivos / interesados: según las banderas del resultado (configurables).
 *  - Nuevos prospectos: establecimientos cuyo primer estado fue de prospecto y se crearon en el periodo.
 *  - Visitas: filas de «visits» no eliminadas (una visita física = una fila).
 *  - Nuevos clientes: clientes cuyo estado pasó de prospecto a cliente nuevo/activo en el periodo.
 *  - Clientes reactivados: paso de «cliente inactivo» a «cliente activo/nuevo» en el periodo.
 *  - Pedidos: pedidos válidos (ni borrador ni cancelado) con fecha en el periodo.
 *  - Facturación: base computable neta (ver revenue.ts).
 */
import { eachDayISO, madridDateKey, type ISODate } from "./dates";
import { countProspecting, isValidOrder, type ActivityRow, type ProspectingCounts, type ResultFlags, type VisitRow } from "./metrics";
import { periodRevenue, type OrderWithTotals, type PeriodRevenue, type BaseType } from "./revenue";

export interface StatusChange {
  customer_id: string;
  from_status: string | null;
  to_status: string;
  changed_at: string;
}

export interface CustomerLite {
  id: string;
  status: string;
  city: string | null;
  zone_id: string | null;
  establishment_type_id: string | null;
  first_contact_date: ISODate | null;
  customer_since_date: ISODate | null;
  created_at: string;
  /** Primer estado registrado en el historial */
  initial_status: string | null;
}

export interface PeriodData {
  activities: (ActivityRow & { city?: string | null; establishment_type_id?: string | null })[];
  visits: VisitRow[];
  orders: (OrderWithTotals & { visit_id?: string | null })[];
  followUpsDone: { id: string; customer_id: string; completed_at: string }[];
  statusChanges: StatusChange[];
  customers: CustomerLite[];
}

export interface PeriodSnapshot {
  prospecting: ProspectingCounts;
  newProspects: number;
  visits: { total: number; prospect: number; customer: number; commercial: number };
  followUpsDone: number;
  newCustomers: number;
  reactivated: number;
  revenue: PeriodRevenue;
  validOrders: number;
}

const isProspectStatus = (s: string | null | undefined) => !!s && !s.startsWith("customer_");
const inDay = (iso: string, from: ISODate, to: ISODate) => {
  const d = madridDateKey(iso);
  return d >= from && d <= to;
};

export function newCustomerIds(changes: StatusChange[], from: ISODate, to: ISODate): Set<string> {
  return new Set(
    changes
      .filter((c) => inDay(c.changed_at, from, to) && (c.to_status === "customer_new" || c.to_status === "customer_active") && isProspectStatus(c.from_status))
      .map((c) => c.customer_id),
  );
}

export function reactivatedIds(changes: StatusChange[], from: ISODate, to: ISODate): Set<string> {
  return new Set(
    changes
      .filter((c) => inDay(c.changed_at, from, to) && c.from_status === "customer_inactive" && (c.to_status === "customer_active" || c.to_status === "customer_new"))
      .map((c) => c.customer_id),
  );
}

export function snapshot(
  data: PeriodData,
  from: ISODate,
  to: ISODate,
  flags: Map<string, ResultFlags>,
  countable: readonly string[],
  baseType: BaseType = "net",
): PeriodSnapshot {
  const acts = data.activities.filter((a) => !a.deleted_at && inDay(a.occurred_at, from, to));
  const visits = data.visits.filter((v) => !v.deleted_at && inDay(v.occurred_at, from, to));
  return {
    prospecting: countProspecting(acts, flags),
    newProspects: data.customers.filter((c) => inDay(c.created_at, from, to) && isProspectStatus(c.initial_status)).length,
    visits: {
      total: visits.length,
      prospect: visits.filter((v) => v.visit_kind === "prospect").length,
      customer: visits.filter((v) => v.visit_kind === "customer").length,
      commercial: visits.filter((v) => v.is_commercial).length,
    },
    followUpsDone: data.followUpsDone.filter((f) => inDay(f.completed_at, from, to)).length,
    newCustomers: newCustomerIds(data.statusChanges, from, to).size,
    reactivated: reactivatedIds(data.statusChanges, from, to).size,
    revenue: periodRevenue(data.orders, from, to, countable, baseType),
    validOrders: data.orders.filter((o) => isValidOrder(o) && o.order_date >= from && o.order_date <= to).length,
  };
}

export interface DailyPoint {
  date: ISODate;
  coldCalls: number;
  effectiveContacts: number;
  visits: number;
  orders: number;
  revenueCents: number;
}

export function dailySeries(
  data: PeriodData,
  from: ISODate,
  to: ISODate,
  flags: Map<string, ResultFlags>,
  countable: readonly string[],
  baseType: BaseType = "net",
): DailyPoint[] {
  return eachDayISO(from, to).map((d) => {
    const s = snapshot(data, d, d, flags, countable, baseType);
    return {
      date: d,
      coldCalls: s.prospecting.coldCalls,
      effectiveContacts: s.prospecting.effectiveContacts,
      visits: s.visits.total,
      orders: s.validOrders,
      revenueCents: s.revenue.computable.netCents,
    };
  });
}

/** Aplica filtros por atributos del establecimiento (zona, población, tipo, estado) */
export function filterByCustomer(
  data: PeriodData,
  f: { zone?: string; city?: string; type?: string; status?: string },
): PeriodData {
  if (!f.zone && !f.city && !f.type && !f.status) return data;
  const byId = new Map(data.customers.map((c) => [c.id, c]));
  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  const match = (c: CustomerLite | undefined, own?: { city?: string | null; establishment_type_id?: string | null }) => {
    const city = c?.city ?? own?.city ?? null;
    const type = c?.establishment_type_id ?? own?.establishment_type_id ?? null;
    if (f.zone && c?.zone_id !== f.zone) return false;
    if (f.city && norm(city) !== norm(f.city)) return false;
    if (f.type && type !== f.type) return false;
    if (f.status && c?.status !== f.status) return false;
    return true;
  };
  return {
    activities: data.activities.filter((a) => match(a.customer_id ? byId.get(a.customer_id) : undefined, a)),
    visits: data.visits.filter((v) => match(byId.get(v.customer_id))),
    orders: data.orders.filter((o) => match(byId.get(o.customer_id))),
    followUpsDone: data.followUpsDone.filter((x) => match(byId.get(x.customer_id))),
    statusChanges: data.statusChanges.filter((x) => match(byId.get(x.customer_id))),
    customers: data.customers.filter((c) => match(c)),
  };
}

/** Suma por clave (zona, tipo, cliente…) de la base computable del periodo */
export function revenueBy(
  data: PeriodData,
  from: ISODate,
  to: ISODate,
  key: (customer: CustomerLite | undefined, customerId: string) => string,
  countable: readonly string[],
  baseType: BaseType = "net",
): Map<string, number> {
  const byId = new Map(data.customers.map((c) => [c.id, c]));
  const groups = new Map<string, OrderWithTotals[]>();
  for (const o of data.orders) {
    const k = key(byId.get(o.customer_id), o.customer_id);
    groups.set(k, [...(groups.get(k) ?? []), o]);
  }
  const out = new Map<string, number>();
  for (const [k, os] of groups) out.set(k, periodRevenue(os, from, to, countable, baseType).computable.netCents);
  return out;
}
