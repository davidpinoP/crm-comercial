import type { Metadata } from "next";
import { DoorOpen } from "lucide-react";
import { getContext, resultFlags } from "@/lib/data/context";
import { loadActivities } from "@/lib/data/activities";
import { zonesForDays } from "@/lib/data/zones";
import { addDaysISO, todayISO } from "@/lib/domain/dates";
import { countProspecting, effectiveContactRate, formatRatio, interestRate } from "@/lib/domain/metrics";
import { PageHeader } from "@/components/app/page-header";
import { ProspectingActions } from "@/components/app/prospecting-actions";
import { ActivityList } from "@/components/app/activity-list";
import { ProspectingFilters } from "./filters";
import { Tally } from "@/components/app/tally";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Prospección" };

const RANGES: Record<string, number> = { hoy: 0, "7": 6, "30": 29, "90": 89 };

export default async function ProspectingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const today = todayISO();
  const range = sp.rango && sp.rango in RANGES ? sp.rango : "7";
  const from = addDaysISO(today, -RANGES[range]);

  const [todayActs, list, zones] = await Promise.all([
    loadActivities(ctx, today, today),
    loadActivities(ctx, from, today, { resultId: sp.resultado, onlyIncomplete: sp.incompletas === "1", limit: 500 }),
    zonesForDays(ctx, today, today),
  ]);

  const flags = resultFlags(ctx);
  const c = countProspecting(todayActs, flags);
  const zone = zones.get(today) ?? null;
  const target = zone?.daily_prospecting_target ?? null;

  return (
    <>
      <PageHeader title="Prospección" description="Cada puerta cuenta en cuanto la registras. Completa los detalles cuando puedas." />

      <Card className="mb-6 p-5 sm:p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm text-ink-muted">
              Puertas frías hoy{zone ? ` · ${zone.name}` : ""}
              {target ? ` · objetivo ${target}` : ""}
            </p>
            <p className="num mt-1 text-[56px] leading-none font-semibold tracking-[-0.04em]">{c.coldCalls}</p>
            <Tally count={c.coldCalls} target={target} className="mt-4" />
          </div>
          <div className="flex flex-col gap-4 lg:items-end">
            <ProspectingActions />
            <dl className="grid grid-cols-3 gap-4 text-sm lg:text-right">
              <div>
                <dt className="text-ink-muted">Contactos</dt>
                <dd className="num text-lg font-semibold">{c.effectiveContacts}</dd>
                <dd className="text-[12px] text-ink-faint">{formatRatio(effectiveContactRate(c), 0)}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Interesados</dt>
                <dd className="num text-lg font-semibold">{c.interested}</dd>
                <dd className="text-[12px] text-ink-faint">{formatRatio(interestRate(c), 0)}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Incompletas</dt>
                <dd className="num text-lg font-semibold">{c.provisional}</dd>
                <dd className="text-[12px] text-ink-faint">por completar</dd>
              </div>
            </dl>
          </div>
        </div>
      </Card>

      <ProspectingFilters range={range} />

      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<DoorOpen />}
            title={sp.resultado || sp.incompletas ? "No hay actividades con estos filtros" : "Todavía no hay prospecciones en este periodo"}
            description="Pulsa «Nueva prospección» al salir de cada establecimiento, o «+1 puerta fría» si solo quieres sumar la visita."
          />
        </Card>
      ) : (
        <ActivityList activities={list} />
      )}
      {list.length >= 500 && <p className="mt-4 text-center text-sm text-ink-muted">Se muestran las 500 más recientes. Acota el periodo para ver el resto.</p>}
    </>
  );
}
