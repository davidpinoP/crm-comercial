import { describe, expect, it } from "vitest";
import { goalProgress, hoursWorked, isWorkday, workdaysIn, type WorkCalendar } from "@/lib/domain/goals";
import {
  formatDate,
  formatDateTime,
  madridDateKey,
  madridLocalToInstant,
  previousPeriod,
  resolvePeriod,
} from "@/lib/domain/dates";

const cal = (overrides: [string, "work" | "vacation" | "holiday" | "off", number | null][] = []): WorkCalendar => ({
  workingWeekdays: [1, 2, 3, 4, 5],
  defaultHours: 8,
  overrides: new Map(overrides.map(([d, kind, h]) => [d, { kind, hours_worked: h }])),
});

describe("fechas en Europe/Madrid", () => {
  it("asigna el día civil de Madrid aunque en UTC sea otro día", () => {
    // 23:30 UTC del 20/10 son las 01:30 del 21/10 en Madrid (CEST)
    expect(madridDateKey("2026-10-20T23:30:00Z")).toBe("2026-10-21");
    // En invierno (CET, UTC+1)
    expect(madridDateKey("2026-12-31T23:30:00Z")).toBe("2027-01-01");
  });

  it("calcula los límites del día en Madrid, incluido el cambio de hora", () => {
    expect(madridLocalToInstant("2026-10-21", "00:00").toISOString()).toBe("2026-10-20T22:00:00.000Z");
    expect(madridLocalToInstant("2026-12-01", "09:30").toISOString()).toBe("2026-12-01T08:30:00.000Z");
    const day = resolvePeriod("today", "2026-10-25"); // día del cambio a horario de invierno: 25 h
    expect(day.end.getTime() - day.start.getTime()).toBe(25 * 3600 * 1000);
  });

  it("formatea DD/MM/AAAA", () => {
    expect(formatDate("2026-03-07")).toBe("07/03/2026");
    expect(formatDateTime("2026-10-21T08:05:00Z")).toBe("21/10/2026 10:05");
    expect(formatDate(null)).toBe("—");
  });

  it("resuelve periodos y sus equivalentes anteriores", () => {
    const w = resolvePeriod("week", "2026-10-21"); // miércoles
    expect([w.startDate, w.endDate]).toEqual(["2026-10-19", "2026-10-25"]);
    expect(previousPeriod(w).startDate).toBe("2026-10-12");
    const m = resolvePeriod("month", "2026-03-31");
    expect(previousPeriod(m)).toMatchObject({ startDate: "2026-02-01", endDate: "2026-02-28" });
    const pm = resolvePeriod("prev_month", "2026-01-15");
    expect([pm.startDate, pm.endDate]).toEqual(["2025-12-01", "2025-12-31"]);
    const c = resolvePeriod("custom", "2026-10-21", { from: "2026-10-10", to: "2026-10-01" });
    expect([c.startDate, c.endDate]).toEqual(["2026-10-01", "2026-10-10"]);
    expect(previousPeriod(c)).toMatchObject({ startDate: "2026-09-21", endDate: "2026-09-30" });
  });
});

describe("calendario laboral", () => {
  it("aplica excepciones de vacaciones, festivos y días extra", () => {
    const c = cal([["2026-10-12", "holiday", null], ["2026-10-17", "work", 4]]);
    expect(isWorkday(c, "2026-10-12")).toBe(false); // lunes festivo
    expect(isWorkday(c, "2026-10-17")).toBe(true); // sábado trabajado
    expect(workdaysIn(c, "2026-10-12", "2026-10-18")).toHaveLength(5);
    expect(hoursWorked(c, "2026-10-12", "2026-10-18")).toEqual({ hours: 4 * 8 + 4, recorded: true });
  });
});

describe("objetivos", () => {
  it("reproduce el ejemplo: 12.000 € de objetivo, 8.500 € logrados, 7 días → 500 €/día", () => {
    // Octubre 2026: el 21 (mié) quedan 21,22,23,26,27,28,29,30 = 8 días laborables; marcamos el 30 festivo → 7
    const c = cal([["2026-10-30", "holiday", null]]);
    const g = goalProgress(1200000, 850000, "2026-10-01", "2026-10-31", "2026-10-22", c);
    expect(g.workdaysRemaining).toBe(6);
    const g2 = goalProgress(1200000, 850000, "2026-10-01", "2026-10-31", "2026-10-21", c);
    expect(g2.workdaysRemaining).toBe(7);
    expect(g2.remaining).toBe(350000);
    expect(g2.requiredPerDay).toBe(50000);
    expect(g2.difference).toBe(-350000);
    expect(g2.completion).toMatchObject({ kind: "ok" });
  });

  it("gestiona objetivo cero, objetivo alcanzado y periodo cerrado", () => {
    const c = cal();
    expect(goalProgress(0, 10, "2026-10-01", "2026-10-31", "2026-10-21", c)).toMatchObject({
      status: "no_target",
      completion: { kind: "insufficient" },
    });
    expect(goalProgress(10, 12, "2026-10-01", "2026-10-31", "2026-10-21", c)).toMatchObject({ status: "achieved", requiredPerDay: null });
    expect(goalProgress(10, 5, "2026-09-01", "2026-09-30", "2026-10-21", c)).toMatchObject({ status: "closed", workdaysRemaining: 0, requiredPerDay: null });
  });

  it("proyecta al cierre según el ritmo y no proyecta sin días transcurridos", () => {
    const c = cal();
    // del 1 al 21 de octubre: 14 laborables transcurridos antes del 21; total 22
    const g = goalProgress(100, 28, "2026-10-01", "2026-10-31", "2026-10-21", c);
    expect(g.workdaysElapsed).toBe(14);
    expect(g.projected).toBeCloseTo((28 / 15) * 22);
    expect(goalProgress(100, 0, "2026-10-01", "2026-10-31", "2026-10-01", c).projected).toBeNull();
  });
});
