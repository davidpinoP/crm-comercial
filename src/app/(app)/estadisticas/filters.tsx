"use client";
import { useEffect, useState } from "react";
import { Input, NativeSelect } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSearchParamUpdater } from "@/components/app/filters";
import { useLookups } from "@/components/app/lookups";
import { CUSTOMER_STATUS_LABEL } from "@/lib/labels";
import { CUSTOMER_STATUSES } from "@/lib/types";

const KEYS = ["zona", "poblacion", "tipo", "estado", "resultado", "visita", "categoria"];

export function StatsFilters() {
  const { types, zones, results, categories } = useLookups();
  const { params, set, pending } = useSearchParamUpdater();
  const [city, setCity] = useState(params.get("poblacion") ?? "");
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("poblacion") ?? "") !== city) set({ poblacion: city });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);
  const active = KEYS.some((k) => params.get(k));
  const sel = "h-9 w-full sm:w-auto";
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" aria-busy={pending}>
      <NativeSelect className={sel} aria-label="Zona" value={params.get("zona") ?? ""} onChange={(e) => set({ zona: e.target.value })}>
        <option value="">Todas las zonas</option>
        {zones.map((z) => (
          <option key={z.id} value={z.id}>
            {z.name}
          </option>
        ))}
      </NativeSelect>
      <Input className="h-9 sm:w-40" aria-label="Población" placeholder="Población" value={city} onChange={(e) => setCity(e.target.value)} />
      <NativeSelect className={sel} aria-label="Tipo de establecimiento" value={params.get("tipo") ?? ""} onChange={(e) => set({ tipo: e.target.value })}>
        <option value="">Todos los tipos</option>
        {types.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect className={sel} aria-label="Estado comercial" value={params.get("estado") ?? ""} onChange={(e) => set({ estado: e.target.value })}>
        <option value="">Todos los estados</option>
        {CUSTOMER_STATUSES.map((s) => (
          <option key={s} value={s}>
            {CUSTOMER_STATUS_LABEL[s]}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect className={sel} aria-label="Resultado de prospección" value={params.get("resultado") ?? ""} onChange={(e) => set({ resultado: e.target.value })}>
        <option value="">Todos los resultados</option>
        <option value="none">Sin resultado</option>
        {results.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect className={sel} aria-label="Tipo de visita" value={params.get("visita") ?? ""} onChange={(e) => set({ visita: e.target.value })}>
        <option value="">Todas las visitas</option>
        <option value="prospect">A prospectos</option>
        <option value="customer">A clientes actuales</option>
      </NativeSelect>
      <NativeSelect className={sel} aria-label="Categoría de producto" value={params.get("categoria") ?? ""} onChange={(e) => set({ categoria: e.target.value })}>
        <option value="">Todas las categorías</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </NativeSelect>
      {active && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9"
          onClick={() => {
            setCity("");
            set(Object.fromEntries(KEYS.map((k) => [k, null])));
          }}
        >
          Quitar filtros
        </Button>
      )}
    </div>
  );
}
