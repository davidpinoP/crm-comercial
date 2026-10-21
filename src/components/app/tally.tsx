import { cn } from "@/lib/utils";

/**
 * Marcas de recuento (||||/) para las puertas frías del día: el gesto
 * del comercial que apunta cada puerta en la libreta.
 */
export function Tally({ count, target, className }: { count: number; target?: number | null; className?: string }) {
  const shown = Math.min(count, 60);
  const groups = Math.ceil(Math.max(shown, target ?? 0, 5) / 5);
  return (
    <div className={cn("flex flex-wrap gap-x-3 gap-y-2", className)} aria-hidden>
      {Array.from({ length: Math.min(groups, 12) }, (_, g) => {
        const inGroup = Math.max(0, Math.min(5, shown - g * 5));
        const targetInGroup = target ? Math.max(0, Math.min(5, target - g * 5)) : 0;
        return (
          <svg key={g} viewBox="0 0 30 28" className="h-7 w-[30px]">
            {[0, 1, 2, 3].map((i) => (
              <line
                key={i}
                x1={4 + i * 6}
                x2={4 + i * 6}
                y1={4}
                y2={24}
                strokeWidth={2.4}
                strokeLinecap="round"
                className={i < inGroup ? "stroke-accent" : i < targetInGroup ? "stroke-line-strong" : "stroke-transparent"}
              />
            ))}
            <line
              x1={1}
              y1={20}
              x2={27}
              y2={8}
              strokeWidth={2.4}
              strokeLinecap="round"
              className={inGroup === 5 ? "stroke-ink" : targetInGroup === 5 ? "stroke-line-strong" : "stroke-transparent"}
            />
          </svg>
        );
      })}
      {count > 60 && <span className="self-center text-sm text-ink-muted">+{count - 60}</span>}
    </div>
  );
}
