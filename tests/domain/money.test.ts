import { describe, expect, it } from "vitest";
import {
  computeLine,
  computeOrderTotals,
  formatEUR,
  parseEurosToCents,
  parsePercentToBp,
  proportionalVat,
} from "@/lib/domain/money";

describe("formato monetario", () => {
  it("usa formato español con separador de miles", () => {
    expect(formatEUR(125050).replace(/ /g, " ")).toBe("1.250,50 €");
    expect(formatEUR(0).replace(/ /g, " ")).toBe("0,00 €");
    expect(formatEUR(99).replace(/ /g, " ")).toBe("0,99 €");
  });

  it("interpreta importes introducidos en varios formatos", () => {
    expect(parseEurosToCents("1.250,50")).toBe(125050);
    expect(parseEurosToCents("1250,5")).toBe(125050);
    expect(parseEurosToCents("1250.50")).toBe(125050);
    expect(parseEurosToCents("1.250")).toBe(125000);
    expect(parseEurosToCents("12 €")).toBe(1200);
    expect(parseEurosToCents("abc")).toBeNull();
    expect(parseEurosToCents("1,234")).toBeNull();
    expect(parseEurosToCents("")).toBeNull();
  });

  it("interpreta porcentajes", () => {
    expect(parsePercentToBp("21")).toBe(2100);
    expect(parsePercentToBp("10,5")).toBe(1050);
    expect(parsePercentToBp("101")).toBeNull();
  });
});

describe("líneas de pedido", () => {
  it("calcula base, IVA y total", () => {
    expect(computeLine({ quantity: 3, unitPriceCents: 1999, discountBp: 0, vatRateBp: 2100 })).toEqual({
      baseCents: 5997,
      vatCents: 1259, // 1259,37 → 1259
      totalCents: 7256,
    });
  });

  it("aplica descuentos antes del IVA", () => {
    // 2 × 12,50 € con 10 % = 22,50 €; IVA 21 % = 4,725 → 4,73
    expect(computeLine({ quantity: 2, unitPriceCents: 1250, discountBp: 1000, vatRateBp: 2100 })).toEqual({
      baseCents: 2250,
      vatCents: 473,
      totalCents: 2723,
    });
  });

  it("redondea medio céntimo hacia arriba sin errores de coma flotante", () => {
    // 0,1 × 0,05 € → 0,005 € → 1 céntimo
    expect(computeLine({ quantity: "0.1", unitPriceCents: 5, discountBp: 0, vatRateBp: 0 }).baseCents).toBe(1);
    // 1,005 € × 1 con IVA 10 %: base 101 (100,5 → 101)
    expect(computeLine({ quantity: "0.5", unitPriceCents: 201, discountBp: 0, vatRateBp: 1000 })).toEqual({
      baseCents: 101,
      vatCents: 10,
      totalCents: 111,
    });
  });

  it("admite cantidades decimales y rechaza valores no válidos", () => {
    expect(computeLine({ quantity: "1,5", unitPriceCents: 1000, discountBp: 0, vatRateBp: 2100 }).baseCents).toBe(1500);
    expect(() => computeLine({ quantity: 0, unitPriceCents: 1000, discountBp: 0, vatRateBp: 2100 })).toThrow();
    expect(() => computeLine({ quantity: 1, unitPriceCents: -1, discountBp: 0, vatRateBp: 2100 })).toThrow();
    expect(() => computeLine({ quantity: 1, unitPriceCents: 100, discountBp: 10001, vatRateBp: 2100 })).toThrow();
  });

  it("totaliza pedidos con distintos tipos de IVA", () => {
    const t = computeOrderTotals([
      { quantity: 1, unitPriceCents: 10000, discountBp: 0, vatRateBp: 2100 },
      { quantity: 2, unitPriceCents: 500, discountBp: 0, vatRateBp: 1000 },
      { quantity: 1, unitPriceCents: 1000, discountBp: 5000, vatRateBp: 2100 },
    ]);
    expect(t.baseCents).toBe(10000 + 1000 + 500);
    expect(t.vatCents).toBe(2100 + 100 + 105);
    expect(t.totalCents).toBe(t.baseCents + t.vatCents);
    expect(t.vatBreakdown).toEqual([
      { vatRateBp: 2100, baseCents: 10500, vatCents: 2205 },
      { vatRateBp: 1000, baseCents: 1000, vatCents: 100 },
    ]);
  });

  it("calcula el IVA proporcional de una devolución", () => {
    expect(proportionalVat(5000, 10000, 2100)).toBe(1050);
    expect(proportionalVat(3333, 10000, 2100)).toBe(700); // 699,93
    expect(proportionalVat(100, 0, 0)).toBe(0);
  });
});
