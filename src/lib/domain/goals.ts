/**
 * Objetivos y calendario laboral.
 * Día laborable = día de la semana marcado como laborable en Configuración,
 * salvo que exista una excepción (vacaciones, festivo, libre, o trabajo extra).
 */
import { eachDayISO, isoWeekday, type ISODate } from "./dates";
import { rate, type Ratio } from "./metrics";

export type DayKind = "work" | "vacation" | "holiday" | "off";

export interface WorkCalendar {
  workingWeekdays: number[];
  defaultHours: number;
  overrides: Map<ISODate, { kind: DayKind; hours_worked: number | null }>;
}

export function isWorkday(cal: WorkCalendar, date: ISODate): boolean {
  const o = cal.overrides.get(date);
  if (o) return o.kind === "work";
  return cal.workingWeekdays.includes(isoWeekday(date));
}

export function workdaysIn(cal: WorkCalendar, from: ISODate, to: ISODate): ISODate[] {
  if (from > to) return [];
  return eachDayISO(from, to).filter((d) => isWorkday(cal, d));
}

/** Horas trabajadas en un rango: las registradas o, si no constan, las horas por defecto de cada día laborable ya pasado */
export function hoursWorked(cal: WorkCalendar, from: ISODate, to: ISODate): { hours: number; recorded: boolean } {
  let hours = 0;
  let recorded = false;
  for (const d of workdaysIn(cal, from, to)) {
    const o = cal.overrides.get(d);
    if (o?.hours_worked != null) {
      hours += Number(o.hours_worked);
      recorded = true;
    } else hours += cal.defaultHours;
  }
  return { hours, recorded };
}

export interface GoalProgress {
  target: number;
  current: number;
  difference: number; // current − target (negativo = falta)
  remaining: number; // max(0, target − current)
  completion: Ratio;
  workdaysTotal: number;
  workdaysElapsed: number;
  /** Días laborables pendientes, incluido hoy si es laborable */
  workdaysRemaining: number;
  /** Ritmo diario necesario para llegar; null si no quedan días o ya se ha alcanzado */
  requiredPerDay: number | null;
  /** Estimación al cierre manteniendo el ritmo actual; null si aún no hay días transcurridos */
  projected: number | null;
  status: "no_target" | "achieved" | "on_track" | "behind" | "not_started" | "closed";
}

/**
 * @param today Día de referencia. Los días transcurridos son los laborables de [start, today);
 *              hoy cuenta como pendiente (aún se puede trabajar).
 */
export function goalProgress(
  target: number,
  current: number,
  start: ISODate,
  end: ISODate,
  today: ISODate,
  cal: WorkCalendar,
): GoalProgress {
  const all = workdaysIn(cal, start, end);
  const elapsed = all.filter((d) => d < today).length;
  const remainingDays = all.filter((d) => d >= today).length;
  const remaining = Math.max(0, target - current);
  const completion = target > 0 ? rate(current, target) : ({ kind: "insufficient", numerator: current, denominator: 0 } as Ratio);

  // Para la proyección, si hoy ya hay actividad se cuenta hoy como transcurrido
  const elapsedForPace = elapsed + (today >= start && today <= end && all.includes(today) && current > 0 ? 1 : 0);
  const projected = elapsedForPace > 0 ? (current / elapsedForPace) * all.length : null;

  let status: GoalProgress["status"];
  if (target <= 0) status = "no_target";
  else if (current >= target) status = "achieved";
  else if (today > end) status = "closed";
  else if (today < start) status = "not_started";
  else if (projected != null && projected >= target) status = "on_track";
  else status = "behind";

  return {
    target,
    current,
    difference: current - target,
    remaining,
    completion,
    workdaysTotal: all.length,
    workdaysElapsed: elapsed,
    workdaysRemaining: today > end ? 0 : remainingDays,
    requiredPerDay: remaining > 0 && remainingDays > 0 && today <= end ? remaining / remainingDays : null,
    projected,
    status,
  };
}

export const GOAL_METRICS = [
  "cold_calls",
  "effective_contacts",
  "visits",
  "follow_ups_done",
  "new_customers",
  "orders",
  "revenue",
  "commission",
] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number];
export const MONETARY_METRICS: GoalMetric[] = ["revenue", "commission"];
