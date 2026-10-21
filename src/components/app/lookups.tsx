"use client";
import { createContext, useContext } from "react";
import type { EstablishmentType, ProductCategory, ProspectingResult, Zone } from "@/lib/types";

export interface Lookups {
  types: EstablishmentType[];
  results: ProspectingResult[];
  categories: ProductCategory[];
  zones: Zone[];
  today: string;
  todayZoneId: string | null;
}

const Ctx = createContext<Lookups | null>(null);

export function LookupsProvider({ value, children }: { value: Lookups; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLookups(): Lookups {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLookups fuera de LookupsProvider");
  return v;
}
