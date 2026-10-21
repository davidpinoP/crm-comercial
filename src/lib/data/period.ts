import { resolvePeriod, todayISO, type Period, type PeriodKind } from "@/lib/domain/dates";

const KINDS: PeriodKind[] = ["today", "week", "month", "prev_month", "custom"];
const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Interpreta ?periodo=&desde=&hasta= de forma segura */
export function periodFromParams(sp: Record<string, string | undefined>, fallback: PeriodKind = "today"): Period {
  const kind = (KINDS as string[]).includes(sp.periodo ?? "") ? (sp.periodo as PeriodKind) : fallback;
  if (kind === "custom") {
    if (isDate(sp.desde) && isDate(sp.hasta)) return resolvePeriod("custom", todayISO(), { from: sp.desde!, to: sp.hasta! });
    return resolvePeriod("month");
  }
  return resolvePeriod(kind);
}
