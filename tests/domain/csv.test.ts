import { describe, expect, it } from "vitest";
import { euros, toCsv } from "@/lib/domain/csv";

describe("exportación CSV", () => {
  it("usa punto y coma, coma decimal y BOM", () => {
    const csv = toCsv(["A", "B"], [["x", 12.5], [null, true]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("A;B\r\nx;12,5\r\n;Sí\r\n");
  });
  it("escapa comillas y separadores, y neutraliza fórmulas", () => {
    const csv = toCsv(["A"], [['di "hola"; adiós'], ["=SUMA(A1)"]]);
    expect(csv).toContain('"di ""hola""; adiós"');
    expect(csv).toContain("'=SUMA(A1)");
  });
  it("convierte céntimos a euros", () => {
    expect(euros(125050)).toBe(1250.5);
    expect(euros(null)).toBeNull();
  });
});
