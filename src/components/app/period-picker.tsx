"use client";
import { useState } from "react";
import { SegmentedLinks, useSearchParamUpdater } from "./filters";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function PeriodPicker({ value, from, to, options = ["today", "week", "month", "prev_month", "custom"] }: { value: string; from?: string; to?: string; options?: string[] }) {
  const { set } = useSearchParamUpdater();
  const [f, setF] = useState(from ?? "");
  const [t, setT] = useState(to ?? "");
  const labels: Record<string, string> = { today: "Hoy", week: "Esta semana", month: "Este mes", prev_month: "Mes anterior", custom: "Personalizado" };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedLinks param="periodo" value={value} options={options.map((o) => ({ value: o, label: labels[o] }))} />
      {value === "custom" && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (f && t) set({ periodo: "custom", desde: f, hasta: t });
          }}
        >
          <Input type="date" aria-label="Desde" className="h-9 w-auto" value={f} onChange={(e) => setF(e.target.value)} />
          <Input type="date" aria-label="Hasta" className="h-9 w-auto" value={t} onChange={(e) => setT(e.target.value)} />
          <Button type="submit" size="sm">
            Aplicar
          </Button>
        </form>
      )}
    </div>
  );
}
