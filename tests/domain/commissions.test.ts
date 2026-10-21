import { describe, expect, it } from "vitest";
import {
  computeCommission,
  DEFAULT_TIERS,
  findTierIndex,
  projectCommission,
  tierLabel,
  validateTiers,
  type CommissionTier,
} from "@/lib/domain/commissions";

const E = (euros: number) => Math.round(euros * 100);

describe("comisiones — modo A (porcentaje sobre toda la facturación)", () => {
  const c = (euros: number) => computeCommission(E(euros), DEFAULT_TIERS, "flat");

  it("menos de 6.000 € → 0 %", () => {
    expect(c(5999.99)).toMatchObject({ rateBp: 0, amountCents: 0 });
  });
  it("exactamente 6.000 € → 4 % sobre todo", () => {
    expect(c(6000)).toMatchObject({ rateBp: 400, amountCents: E(240) });
  });
  it("exactamente 8.000 € → 6 % sobre todo", () => {
    expect(c(8000)).toMatchObject({ rateBp: 600, amountCents: E(480) });
  });
  it("exactamente 10.000 € → 6 % (el 8 % es «más de 10.000»)", () => {
    expect(c(10000)).toMatchObject({ rateBp: 600, amountCents: E(600) });
  });
  it("más de 10.000 € → 8 % sobre todo", () => {
    expect(c(10000.01)).toMatchObject({ rateBp: 800, amountCents: E(800) });
    expect(c(12500)).toMatchObject({ rateBp: 800, amountCents: E(1000) });
  });
  it("mes sin ventas → 0 € y siguiente tramo a 6.000 €", () => {
    const r = c(0);
    expect(r.amountCents).toBe(0);
    expect(r.next).toEqual({ thresholdCents: E(6000), remainingCents: E(6000), rateBp: 400 });
  });
  it("base negativa por devoluciones → sin comisión negativa", () => {
    expect(computeCommission(-E(500), DEFAULT_TIERS, "flat")).toMatchObject({ baseCents: 0, amountCents: 0 });
  });
});

describe("comisiones — modo B (marginal por tramos)", () => {
  const c = (euros: number) => computeCommission(E(euros), DEFAULT_TIERS, "marginal");

  it("menos de 6.000 € → 0 €", () => expect(c(5000).amountCents).toBe(0));
  it("exactamente 6.000 € → 0 € (no hay porción por encima de 6.000)", () => expect(c(6000).amountCents).toBe(0));
  it("exactamente 8.000 € → 4 % de 2.000 = 80 €", () => expect(c(8000).amountCents).toBe(E(80)));
  it("exactamente 10.000 € → 80 + 6 % de 2.000 = 200 €", () => expect(c(10000).amountCents).toBe(E(200)));
  it("12.500 € → 200 + 8 % de 2.500 = 400 €", () => {
    const r = c(12500);
    expect(r.amountCents).toBe(E(400));
    expect(r.breakdown.map((b) => b.portionCents)).toEqual([E(6000), E(2000), E(2000), E(2500)]);
  });
  it("redondea una sola vez al final", () => {
    // 6.000,01 € → 4 % de 0,01 € = 0,0004 € → 0
    expect(c(6000.01).amountCents).toBe(0);
    // 6.000,13 € → 4 % de 0,13 = 0,0052 → 0,01
    expect(c(6000.13).amountCents).toBe(1);
  });
});

describe("tramos y configuración", () => {
  it("distancia hasta el siguiente tramo (ejemplo 8.500 €)", () => {
    const r = computeCommission(E(8500), DEFAULT_TIERS, "flat");
    expect(r.next?.thresholdCents).toBe(E(10000));
    // «más de 10.000» exige un céntimo más
    expect(r.next?.remainingCents).toBe(E(1500) + 1);
  });

  it("el último tramo no tiene siguiente", () => {
    expect(computeCommission(E(20000), DEFAULT_TIERS, "flat").next).toBeNull();
  });

  it("respeta cambios de configuración del límite (10.000 incluido en el 8 %)", () => {
    const tiers: CommissionTier[] = DEFAULT_TIERS.map((t) => (t.lowerCents === E(10000) ? { ...t, lowerInclusive: true } : t));
    expect(computeCommission(E(10000), tiers, "flat").rateBp).toBe(800);
    // y límite 6.000 excluido
    const t2 = DEFAULT_TIERS.map((t) => (t.lowerCents === E(6000) ? { ...t, lowerInclusive: false } : t));
    expect(computeCommission(E(6000), t2, "flat").rateBp).toBe(0);
  });

  it("ordena tramos desordenados y valida duplicados", () => {
    const shuffled = [...DEFAULT_TIERS].reverse();
    expect(findTierIndex(E(7000), shuffled)).toBe(1);
    expect(validateTiers([...DEFAULT_TIERS, { lowerCents: E(6000), lowerInclusive: true, rateBp: 1 }])).toHaveLength(1);
    expect(validateTiers([])).toHaveLength(1);
    expect(validateTiers(DEFAULT_TIERS)).toEqual([]);
  });

  it("genera etiquetas legibles", () => {
    expect(tierLabel(0, DEFAULT_TIERS)).toContain("Menos de 6.000");
    expect(tierLabel(3, DEFAULT_TIERS)).toContain("Más de 10.000");
    expect(tierLabel(-1, DEFAULT_TIERS)).toBe("Sin tramo");
  });

  it("proyecta la comisión al ritmo actual", () => {
    const p = projectCommission(E(5000), 10, 20, DEFAULT_TIERS, "flat");
    expect(p?.projectedBaseCents).toBe(E(10000));
    expect(p?.result.amountCents).toBe(E(600));
    expect(projectCommission(E(5000), 0, 20, DEFAULT_TIERS, "flat")).toBeNull();
  });
});
