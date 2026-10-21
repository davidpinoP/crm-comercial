/**
 * Motor de comisiones configurable.
 *
 * Un tramo se define por su límite inferior y si ese límite está incluido:
 *   el tramo i aplica a un importe A si  A > lower_i  ó  (A = lower_i y lowerInclusive_i).
 * El tramo vigente es el de mayor límite inferior que aplique.
 *
 * Métodos:
 *  - flat     (Modo A): la tasa del tramo alcanzado se aplica a toda la base.
 *  - marginal (Modo B): cada tasa se aplica sólo a la porción de base dentro de su tramo.
 *
 * Con la escala por defecto (0 € incl. 0 %, 6.000 € incl. 4 %, 8.000 € incl. 6 %, 10.000 € excl. 8 %):
 *   6.000 € → 4 %; 8.000 € → 6 %; 10.000 € → 6 %; 10.000,01 € → 8 %.
 */
import { formatEUR, type BasisPoints, type Cents } from "./money";

export type CommissionMethod = "flat" | "marginal";

export interface CommissionTier {
  lowerCents: Cents;
  lowerInclusive: boolean;
  rateBp: BasisPoints;
}

export interface CommissionResult {
  baseCents: Cents;
  method: CommissionMethod;
  /** Índice en la lista ordenada de tramos; -1 si ningún tramo aplica */
  tierIndex: number;
  rateBp: BasisPoints;
  amountCents: Cents;
  tierLabel: string;
  /** Desglose por tramo (en marginal, porción de cada tramo; en flat, sólo el tramo vigente) */
  breakdown: { tierIndex: number; portionCents: Cents; rateBp: BasisPoints; amountCents: Cents }[];
  next: { thresholdCents: Cents; remainingCents: Cents; rateBp: BasisPoints } | null;
}

export function sortTiers(tiers: CommissionTier[]): CommissionTier[] {
  return [...tiers].sort((a, b) => a.lowerCents - b.lowerCents);
}

export function validateTiers(tiers: CommissionTier[]): string[] {
  const errors: string[] = [];
  if (tiers.length === 0) errors.push("Define al menos un tramo.");
  const sorted = sortTiers(tiers);
  const seen = new Set<number>();
  for (const t of sorted) {
    if (!Number.isInteger(t.lowerCents) || t.lowerCents < 0) errors.push("Los límites deben ser importes positivos.");
    if (!Number.isInteger(t.rateBp) || t.rateBp < 0 || t.rateBp > 10000) errors.push("Los porcentajes deben estar entre 0 y 100.");
    if (seen.has(t.lowerCents)) errors.push(`Hay dos tramos con el mismo límite (${formatEUR(t.lowerCents)}).`);
    seen.add(t.lowerCents);
  }
  return [...new Set(errors)];
}

function applies(amount: Cents, t: CommissionTier): boolean {
  return amount > t.lowerCents || (amount === t.lowerCents && t.lowerInclusive);
}

export function findTierIndex(amount: Cents, tiers: CommissionTier[]): number {
  const sorted = sortTiers(tiers);
  let idx = -1;
  sorted.forEach((t, i) => {
    if (applies(amount, t)) idx = i;
  });
  return idx;
}

export function tierLabel(index: number, tiers: CommissionTier[]): string {
  const sorted = sortTiers(tiers);
  const t = sorted[index];
  if (!t) return "Sin tramo";
  const next = sorted[index + 1];
  const from = t.lowerCents === 0 ? "0 €" : `${t.lowerInclusive ? "Desde" : "Más de"} ${formatEUR(t.lowerCents)}`;
  if (!next) return t.lowerCents === 0 ? "Cualquier importe" : from;
  const to = `${next.lowerInclusive ? "hasta menos de" : "hasta"} ${formatEUR(next.lowerCents)}`;
  return t.lowerCents === 0 ? `Menos de ${formatEUR(next.lowerCents)}${next.lowerInclusive ? "" : " (incl.)"}` : `${from} ${to}`;
}

const roundDiv = (num: number, den: number) => Math.round(num / den);

export function computeCommission(
  baseCentsRaw: Cents,
  tiersRaw: CommissionTier[],
  method: CommissionMethod,
): CommissionResult {
  const tiers = sortTiers(tiersRaw);
  // Una base negativa (más devoluciones que ventas) no genera comisión negativa
  const base = Math.max(0, Math.round(baseCentsRaw));
  const tierIndex = findTierIndex(base, tiers);
  const rateBp = tierIndex >= 0 ? tiers[tierIndex].rateBp : 0;

  let amountCents = 0;
  const breakdown: CommissionResult["breakdown"] = [];

  if (method === "flat") {
    amountCents = roundDiv(base * rateBp, 10000);
    if (tierIndex >= 0) breakdown.push({ tierIndex, portionCents: base, rateBp, amountCents });
  } else {
    // Suma exacta de porciones × tasa en «céntimos × bp»; se redondea una sola vez al final
    let acc = 0;
    tiers.forEach((t, i) => {
      const upper = tiers[i + 1]?.lowerCents ?? Number.POSITIVE_INFINITY;
      const portion = Math.max(0, Math.min(base, upper) - t.lowerCents);
      if (portion > 0) {
        acc += portion * t.rateBp;
        breakdown.push({ tierIndex: i, portionCents: portion, rateBp: t.rateBp, amountCents: roundDiv(portion * t.rateBp, 10000) });
      }
    });
    amountCents = roundDiv(acc, 10000);
  }

  const nextTier = tiers[tierIndex + 1];
  const next = nextTier
    ? {
        thresholdCents: nextTier.lowerCents,
        remainingCents: Math.max(0, nextTier.lowerCents - base + (nextTier.lowerInclusive ? 0 : 1)),
        rateBp: nextTier.rateBp,
      }
    : null;

  return {
    baseCents: base,
    method,
    tierIndex,
    rateBp,
    amountCents,
    tierLabel: tierLabel(tierIndex, tiers),
    breakdown,
    next,
  };
}

/**
 * Proyección a fin de mes manteniendo el ritmo actual por día laborable trabajado.
 * Devuelve null si aún no hay días trabajados (no se puede inferir un ritmo).
 */
export function projectCommission(
  baseSoFarCents: Cents,
  workdaysElapsed: number,
  workdaysTotal: number,
  tiers: CommissionTier[],
  method: CommissionMethod,
): { projectedBaseCents: Cents; result: CommissionResult } | null {
  if (workdaysElapsed <= 0 || workdaysTotal <= 0) return null;
  const projectedBaseCents = Math.round((baseSoFarCents / workdaysElapsed) * workdaysTotal);
  return { projectedBaseCents, result: computeCommission(projectedBaseCents, tiers, method) };
}

export const DEFAULT_TIERS: CommissionTier[] = [
  { lowerCents: 0, lowerInclusive: true, rateBp: 0 },
  { lowerCents: 600000, lowerInclusive: true, rateBp: 400 },
  { lowerCents: 800000, lowerInclusive: true, rateBp: 600 },
  { lowerCents: 1000000, lowerInclusive: false, rateBp: 800 },
];
