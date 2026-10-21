import type { Metadata } from "next";
import Link from "next/link";
import { getContext, getWorkCalendar } from "@/lib/data/context";
import { zonesForDays } from "@/lib/data/zones";
import { addDaysISO, eachDayISO, formatDate, isoWeekday, madridDateKey, resolvePeriod, todayISO } from "@/lib/domain/dates";
import { isWorkday } from "@/lib/domain/goals";
import { WEEKDAY_LABEL } from "@/lib/labels";
import type { CalendarEvent, FollowUp } from "@/lib/types";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarView } from "./calendar-view";
import { DayZoneSelect, NewEventButton } from "./plan-controls";
import { SegmentedLinks } from "@/components/app/filters";

export const metadata: Metadata = { title: "Calendario y rutas" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const view = sp.vista === "plan" ? "plan" : "calendario";
  return (
    <>
      <PageHeader
        title="Calendario y rutas"
        description="Visitas, seguimientos y la zona comercial de cada día."
        actions={<NewEventButton />}
      />
      <SegmentedLinks
        param="vista"
        value={view}
        className="mb-4"
        options={[
          { value: "calendario", label: "Calendario" },
          { value: "plan", label: "Planificación semanal" },
        ]}
      />
      {view === "calendario" ? <CalendarView /> : <WeeklyPlan offset={Number(sp.semana) || 0} />}
    </>
  );
}

async function WeeklyPlan({ offset }: { offset: number }) {
  const ctx = await getContext();
  const today = todayISO();
  const week = resolvePeriod("week", addDaysISO(today, offset * 7));
  const [zones, cal, evRes, fuRes, overdueRes] = await Promise.all([
    zonesForDays(ctx, week.startDate, week.endDate),
    getWorkCalendar(ctx, week.startDate, week.endDate),
    ctx.supabase
      .from("calendar_events")
      .select("*, customer:customers(trade_name)")
      .is("deleted_at", null)
      .eq("status", "scheduled")
      .gte("starts_at", week.start.toISOString())
      .lt("starts_at", week.end.toISOString())
      .order("starts_at"),
    ctx.supabase.from("follow_ups").select("*").eq("status", "pending").gte("due_date", week.startDate).lte("due_date", week.endDate),
    ctx.supabase.from("follow_ups").select("id", { count: "exact", head: true }).eq("status", "pending").lt("due_date", today),
  ]);
  if (evRes.error || fuRes.error) throw new Error("No se ha podido cargar la planificación.");
  const events = evRes.data as (CalendarEvent & { customer: { trade_name: string } | null })[];
  const followUps = fuRes.data as FollowUp[];
  const [sh, sm] = ctx.settings.work_start_time.split(":").map(Number);
  const [eh, em] = ctx.settings.work_end_time.split(":").map(Number);
  const dayMinutes = Math.max(0, eh * 60 + em - (sh * 60 + sm));

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">
          Semana del {formatDate(week.startDate)} al {formatDate(week.endDate)}
          {(overdueRes.count ?? 0) > 0 && (
            <Link href="/seguimientos?filtro=vencidos" className="ml-2 font-medium text-negative hover:underline">
              {overdueRes.count} seguimientos vencidos
            </Link>
          )}
        </p>
        <div className="flex gap-1">
          <Button asChild size="sm" variant="secondary">
            <Link href={`?vista=plan&semana=${offset - 1}`}>Anterior</Link>
          </Button>
          {offset !== 0 && (
            <Button asChild size="sm" variant="secondary">
              <Link href="?vista=plan">Esta semana</Link>
            </Button>
          )}
          <Button asChild size="sm" variant="secondary">
            <Link href={`?vista=plan&semana=${offset + 1}`}>Siguiente</Link>
          </Button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {eachDayISO(week.startDate, week.endDate).map((d) => {
          const z = zones.get(d) ?? null;
          const dayEvents = events.filter((e) => madridDateKey(e.starts_at) === d);
          const dayFu = followUps.filter((f) => f.due_date === d);
          const working = isWorkday(cal, d);
          const busy = dayEvents.reduce((s, e) => s + (e.ends_at ? (Date.parse(e.ends_at) - Date.parse(e.starts_at)) / 60000 : 0), 0);
          const free = Math.max(0, dayMinutes - busy);
          return (
            <Card key={d} className={`p-4 ${d === today ? "ring-1 ring-accent" : ""} ${!working ? "opacity-70" : ""}`}>
              <div className="flex items-baseline justify-between">
                <p className="font-semibold">{WEEKDAY_LABEL[isoWeekday(d)]}</p>
                <p className="num text-[13px] text-ink-muted">{formatDate(d)}</p>
              </div>
              {!working && <p className="mt-1 text-[13px] text-ink-muted">Día no laborable</p>}
              <div className="mt-3">
                <DayZoneSelect date={d} zoneId={z?.id ?? null} />
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-[12px] text-ink-muted">
                <div className="rounded-lg bg-sunken py-1.5">
                  <dd className="num text-[15px] font-semibold text-ink">{z?.daily_prospecting_target ?? "—"}</dd>
                  <dt className="truncate px-1" title="Objetivo de puertas frías de la zona">Puertas</dt>
                </div>
                <div className="rounded-lg bg-sunken py-1.5">
                  <dd className="num text-[15px] font-semibold text-ink">{dayEvents.length}</dd>
                  <dt className="truncate px-1">Citas</dt>
                </div>
                <div className="rounded-lg bg-sunken py-1.5">
                  <dd className="num text-[15px] font-semibold text-ink">{dayFu.length}</dd>
                  <dt className="truncate px-1" title="Seguimientos previstos">Seguim.</dt>
                </div>
              </dl>
              {working && dayMinutes > 0 && (
                <p className="mt-2 text-[12px] text-ink-muted">
                  Tiempo libre estimado: {Math.floor(free / 60)} h {free % 60 ? `${Math.round(free % 60)} min` : ""}
                </p>
              )}
              {dayEvents.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-line pt-2 text-[13px]">
                  {dayEvents.map((e) => (
                    <li key={e.id} className="flex gap-2">
                      <span className="num text-ink-muted">{new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" }).format(new Date(e.starts_at))}</span>
                      <span className="truncate">{e.customer?.trade_name ?? e.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
      <p className="mt-3 text-[12px] text-ink-faint">
        La zona de cada día sale de la asignación semanal (Configuración → Zonas) salvo que la cambies aquí para una fecha concreta. Programar visitas en otra zona sigue siendo posible.
      </p>
    </>
  );
}
