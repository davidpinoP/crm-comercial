"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";

/** Actualiza parámetros de la URL (filtros compartibles y que sobreviven a recargas) */
export function useSearchParamUpdater() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (patch: Record<string, string | null | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };
  return { params, set, pending };
}

export function SegmentedLinks({
  value,
  options,
  param,
  className,
}: {
  value: string;
  options: { value: string; label: string }[];
  param: string;
  className?: string;
}) {
  const { set, pending } = useSearchParamUpdater();
  return (
    <div className={cn("inline-flex max-w-full overflow-x-auto rounded-[var(--radius-field)] bg-sunken p-1 text-sm [scrollbar-width:none]", pending && "opacity-70", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => set({ [param]: o.value })}
          className={cn("shrink-0 rounded-md px-3 py-1.5 font-medium whitespace-nowrap text-ink-muted transition-colors", value === o.value && "bg-paper text-ink shadow-card")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
