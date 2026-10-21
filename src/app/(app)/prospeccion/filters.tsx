"use client";
import { NativeSelect } from "@/components/ui/input";
import { SegmentedLinks, useSearchParamUpdater } from "@/components/app/filters";
import { useLookups } from "@/components/app/lookups";

export function ProspectingFilters({ range }: { range: string }) {
  const { results } = useLookups();
  const { params, set } = useSearchParamUpdater();
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <SegmentedLinks
        param="rango"
        value={range}
        options={[
          { value: "hoy", label: "Hoy" },
          { value: "7", label: "7 días" },
          { value: "30", label: "30 días" },
          { value: "90", label: "90 días" },
        ]}
      />
      <NativeSelect
        aria-label="Filtrar por resultado"
        className="h-9 w-auto min-w-44"
        value={params.get("resultado") ?? ""}
        onChange={(e) => set({ resultado: e.target.value })}
      >
        <option value="">Todos los resultados</option>
        <option value="none">Sin resultado</option>
        {results.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </NativeSelect>
      <label className="flex h-9 items-center gap-2 rounded-[var(--radius-field)] border border-line-strong bg-paper px-3 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-[var(--accent)]"
          checked={params.get("incompletas") === "1"}
          onChange={(e) => set({ incompletas: e.target.checked ? "1" : null })}
        />
        Solo incompletas
      </label>
    </div>
  );
}
