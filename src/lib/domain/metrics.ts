/**
 * Métricas comerciales: definiciones explícitas de numerador, denominador y criterios.
 * Ninguna función devuelve NaN/Infinity: si el denominador no alcanza el mínimo
 * se devuelve { kind: "insufficient" } y la interfaz muestra «Datos insuficientes».
 */
import { differenceInCalendarDays, parseISO } from "date-fns";
import { addDaysISO, madridDateKey, type ISODate } from "./dates";

export type Ratio =
  | { kind: "ok"; value: number; numerator: number; denominator: number }
  | { kind: "insufficient"; numerator: number; denominator: number };

/** Porcentaje num/den × 100. Requiere den ≥ minDenominator (por defecto 1). */
export function rate(numerator: number, denominator: number, minDenominator = 1): Ratio {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator < Math.max(1, minDenominator)) {
    return { kind: "insufficient", numerator, denominator };
  }
  return { kind: "ok", value: (numerator / denominator) * 100, numerator, denominator };
}

/** Media num/den (sin ×100). */
export function average(numerator: number, denominator: number): Ratio {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return { kind: "insufficient", numerator, denominator };
  }
  return { kind: "ok", value: numerator / denominator, numerator, denominator };
}

export type Change =
  | { kind: "pct"; value: number } // variación porcentual normal
  | { kind: "from_zero"; delta: number } // el periodo anterior era 0: no hay % significativo
  | { kind: "unchanged_zero" } // ambos 0
  | { kind: "no_data" }; // falta alguno de los valores

/** Variación respecto al periodo anterior, sin porcentajes engañosos cuando el anterior es 0. */
export function compare(current: number | null | undefined, previous: number | null | undefined): Change {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous)) {
    return { kind: "no_data" };
  }
  if (previous === 0) return current === 0 ? { kind: "unchanged_zero" } : { kind: "from_zero", delta: current };
  return { kind: "pct", value: ((current - previous) / Math.abs(previous)) * 100 };
}

export function formatRatio(r: Ratio, decimals = 1): string {
  if (r.kind === "insufficient") return "Datos insuficientes";
  return `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: decimals, minimumFractionDigits: 0 }).format(r.value)} %`;
}

export function formatNumber(n: number, decimals = 0): string {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: decimals, minimumFractionDigits: 0, useGrouping: "always" }).format(n);
}

// -----------------------------------------------------------------------------
// Prospección
// -----------------------------------------------------------------------------
export interface ResultFlags {
  is_effective_contact: boolean;
  is_interest: boolean;
  is_rejection: boolean;
}

export interface ActivityRow {
  id: string;
  occurred_at: string;
  is_provisional: boolean;
  customer_id: string | null;
  result_id: string | null;
  deleted_at?: string | null;
}

export interface ProspectingCounts {
  /** Puertas frías: todas las actividades no eliminadas (incluidas provisionales) */
  coldCalls: number;
  provisional: number;
  /** Actividades cuyo resultado está marcado como contacto efectivo */
  effectiveContacts: number;
  /** Actividades cuyo resultado está marcado como interés */
  interested: number;
  /** Actividades con resultado de rechazo */
  rejections: number;
  /** Actividades sin resultado registrado (no provisionales) */
  withoutResult: number;
}

export function countProspecting(rows: ActivityRow[], results: Map<string, ResultFlags>): ProspectingCounts {
  const c: ProspectingCounts = { coldCalls: 0, provisional: 0, effectiveContacts: 0, interested: 0, rejections: 0, withoutResult: 0 };
  for (const r of rows) {
    if (r.deleted_at) continue;
    c.coldCalls++;
    if (r.is_provisional) c.provisional++;
    const f = r.result_id ? results.get(r.result_id) : undefined;
    if (!f) {
      if (!r.is_provisional) c.withoutResult++;
      continue;
    }
    if (f.is_effective_contact) c.effectiveContacts++;
    if (f.is_interest) c.interested++;
    if (f.is_rejection) c.rejections++;
  }
  return c;
}

/** Tasa de contacto efectivo = contactos efectivos / puertas frías × 100 */
export function effectiveContactRate(c: ProspectingCounts): Ratio {
  return rate(c.effectiveContacts, c.coldCalls);
}

/** Tasa de interés = actividades con interés / contactos efectivos × 100 */
export function interestRate(c: ProspectingCounts): Ratio {
  return rate(c.interested, c.effectiveContacts);
}

// -----------------------------------------------------------------------------
// Conversión por cohortes
// -----------------------------------------------------------------------------
export interface CohortCustomer {
  id: string;
  /** Fecha del primer contacto (define la cohorte) */
  first_contact_date: ISODate | null;
  /** Fecha en que pasó a cliente; null si nunca */
  customer_since_date: ISODate | null;
  /** true si el registro empezó como prospecto (no se dio de alta ya como cliente) */
  started_as_prospect: boolean;
}

export interface CohortResult {
  cohortSize: number;
  converted: number;
  /** No convertidos cuyo primer contacto es más reciente que el periodo de maduración */
  immature: number;
  /** No convertidos ya maduros */
  notConverted: number;
  conversion: Ratio;
  /** Conversión sólo sobre prospectos maduros + convertidos (excluye los que aún no han tenido tiempo) */
  matureConversion: Ratio;
}

/**
 * Cohorte = prospectos cuyo primer contacto cae en [from, to].
 * Convertido = customer_since_date ≤ asOf.
 */
