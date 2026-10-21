import type { Metadata } from "next";
import { getContext } from "@/lib/data/context";
import { weekdayAssignments } from "@/lib/data/zones";
import type { Product } from "@/lib/types";
import { PageHeader } from "@/components/app/page-header";
import { SettingsTabs } from "./tabs";

export const metadata: Metadata = { title: "Configuración" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const [products, weekly, demo] = await Promise.all([
    ctx.supabase.from("products").select("*").order("name"),
    weekdayAssignments(ctx),
    ctx.supabase.from("customers").select("id", { count: "exact", head: true }).eq("is_demo", true),
  ]);
  if (products.error) throw new Error(`No se ha podido cargar el catálogo: ${products.error.message}`);
  return (
    <>
      <PageHeader title="Configuración" />
      <SettingsTabs
        initialTab={sp.tab ?? "perfil"}
        email={ctx.user.email ?? ""}
        profile={ctx.profile}
        settings={ctx.settings}
        types={ctx.types}
        results={ctx.results}
        categories={ctx.categories}
        zones={ctx.zones}
        weekly={Object.fromEntries(weekly)}
        products={products.data as Product[]}
        commission={ctx.commission}
        tiers={ctx.tiers}
        hasDemo={(demo.count ?? 0) > 0}
      />
    </>
  );
}
