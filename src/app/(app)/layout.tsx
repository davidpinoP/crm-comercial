import { getContext } from "@/lib/data/context";
import { zonesForDays } from "@/lib/data/zones";
import { todayISO } from "@/lib/domain/dates";
import { AppShell } from "@/components/app/shell";
import { LookupsProvider } from "@/components/app/lookups";
import { QuickActionsProvider } from "@/components/app/quick-actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();
  const today = todayISO();
  const zone = (await zonesForDays(ctx, today, today)).get(today) ?? null;
  return (
    <LookupsProvider
      value={{ types: ctx.types, results: ctx.results, categories: ctx.categories, zones: ctx.zones, today, todayZoneId: zone?.id ?? null }}
    >
      <QuickActionsProvider>
        <AppShell userLabel={ctx.profile?.full_name || ctx.user.email || "Mi cuenta"} todayZone={zone ? { name: zone.name, color: zone.color } : null}>
          {children}
        </AppShell>
      </QuickActionsProvider>
    </LookupsProvider>
  );
}