export function cohortConversion(
  customers: CohortCustomer[],
  from: ISODate,
  to: ISODate,
  asOf: ISODate,
  maturityDays: number,
): CohortResult {
  const cohort = customers.filter(
    (c) => c.started_as_prospect && c.first_contact_date && c.first_contact_date >= from && c.first_contact_date <= to,
  );
  const maturityLimit = addDaysISO(asOf, -maturityDays);
  let converted = 0;
  let immature = 0;
  for (const c of cohort) {
    if (c.customer_since_date && c.customer_since_date <= asOf) converted++;
    else if (c.first_contact_date! > maturityLimit) immature++;
  }
  const notConverted = cohort.length - converted - immature;
  return {
    cohortSize: cohort.length,
    converted,
    immature,
    notConverted,
    conversion: rate(converted, cohort.length),
    matureConversion: rate(converted, converted + notConverted),
  };
}

// -----------------------------------------------------------------------------
// Visitas y cierre
// -----------------------------------------------------------------------------
export interface VisitRow {
  id: string;
  customer_id: string;
  occurred_at: string;
  visit_kind: "prospect" | "customer";
  is_commercial: boolean;
  deleted_at?: string | null;
}

export interface OrderLite {
  id: string;
  customer_id: string;
  order_date: ISODate;
  status: string;
  visit_id: string | null;
  net_base_cents: number;
  deleted_at?: string | null;
}

export const INVALID_ORDER_STATUSES = new Set(["draft", "cancelled"]);

/** Pedido válido = no borrador, no cancelado, no eliminado (las devoluciones se descuentan aparte) */
export function isValidOrder(o: Pick<OrderLite, "status" | "deleted_at">): boolean {
  return !o.deleted_at && !INVALID_ORDER_STATUSES.has(o.status);
}

/**
 * Una visita «genera pedido» si existe un pedido válido vinculado explícitamente
 * (orders.visit_id) o, en su defecto, un pedido válido del mismo cliente el mismo día.
 */
export function visitsWithOrder(visits: VisitRow[], orders: OrderLite[]): Set<string> {
  const valid = orders.filter(isValidOrder);
  const linked = new Set(valid.map((o) => o.visit_id).filter(Boolean) as string[]);
  const sameDay = new Set(valid.map((o) => `${o.customer_id}|${o.order_date}`));
  const out = new Set<string>();
  for (const v of visits) {
    if (linked.has(v.id) || sameDay.has(`${v.customer_id}|${madridDateKey(v.occurred_at)}`)) out.add(v.id);
  }
  return out;
}

export interface CloseRates {
  all: Ratio;
  prospects: Ratio;
  customers: Ratio;
}

/** Tasa de cierre = visitas comerciales elegibles con ≥1 pedido / visitas comerciales elegibles × 100 */
export function closeRates(visits: VisitRow[], orders: OrderLite[]): CloseRates {
  const eligible = visits.filter((v) => !v.deleted_at && v.is_commercial);
  const won = visitsWithOrder(eligible, orders);
  const by = (kind?: "prospect" | "customer") => {
    const set = kind ? eligible.filter((v) => v.visit_kind === kind) : eligible;
    return rate(set.filter((v) => won.has(v.id)).length, set.length);
  };
  return { all: by(), prospects: by("prospect"), customers: by("customer") };
}

// -----------------------------------------------------------------------------
// Ventas
// -----------------------------------------------------------------------------
/** Ticket medio = base neta de pedidos válidos / número de pedidos válidos */
export function averageTicket(orders: OrderLite[]): Ratio {
  const valid = orders.filter(isValidOrder);
  return average(
    valid.reduce((s, o) => s + o.net_base_cents, 0),
    valid.length,
  );
}

/** Frecuencia de recompra: media de días entre pedidos válidos consecutivos del mismo cliente */
export function repurchaseFrequencyDays(orders: OrderLite[]): Ratio {
  const byCustomer = new Map<string, ISODate[]>();
  for (const o of orders.filter(isValidOrder)) {
    const list = byCustomer.get(o.customer_id) ?? [];
    list.push(o.order_date);
    byCustomer.set(o.customer_id, list);
  }
  let total = 0;
  let gaps = 0;
  for (const dates of byCustomer.values()) {
    const sorted = [...new Set(dates)].sort();
    for (let i = 1; i < sorted.length; i++) {
      total += differenceInCalendarDays(parseISO(sorted[i]), parseISO(sorted[i - 1]));
      gaps++;
    }
  }
  return average(total, gaps);
}

/** Tiempo medio (días) desde el primer contacto hasta el primer pedido válido */
export function timeToFirstOrderDays(
  customers: { id: string; first_contact_date: ISODate | null }[],
  orders: OrderLite[],
): Ratio {
  const firstOrder = new Map<string, ISODate>();
  for (const o of orders.filter(isValidOrder)) {
    const prev = firstOrder.get(o.customer_id);
    if (!prev || o.order_date < prev) firstOrder.set(o.customer_id, o.order_date);
  }
  let total = 0;
  let n = 0;
  for (const c of customers) {
    const fo = firstOrder.get(c.id);
    if (!c.first_contact_date || !fo || fo < c.first_contact_date) continue;
    total += differenceInCalendarDays(parseISO(fo), parseISO(c.first_contact_date));
    n++;
  }
  return average(total, n);
}

/** Agrupa valores por día civil (Madrid) */
export function bucketByDay<T>(rows: T[], getInstant: (r: T) => string | Date, days: ISODate[]): Map<ISODate, number> {
  const map = new Map<ISODate, number>(days.map((d) => [d, 0]));
  for (const r of rows) {
    const k = madridDateKey(getInstant(r));
    if (map.has(k)) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}
