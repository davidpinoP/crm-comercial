import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { Change } from "@/lib/domain/metrics";
import { formatNumber } from "@/lib/domain/metrics";
import { cn } from "@/lib/utils";

/** Variación frente al periodo anterior, sin porcentajes engañosos cuando el anterior es 0 */
export function ChangeLabel({ change, className, deltaFormat }: { change: Change; className?: string; deltaFormat?: (n: number) => string }) {
  if (change.kind === "no_data") return <span className={cn("text-ink-faint", className)}>Sin comparativa</span>;
  if (change.kind === "unchanged_zero") return <span className={cn("text-ink-faint", className)}>Sin actividad en ambos periodos</span>;
  if (change.kind === "from_zero")
    return (
      <span className={cn("inline-flex items-center gap-0.5 text-positive", className)} title="El periodo anterior fue 0: no se calcula porcentaje">
        <ArrowUpRight className="size-3.5" />+{deltaFormat ? deltaFormat(change.delta) : formatNumber(change.delta)} (antes 0)
      </span>
    );
  const v = change.value;
  const flat = Math.abs(v) < 0.5;
  const Icon = flat ? Minus : v > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("num inline-flex items-center gap-0.5", flat ? "text-ink-muted" : v > 0 ? "text-positive" : "text-negative", className)}>
      <Icon className="size-3.5" />
      {v > 0 ? "+" : ""}
      {formatNumber(v, Math.abs(v) < 10 ? 1 : 0)} %
    </span>
  );
}

export function Kpi({
  label,
  value,
  change,
  hint,
  className,
  deltaFormat,
}: {
  label: string;
  value: string;
  change?: Change;
  hint?: string;
  className?: string;
  deltaFormat?: (n: number) => string;
}) {
  return (
    <div className={cn("bg-paper px-4 py-3.5", className)} title={hint}>
      <dt className="truncate text-[12px] text-ink-muted">{label}</dt>
      <dd className={cn("num mt-1 truncate font-semibold tracking-[-0.02em]", value === "Datos insuficientes" ? "text-[13px] text-ink-muted" : "text-[20px]")}>{value}</dd>
      {change && (
        <dd className="mt-0.5 text-[12px]">
          <ChangeLabel change={change} deltaFormat={deltaFormat} />
        </dd>
      )}
    </div>
  );
}

/** Rejilla de indicadores con separadores de 1px */
export function KpiGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dl className={cn("grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line", className)}>{children}</dl>;
}
