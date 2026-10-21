import { cn } from "@/lib/utils";

/** Distribución por categorías en barras horizontales (HTML): legible en móvil, con valor siempre visible */
export function HBars({
  rows,
  format = (n: number) => n.toLocaleString("es-ES"),
  className,
  empty = "Sin datos en el periodo",
}: {
  rows: { label: string; value: number; hint?: string }[];
  format?: (n: number) => string;
  className?: string;
  empty?: string;
}) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (!rows.length || max === 0) return <p className="text-sm text-ink-muted">{empty}</p>;
  return (
    <ul className={cn("space-y-2.5", className)}>
      {rows.map((r) => (
        <li key={r.label} title={r.hint}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
            <span className="truncate">{r.label}</span>
            <span className="num shrink-0 text-ink-muted">
              <span className="font-medium text-ink">{format(r.value)}</span>
              {total > 0 && ` · ${Math.round((r.value / total) * 100)} %`}
            </span>
          </div>
          <div className="h-2 rounded-full bg-sunken">
            <div className="h-2 rounded-full bg-[var(--chart-1)]" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ProgressBar({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-sunken", className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full", pct >= 100 ? "bg-positive" : "bg-accent")} style={{ width: `${pct}%` }} />
    </div>
  );
}
