/**
 * Dinero: siempre en céntimos enteros. Porcentajes en puntos básicos (bp):
 * 2100 bp = 21 %. La aritmética de línea usa BigInt para que el redondeo sea
 * exacto e idéntico al de Postgres (public.order_line_amounts):
 *   base  = round(cantidad × precio × (10000 − descuento) / 10000)
 *   iva   = round(base × tipo / 10000)
 *   total = base + iva
 * round() = redondeo «half away from zero»; todos los importes son ≥ 0.
 */

export type Cents = number;
export type BasisPoints = number;

const eurFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: "always",
});

const eurCompact = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
  useGrouping: "always",
});

/** 125050 → «1.250,50 €» */
export function formatEUR(cents: Cents): string {
  return eurFormatter.format(cents / 100);
}

/** 125050 → «1.251 €» (para ejes y tarjetas compactas) */
export function formatEURCompact(cents: Cents): string {
  return eurCompact.format(Math.round(cents / 100));
}

/** 2100 → «21 %», 1050 → «10,5 %» */
export function formatPercentBp(bp: BasisPoints): string {
  return `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(bp / 100)} %`;
}

/**
 * Convierte texto introducido por el usuario en céntimos.
 * Acepta «1.250,50», «1250,5», «1250.50», «1 250,50 €». Devuelve null si no es válido.
 */
export function parseEurosToCents(input: string | number): Cents | null {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    return Math.round(input * 100);
  }
  let s = input.replace(/[€\s ]/g, "").trim();
  if (!s) return null;
  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let intPart: string;
  let decPart = "";
  if (lastComma > -1 && lastComma > lastDot) {
    intPart = s.slice(0, lastComma).replace(/\./g, "");
    decPart = s.slice(lastComma + 1);
  } else if (lastDot > -1 && lastComma === -1 && s.length - lastDot - 1 !== 3) {
    // «1250.50» (punto decimal) — pero «1.250» se interpreta como miles
    intPart = s.slice(0, lastDot);
    decPart = s.slice(lastDot + 1);
  } else {
    intPart = s.replace(/[.,]/g, "");
  }
  if (!/^\d+$/.test(intPart || "0") || !/^\d*$/.test(decPart) || decPart.length > 2) return null;
  const cents = Number(intPart || "0") * 100 + Number((decPart + "00").slice(0, 2));
  return negative ? -cents : cents;
}

/** Porcentaje introducido («21», «10,5») → bp */
export function parsePercentToBp(input: string | number): BasisPoints | null {
  const n = typeof input === "number" ? input : Number(String(input).replace(",", ".").replace("%", "").trim());
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100);
}

/** Cantidad con hasta 3 decimales → milésimas enteras */
export function quantityToMilli(quantity: number | string): bigint {
  const s = String(quantity).replace(",", ".").trim();
  if (!/^\d+(\.\d{1,3})?$/.test(s)) throw new RangeError(`Cantidad no válida: ${quantity}`);
  const [i, d = ""] = s.split(".");
  return BigInt(i) * 1000n + BigInt((d + "000").slice(0, 3));
}

/** División entera con redondeo half-away-from-zero para numerador ≥ 0 */
function roundDiv(num: bigint, den: bigint): bigint {
  return (num * 2n + den) / (den * 2n);
}

export interface LineInput {
  quantity: number | string;
  unitPriceCents: Cents;
  discountBp: BasisPoints;
  vatRateBp: BasisPoints;
}

export interface LineAmounts {
  baseCents: Cents;
  vatCents: Cents;
  totalCents: Cents;
}

export function computeLine({ quantity, unitPriceCents, discountBp, vatRateBp }: LineInput): LineAmounts {
  if (!Number.isInteger(unitPriceCents) || unitPriceCents < 0) throw new RangeError("Precio no válido");
  if (!Number.isInteger(discountBp) || discountBp < 0 || discountBp > 10000) throw new RangeError("Descuento no válido");
  if (!Number.isInteger(vatRateBp) || vatRateBp < 0 || vatRateBp > 10000) throw new RangeError("IVA no válido");
  const qMilli = quantityToMilli(quantity);
  if (qMilli <= 0n) throw new RangeError("La cantidad debe ser mayor que cero");
  const base = roundDiv(qMilli * BigInt(unitPriceCents) * BigInt(10000 - discountBp), 1000n * 10000n);
  const vat = roundDiv(base * BigInt(vatRateBp), 10000n);
  return { baseCents: Number(base), vatCents: Number(vat), totalCents: Number(base + vat) };
}

export interface OrderTotals extends LineAmounts {
  /** Desglose de IVA por tipo impositivo */
  vatBreakdown: { vatRateBp: BasisPoints; baseCents: Cents; vatCents: Cents }[];
}

export function computeOrderTotals(lines: LineInput[]): OrderTotals {
  const byRate = new Map<number, { baseCents: number; vatCents: number }>();
  let baseCents = 0;
  let vatCents = 0;
  for (const line of lines) {
    const a = computeLine(line);
    baseCents += a.baseCents;
    vatCents += a.vatCents;
    const acc = byRate.get(line.vatRateBp) ?? { baseCents: 0, vatCents: 0 };
    acc.baseCents += a.baseCents;
    acc.vatCents += a.vatCents;
    byRate.set(line.vatRateBp, acc);
  }
  return {
    baseCents,
    vatCents,
    totalCents: baseCents + vatCents,
    vatBreakdown: [...byRate.entries()]
      .sort(([a], [b]) => b - a)
      .map(([vatRateBp, v]) => ({ vatRateBp, ...v })),
  };
}

/** IVA proporcional de una devolución parcial (igual que public.register_return) */
export function proportionalVat(returnBaseCents: Cents, orderBaseCents: Cents, orderVatCents: Cents): Cents {
  if (orderBaseCents === 0) return 0;
  return Number(roundDiv(BigInt(returnBaseCents) * BigInt(orderVatCents), BigInt(orderBaseCents)));
}
