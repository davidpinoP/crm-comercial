import Link from "next/link";
import { CalendarClock, ClipboardList, DoorOpen, Footprints, PhoneCall, ShoppingBag } from "lucide-react";
import { getContext, getWorkCalendar, resultFlags } from "@/lib/data/context";
import { loadPeriodData } from "@/lib/data/analytics";
import { reactivationCandidates } from "@/lib/data/customers";
import { loadGoals, resolveGoal } from "@/lib/data/goals";
import { periodFromParams } from "@/lib/data/period";
import { zonesForDays } from "@/lib/data/zones";
import { dailySeries, snapshot } from "@/lib/domain/analytics";
import { computeCommission } from "@/lib/domain/commissions";
import {
  addDaysISO,
  addMonthsISO,
  formatDate,
  madridTime,
  monthEndISO,
  monthLabel,
  monthStartISO,
  previousPeriod,
  relativeDayLabel,
  startOfMadridDay,
  todayISO,
  WEEKDAY_FULL,
} from "@/lib/domain/dates";
import { goalProgress } from "@/lib/domain/goals";
import { average, compare, countProspecting, formatRatio, rate } from "@/lib/domain/metrics";
import { formatEUR, formatEURCompact, formatPercentBp } from "@/lib/domain/money";
import { EVENT_TYPE_LABEL, FOLLOW_UP_TYPE_LABEL, ORDER_STATUS_LABEL } from "@/lib/labels";
import type { CalendarEvent, FollowUp } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Kpi, KpiGrid } from "@/components/app/kpi";
import { PeriodPicker } from "@/components/app/period-picker";
import { ProspectingActions } from "@/components/app/prospecting-actions";
import { BarSeriesChart, LineSeriesChart } from "@/components/app/charts";
import { HBars, ProgressBar } from "@/components/app/hbars";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const today = todayISO();
  const period = periodFromParams(sp, "today");
  const prev = previousPeriod(period);
  const month = monthStartISO(today);
  const monthEnd = monthEndISO(month);
  const chartStart = addMonthsISO(month, -5);
  const from = [prev.startDate, chartStart, addDaysISO(today, -29)].sort()[0];
  const to = [period.endDate, monthEnd].sort().at(-1)!;

  const [data, goals, cal, zones, candidates, eventsRes, fuRes] = await Promise.all([
    loadPeriodData(ctx, from, to),
    loadGoals(ctx),
    getWorkCalendar(ctx, month, monthEnd),
    zonesForDays(ctx, today, today),
    reactivationCandidates(ctx),
    ctx.supabase
      .from("calendar_events")
      .select("*, customer:customers(id, trade_name, city)")
      .is("deleted_at", null)
      .eq("status", "scheduled")
      .gte("starts_at", startOfMadridDay(today).toISOString())
      .lt("starts_at", startOfMadridDay(addDaysISO(today, 8)).toISOString())
      .order("starts_at")
      .limit(30),
    ctx.supabase
      .from("follow_ups")
      .select("*, customer:customers(id, trade_name, phone)")
      .eq("status", "pending")
      .lte("due_date", today)
      .order("due_date")
      .limit(30),
  ]);
  const flags = resultFlags(ctx);
  const countable = ctx.settings.countable_order_statuses;
  const bt = ctx.commission.base_type;

  const cur = snapshot(data, period.startDate, period.endDate, flags, countable, bt);
  const before = snapshot(data, prev.startDate, prev.endDate, flags, countable, bt);
  const m = snapshot(data, month, monthEnd, flags, countable, bt);
  const prevMonthStart = addMonthsISO(month, -1);
  const pm = snapshot(data, prevMonthStart, monthEndISO(prevMonthStart), flags, countable, bt);

  const commission = computeCommission(m.revenue.computable.netCents, ctx.tiers, ctx.commission.method);
  const revenueGoal = resolveGoal(goals, "month", month, "revenue");
  const gp = revenueGoal ? goalProgress(revenueGoal.target_value, m.revenue.computable.netCents, month, monthEnd, today, cal) : null;
  const ticket = average(m.revenue.computable.netCents, m.revenue.computable.orderCount);
  const prevTicket = average(pm.revenue.computable.netCents, pm.revenue.computable.orderCount);

  const daily = dailySeries(data, addDaysISO(today, -29), today, flags, countable, bt);
  const months = Array.from({ length: 6 }, (_, i) => addMonthsISO(chartStart, i));
  const monthly = months.map((ms) => {
    const s = snapshot(data, ms, monthEndISO(ms), flags, countable, bt);
    const per100 = rate(s.newCustomers, s.prospecting.coldCalls);
    return {
      mes: monthLabel(ms).slice(0, 3),
      ventas: s.revenue.computable.netCents,
      nuevos: s.newCustomers,
      conversion: per100.kind === "ok" ? Number(per100.value.toFixed(1)) : null,
      contacto: (() => {
        const r = rate(s.prospecting.effectiveContacts, s.prospecting.coldCalls);
        return r.kind === "ok" ? Number(r.value.toFixed(1)) : null;
      })(),
    };
  });

  const periodActs = data.activities.filter((a) => {
    const d = new Date(a.occurred_at).getTime();
    return d >= period.start.getTime() && d < period.end.getTime();
  });
  const distribution = ctx.results
    .map((r) => ({ label: r.name, value: periodActs.filter((a) => a.result_id === r.id).length }))
    .concat([{ label: "Sin resultado / provisional", value: periodActs.filter((a) => !a.result_id).length }])
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);

  const events = (eventsRes.data ?? []) as (CalendarEvent & { customer: { id: string; trade_name: string; city: string | null } | null })[];
  const todayEvents = events.filter((e) => e.starts_at < startOfMadridDay(addDaysISO(today, 1)).toISOString());
  const upcoming = events.filter((e) => !todayEvents.includes(e)).slice(0, 6);
  const fus = (fuRes.data ?? []) as (FollowUp & { customer: { id: string; trade_name: string; phone: string | null } | null })[];
  const overdue = fus.filter((f) => f.due_date! < today);
  const dueToday = fus.filter((f) => f.due_date === today);

  // Actividad reciente
  const recentQueries = await Promise.all([
    ctx.supabase.from("prospecting_activities").select("id, occurred_at, establishment_name, is_provisional, customer:customers(id, trade_name)").is("deleted_at", null).order("created_at", { ascending: false }).limit(6),
    ctx.supabase.from("orders").select("id, created_at, status, customer:customers(id, trade_name)").is("deleted_at", null).order("created_at", { ascending: false }).limit(4),
    ctx.supabase.from("visits").select("id, occurred_at, created_at, customer:customers(id, trade_name)").is("deleted_at", null).order("created_at", { ascending: false }).limit(4),
  ]);
  type Recent = { at: string; icon: "door" | "order" | "visit"; text: string; href?: string };
  const one = <T,>(x: T | T[] | null) => (Array.isArray(x) ? x[0] : x);
  const recent: Recent[] = [
    ...((recentQueries[0].data ?? []) as unknown as { id: string; occurred_at: string; establishment_name: string | null; is_provisional: boolean; customer: { id: string; trade_name: string } | null }[]).map((a) => ({
      at: a.occurred_at,
      icon: "door" as const,
      text: `Puerta fría${a.is_provisional ? " (incompleta)" : ""}: ${one(a.customer)?.trade_name ?? a.establishment_name ?? "sin identificar"}`,
      href: one(a.customer) ? `/clientes/${one(a.customer)!.id}` : "/prospeccion",
    })),
    ...((recentQueries[1].data ?? []) as unknown as { id: string; created_at: string; status: keyof typeof ORDER_STATUS_LABEL; customer: { trade_name: string } | null }[]).map((o) => ({
      at: o.created_at,
      icon: "order" as const,
      text: `Pedido ${ORDER_STATUS_LABEL[o.status].toLowerCase()}: ${one(o.customer)?.trade_name ?? ""}`,
      href: `/ventas/${o.id}`,
    })),
    ...((recentQueries[2].data ?? []) as unknown as { id: string; created_at: string; customer: { id: string; trade_name: string } | null }[]).map((v) => ({
      at: v.created_at,
      icon: "visit" as const,
      text: `Visita realizada: ${one(v.customer)?.trade_name ?? ""}`,
      href: one(v.customer) ? `/clientes/${one(v.customer)!.id}` : undefined,
    })),
  ]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 8);

  const zone = zones.get(today) ?? null;
  const eur = (c: number) => formatEUR(c);
  const greetingDate = `${WEEKDAY_FULL(today)}, ${formatDate(today)}`;

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-ink-muted first-letter:uppercase">
            {greetingDate}
            {zone && (
              <>
                {" "}
                · zona <span className="font-medium text-ink">{zone.name}</span>
                {zone.daily_prospecting_target ? ` (objetivo ${zone.daily_prospecting_target} puertas)` : ""}
              </>
            )}
          </p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.02em] lg:text-[30px]">
            {ctx.profile?.full_name ? `Hola, ${ctx.profile.full_name.split(" ")[0]}` : "Tu jornada"}
          </h1>
        </div>
        <ProspectingActions size="lg" />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">{period.kind === "custom" ? period.label : period.label}</h2>
        <PeriodPicker value={sp.periodo === "custom" ? "custom" : period.kind} from={sp.desde} to={sp.hasta} />
      </div>
      <KpiGrid className="mb-6 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
        <Kpi label="Puertas frías" value={String(cur.prospecting.coldCalls)} change={compare(cur.prospecting.coldCalls, before.prospecting.coldCalls)} />
        <Kpi label="Contactos efectivos" value={String(cur.prospecting.effectiveContacts)} change={compare(cur.prospecting.effectiveContacts, before.prospecting.effectiveContacts)} />
        <Kpi label="Nuevos prospectos" value={String(cur.newProspects)} change={compare(cur.newProspects, before.newProspects)} />
        <Kpi label="Interesados" value={String(cur.prospecting.interested)} change={compare(cur.prospecting.interested, before.prospecting.interested)} />
        <Kpi label="Visitas a clientes" value={String(cur.visits.customer)} change={compare(cur.visits.customer, before.visits.customer)} />
        <Kpi label="Visitas a prospectos" value={String(cur.visits.prospect)} change={compare(cur.visits.prospect, before.visits.prospect)} />
        <Kpi label="Seguimientos hechos" value={String(cur.followUpsDone)} change={compare(cur.followUpsDone, before.followUpsDone)} />
        <Kpi label="Pedidos" value={String(cur.validOrders)} change={compare(cur.validOrders, before.validOrders)} />
        <Kpi
          label="Facturación"
          value={eur(cur.revenue.computable.netCents)}
          change={compare(cur.revenue.computable.netCents, before.revenue.computable.netCents)}
          deltaFormat={formatEURCompact}
          hint="Base computable neta de devoluciones"
        />
      </KpiGrid>

      <div className="mb-6 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={`Resumen de ${monthLabel(month).toLowerCase()}`} description={`Comparado con ${monthLabel(prevMonthStart).toLowerCase()}`} />
          <CardBody>
            <KpiGrid className="grid-cols-2 sm:grid-cols-4">
              <Kpi label="Puertas frías" value={String(m.prospecting.coldCalls)} change={compare(m.prospecting.coldCalls, pm.prospecting.coldCalls)} />
              <Kpi label="Visitas comerciales" value={String(m.visits.commercial)} change={compare(m.visits.commercial, pm.visits.commercial)} />
              <Kpi label="Nuevos clientes" value={String(m.newCustomers)} change={compare(m.newCustomers, pm.newCustomers)} />
              <Kpi label="Reactivados" value={String(m.reactivated)} change={compare(m.reactivated, pm.reactivated)} />
              <Kpi label="Pedidos" value={String(m.validOrders)} change={compare(m.validOrders, pm.validOrders)} />
              <Kpi label="Facturación" value={eur(m.revenue.computable.netCents)} change={compare(m.revenue.computable.netCents, pm.revenue.computable.netCents)} deltaFormat={formatEURCompact} />
              <Kpi
                label="Ticket medio"
                value={ticket.kind === "ok" ? eur(Math.round(ticket.value)) : "Datos insuficientes"}
                change={ticket.kind === "ok" && prevTicket.kind === "ok" ? compare(ticket.value, prevTicket.value) : undefined}
              />
              <Kpi label={ctx.commission.method_confirmed ? "Comisión estimada" : "Comisión (provisional)"} value={eur(commission.amountCents)} hint={`${commission.tierLabel} · ${formatPercentBp(commission.rateBp)}`} />
            </KpiGrid>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <div className="mb-1.5 flex items-baseline justify-between text-sm">
                  <span className="text-ink-muted">Objetivo mensual</span>
                  {gp ? (
                    <span className="num font-medium">
                      {formatRatio(gp.completion, 0)} de {eur(gp.target)}
                    </span>
                  ) : (
                    <Link href="/objetivos" className="font-medium text-accent hover:underline">
                      Definir objetivo
                    </Link>
                  )}
                </div>
                <ProgressBar value={m.revenue.computable.netCents} max={gp?.target ?? 0} />
                {gp && (
                  <p className="mt-1.5 text-[13px] text-ink-muted">
                    {gp.status === "achieved"
                      ? "Objetivo alcanzado."
                      : gp.requiredPerDay != null
                        ? `Faltan ${eur(gp.remaining)} · ${eur(Math.ceil(gp.requiredPerDay))} por día laborable (${gp.workdaysRemaining} días)`
                        : `Faltan ${eur(gp.remaining)}`}
                  </p>
                )}
              </div>
              <div>
                <div className="mb-1.5 flex items-baseline justify-between text-sm">
                  <span className="text-ink-muted">Siguiente tramo de comisión</span>
                  <span className="num font-medium">{commission.next ? `faltan ${eur(commission.next.remainingCents)}` : "Tramo máximo"}</span>
                </div>
                <ProgressBar value={Math.max(0, m.revenue.computable.netCents)} max={commission.next?.thresholdCents ?? 1} />
                <p className="mt-1.5 text-[13px] text-ink-muted">
                  {commission.next ? `Al llegar a ${eur(commission.next.thresholdCents)} pasas al ${formatPercentBp(commission.next.rateBp)}.` : `Aplicas el ${formatPercentBp(commission.rateBp)}.`}
                </p>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Próximas acciones" />
          <CardBody className="space-y-4 pt-3 text-sm">
            <ActionGroup icon={<CalendarClock />} title="Visitas de hoy" empty="Nada programado para hoy." href="/calendario">
              {todayEvents.map((e) => (
                <li key={e.id} className="flex min-w-0 gap-2">
                  <span className="num shrink-0 text-ink-muted">{madridTime(e.starts_at)}</span>
                  <Link href={e.customer ? `/clientes/${e.customer.id}` : "/calendario"} className="truncate hover:underline">
                    {e.customer?.trade_name ?? e.title}
                  </Link>
                </li>
              ))}
            </ActionGroup>
            <ActionGroup icon={<ClipboardList />} title={`Seguimientos vencidos${overdue.length ? ` (${overdue.length})` : ""}`} empty="Ninguno vencido." href="/seguimientos?filtro=vencidos" tone="negative" show={overdue.length > 0}>
              {overdue.slice(0, 4).map((f) => (
                <li key={f.id} className="flex min-w-0 gap-2">
                  <span className="num shrink-0 whitespace-nowrap text-negative">{formatDate(f.due_date!).slice(0, 5)}</span>
                  <Link href={`/clientes/${f.customer_id}`} className="truncate hover:underline">
                    {f.customer?.trade_name} · {FOLLOW_UP_TYPE_LABEL[f.follow_up_type]}
                  </Link>
                </li>
              ))}
            </ActionGroup>
            <ActionGroup icon={<ClipboardList />} title="Seguimientos para hoy" empty="Ninguno para hoy." href="/seguimientos">
              {dueToday.slice(0, 4).map((f) => (
                <li key={f.id} className="truncate">
                  <Link href={`/clientes/${f.customer_id}`} className="hover:underline">
                    {f.customer?.trade_name} · {FOLLOW_UP_TYPE_LABEL[f.follow_up_type]}
                  </Link>
                </li>
              ))}
            </ActionGroup>
            <ActionGroup icon={<PhoneCall />} title="Clientes que necesitan contacto" empty="Todos tus clientes compran con regularidad." href="/clientes?vista=reactivar">
              {candidates.slice(0, 3).map((c) => (
                <li key={c.id} className="flex gap-2">
                  <Link href={`/clientes/${c.id}`} className="truncate hover:underline">
                    {c.trade_name}
                  </Link>
                  <span className="shrink-0 text-ink-muted">{c.days} días</span>
                </li>
              ))}
            </ActionGroup>
            <ActionGroup icon={<CalendarClock />} title="Próximos eventos" empty="Sin eventos en los próximos días." href="/calendario">
              {upcoming.map((e) => (
                <li key={e.id} className="flex gap-2">
                  <span className="num shrink-0 text-ink-muted">{formatDate(e.starts_at).slice(0, 5)}</span>
                  <span className="truncate">
                    {e.customer?.trade_name ?? e.title} · {EVENT_TYPE_LABEL[e.event_type]}
                  </span>
                </li>
              ))}
            </ActionGroup>
          </CardBody>
        </Card>
      </div>

      <div className="mb-6 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Actividad diaria" description="Últimos 30 días · puertas frías y visitas realizadas" />
          <CardBody className="pt-2">
            <BarSeriesChart
              data={daily.map((d) => ({ dia: formatDate(d.date).slice(0, 5), puertas: d.coldCalls, visitas: d.visits }))}
              xKey="dia"
              series={[
                { key: "puertas", name: "Puertas frías" },
                { key: "visitas", name: "Visitas" },
              ]}
              target={zone?.daily_prospecting_target}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Facturación mensual" description="Base computable neta de devoluciones" />
          <CardBody className="pt-2">
            <BarSeriesChart data={monthly} xKey="mes" series={[{ key: "ventas", name: "Facturación" }]} format="eur" target={revenueGoal?.target_value} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Nuevos clientes" description="Prospectos que pasaron a cliente cada mes" />
          <CardBody className="pt-2">
            <BarSeriesChart data={monthly} xKey="mes" series={[{ key: "nuevos", name: "Nuevos clientes" }]} height={200} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Evolución de la conversión" description="Tasa de contacto efectivo y nuevos clientes por cada 100 puertas frías" />
          <CardBody className="pt-2">
            <LineSeriesChart
              data={monthly}
              xKey="mes"
              series={[
                { key: "contacto", name: "Contacto efectivo (%)" },
                { key: "conversion", name: "Clientes / 100 puertas" },
              ]}
              format="pct"
              height={200}
            />
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Resultados de prospección" description={`${period.label} · ${countProspecting(periodActs, flags).coldCalls} puertas`} />
          <CardBody className="pt-3">
            <HBars rows={distribution} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Actividad reciente" />
          <CardBody className="pt-3">
            {recent.length === 0 ? (
              <p className="text-sm text-ink-muted">Todavía no hay actividad. Empieza registrando tu primera puerta fría.</p>
            ) : (
              <ul className="space-y-2.5 text-sm">
                {recent.map((r, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-sunken text-ink-muted [&_svg]:size-3.5">
                      {r.icon === "door" ? <DoorOpen /> : r.icon === "order" ? <ShoppingBag /> : <Footprints />}
                    </span>
                    {r.href ? (
                      <Link href={r.href} className="min-w-0 flex-1 truncate hover:underline">
                        {r.text}
                      </Link>
                    ) : (
                      <span className="min-w-0 flex-1 truncate">{r.text}</span>
                    )}
                    <span className="num shrink-0 text-[12px] text-ink-muted">{relativeDayLabel(formatDateKey(r.at), today)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function formatDateKey(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date(iso));
}

function ActionGroup({
  icon,
  title,
  empty,
  href,
  children,
  tone,
  show,
}: {
  icon: React.ReactNode;
  title: string;
  empty: string;
  href: string;
  children: React.ReactNode;
  tone?: "negative";
  show?: boolean;
}) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  const has = show ?? items.length > 0;
  return (
    <section>
      <Link href={href} className={`mb-1.5 flex items-center gap-2 font-medium hover:underline ${tone === "negative" && has ? "text-negative" : ""} [&_svg]:size-4 [&_svg]:text-ink-faint`}>
        {icon}
        {title}
      </Link>
      {has ? <ul className="space-y-1 pl-6 text-[13px]">{children}</ul> : <p className="pl-6 text-[13px] text-ink-muted">{empty}</p>}
    </section>
  );
}
