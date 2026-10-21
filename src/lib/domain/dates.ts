/**
 * Fechas en la zona Europe/Madrid.
 * - Una «fecha» de negocio se representa como texto ISO «AAAA-MM-DD» (día civil en Madrid).
 * - Un «instante» es un Date (UTC). Los límites de periodo se calculan en Madrid
 *   para que los cambios de horario (CET/CEST) no desplacen actividades de día.
 */
import { TZDate } from "@date-fns/tz";
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  startOfMonth,
  startOfWeek,
  parseISO,
} from "date-fns";

export const TZ = "Europe/Madrid";

export type ISODate = string; // AAAA-MM-DD

const keyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Día civil en Madrid de un instante */
export function madridDateKey(instant: Date | string | number): ISODate {
  return keyFormatter.format(new Date(instant));
}

export function todayISO(now: Date = new Date()): ISODate {
  return madridDateKey(now);
}

/** Instante UTC correspondiente a las 00:00 en Madrid del día dado */
export function startOfMadridDay(date: ISODate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(new TZDate(y, m - 1, d, 0, 0, 0, TZ).getTime());
}

/** Instante UTC de una fecha y hora locales de Madrid («AAAA-MM-DD», «HH:mm») */
export function madridLocalToInstant(date: ISODate, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(new TZDate(y, m - 1, d, hh || 0, mm || 0, 0, TZ).getTime());
}

/** «HH:mm» en Madrid de un instante */
export function madridTime(instant: Date | string): string {
  return new Intl.DateTimeFormat("es-ES", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(
    new Date(instant),
  );
}

export function addDaysISO(date: ISODate, days: number): ISODate {
  return toISO(addDays(parseISO(date), days));
}

function toISO(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 1 = lunes … 7 = domingo */
export function isoWeekday(date: ISODate): number {
  const wd = parseISO(date).getDay();
  return wd === 0 ? 7 : wd;
}

export function eachDayISO(startDate: ISODate, endDate: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const n = differenceInCalendarDays(parseISO(endDate), parseISO(startDate));
  for (let i = 0; i <= n; i++) out.push(addDaysISO(startDate, i));
  return out;
}

export function daysBetweenInclusive(startDate: ISODate, endDate: ISODate): number {
  return differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1;
}

export type PeriodKind = "today" | "week" | "month" | "prev_month" | "custom";

export interface Period {
  kind: PeriodKind;
  /** Primer día (incluido) */
  startDate: ISODate;
  /** Último día (incluido) */
  endDate: ISODate;
  /** Instante inicial (incluido) */
  start: Date;
  /** Instante final (excluido) */
  end: Date;
  label: string;
}

function makePeriod(kind: PeriodKind, startDate: ISODate, endDate: ISODate, label: string): Period {
  return {
    kind,
    startDate,
    endDate,
    start: startOfMadridDay(startDate),
    end: startOfMadridDay(addDaysISO(endDate, 1)),
    label,
  };
}

const monthName = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });

export function monthLabel(monthStart: ISODate): string {
  const s = monthName.format(parseISO(`${monthStart}T12:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function monthStartISO(date: ISODate): ISODate {
  return toISO(startOfMonth(parseISO(date)));
}

export function monthEndISO(date: ISODate): ISODate {
  return addDaysISO(toISO(addMonths(startOfMonth(parseISO(date)), 1)), -1);
}

export function addMonthsISO(date: ISODate, months: number): ISODate {
  return toISO(addMonths(parseISO(date), months));
}

export function resolvePeriod(
  kind: PeriodKind,
  today: ISODate = todayISO(),
  custom?: { from: ISODate; to: ISODate },
): Period {
  switch (kind) {
    case "today":
      return makePeriod(kind, today, today, "Hoy");
    case "week": {
      const s = toISO(startOfWeek(parseISO(today), { weekStartsOn: 1 }));
      return makePeriod(kind, s, addDaysISO(s, 6), "Esta semana");
    }
    case "month":
      return makePeriod(kind, monthStartISO(today), monthEndISO(today), "Este mes");
    case "prev_month": {
      const s = addMonthsISO(monthStartISO(today), -1);
      return makePeriod(kind, s, monthEndISO(s), "Mes anterior");
    }
    case "custom": {
      if (!custom) throw new Error("Periodo personalizado sin fechas");
      const [a, b] = custom.from <= custom.to ? [custom.from, custom.to] : [custom.to, custom.from];
      return makePeriod(kind, a, b, `${formatDate(a)} – ${formatDate(b)}`);
    }
  }
}

/** Periodo inmediatamente anterior y equivalente (día, semana, mes natural o mismo número de días) */
export function previousPeriod(p: Period): Period {
  if (p.kind === "month" || p.kind === "prev_month") {
    const s = addMonthsISO(p.startDate, -1);
    return makePeriod("custom", s, monthEndISO(s), monthLabel(s));
  }
  const len = daysBetweenInclusive(p.startDate, p.endDate);
  const end = addDaysISO(p.startDate, -1);
  const start = addDaysISO(end, -(len - 1));
  return makePeriod("custom", start, end, `${formatDate(start)} – ${formatDate(end)}`);
}

/** «AAAA-MM-DD» o instante → «DD/MM/AAAA» */
export function formatDate(value: ISODate | Date | null | undefined): string {
  if (!value) return "—";
  const iso = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : madridDateKey(value);
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Instante → «DD/MM/AAAA HH:mm» en Madrid */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return `${formatDate(new Date(value))} ${madridTime(value)}`;
}

/** «hace 3 días», «hoy», «mañana»… respecto a hoy en Madrid */
export function relativeDayLabel(date: ISODate, today: ISODate = todayISO()): string {
  const diff = differenceInCalendarDays(parseISO(date), parseISO(today));
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  if (diff === -1) return "Ayer";
  if (diff < 0) return `Hace ${-diff} días`;
  return `En ${diff} días`;
}
