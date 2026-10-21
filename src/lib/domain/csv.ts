/**
 * CSV para Excel en español: separador «;», coma decimal, BOM UTF-8.
 * Los valores se escapan y se neutralizan fórmulas (=, +, -, @) para evitar inyección.
 */
export type CsvValue = string | number | boolean | null | undefined;

function cell(v: CsvValue): string {
  if (v == null) return "";
  let s = typeof v === "number" ? String(v).replace(".", ",") : typeof v === "boolean" ? (v ? "Sí" : "No") : v;
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: CsvValue[][]): string {
  return "﻿" + [headers, ...rows].map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}

/** Céntimos → número en euros con dos decimales (para hojas de cálculo) */
export const euros = (cents: number | null | undefined) => (cents == null ? null : Number((cents / 100).toFixed(2)));
