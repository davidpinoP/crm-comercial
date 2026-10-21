"use client";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input, NativeSelect } from "@/components/ui/input";
import { useSearchParamUpdater } from "@/components/app/filters";
import { useLookups } from "@/components/app/lookups";
import { CUSTOMER_STATUS_LABEL } from "@/lib/labels";
import { CUSTOMER_STATUSES } from "@/lib/types";

export function CustomerFilters() {
  const { types, zones } = useLookups();
  const { params, set, pending } = useSearchParamUpdater();
  const [q, setQ] = useState(params.get("q") ?? "");

  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) set({ q, pagina: null });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="mb-4 grid gap-2 sm:flex sm:flex-wrap sm:items-center" aria-busy={pending}>
      <div className="relative sm:w-72">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, población, teléfono…" className="h-9 pl-9" aria-label="Buscar clientes" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <NativeSelect className="h-9 sm:w-auto" aria-label="Estado" value={params.get("estado") ?? ""} onChange={(e) => set({ estado: e.target.value, pagina: null })}>
          <option value="">Todos los estados</option>
          {CUSTOMER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {CUSTOMER_STATUS_LABEL[s]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect className="h-9 sm:w-auto" aria-label="Tipo" value={params.get("tipo") ?? ""} onChange={(e) => set({ tipo: e.target.value, pagina: null })}>
          <option value="">Todos los tipos</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </NativeSelect>
        {zones.length > 0 && (
          <NativeSelect className="h-9 sm:w-auto" aria-label="Zona" value={params.get("zona") ?? ""} onChange={(e) => set({ zona: e.target.value, pagina: null })}>
            <option value="">Todas las zonas</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </NativeSelect>
        )}
        <NativeSelect
          className="h-9 sm:w-auto"
          aria-label="Vista"
          value={params.get("vista") ?? ""}
          onChange={(e) => set({ vista: e.target.value, pagina: null })}
        >
          <option value="">Activos</option>
          <option value="reactivar">Candidatos a reactivar</option>
          <option value="archivados">Archivados</option>
        </NativeSelect>
      </div>
    </div>
  );
}
