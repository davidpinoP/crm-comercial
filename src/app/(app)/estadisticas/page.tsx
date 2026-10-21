import type { Metadata } from "next";
import { Download } from "lucide-react";
import { getContext, getWorkCalendar, resultFlags } from "@/lib/data/context";
import { loadPeriodData } from "@/lib/data/analytics";
import { periodFromParams } from "@/lib/data/period";
import { filterByCustomer, revenueBy, snapshot, type PeriodData } from "@/lib/domain/analytics";
import {
  addMonthsISO,
  daysBetweenInclusive,
  eachDayISO,
  formatDate,
  madridDateKey,
  monthEndISO,
  monthLabel,
  monthStartISO,
  previousPeriod,
  todayISO,
} from "@/lib/domain/dates";
import { hoursWorked, workdaysIn } from "@/lib/domain/goals";
import {
  average,
  closeRates,
  cohortConversion,
  compare,
  effectiveContactRate,
  formatNumber,
  formatRatio,
  interestRate,
  rate,
  repurchaseFrequencyDays,
  timeToFirstOrderDays,
  type OrderLite,
  type Ratio,
} from "@/lib/domain/metrics";
import { formatEUR } from "@/lib/domain/money";
import { netOrderBase } from "@/lib/domain/revenue";
import type { OrderItem } from "@/lib/types";
import { PageHeader } from "@/components/app/page-header";
import { PeriodPicker } from "@/components/app/period-picker";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Kpi, KpiGrid } from "@/components/app/kpi";
import { BarSeriesChart, LineSeriesChart } from "@/components/app/charts";
import { HBars } from "@/components/app/hbars";
import { Button } from "@/components/ui/button";
import { StatsFilters } from "./filters";

export const metadata: Metadata = { title: "Estadísticas" };

const ratioOrNull = (r: Ratio) => (r.kind === "ok" ? Number(r.value.toFixed(1)) : null);
const fmtAvg = (r: Ratio, unit: string, d = 1) => (r.kind === "ok" ? `${formatNumber(r.value, d)} ${unit}` : "Datos insuficientes");

export default async function StatsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const today = todayISO();
  const period = periodFromParams(sp, "month");
  const prev = previousPeriod(period);
  const trendStart = addMonthsISO(monthStartISO(period.endDate), -11);
  const from = [prev.startDate, trendStart].sort()[0];

  const [raw, cal] = await Promise.all([loadPeriodData(ctx, from, period.endDate), getWorkCalendar(ctx, period.startDate, period.endDate)]);
  const flags = resultFlags(ctx);
  const countable = ctx.settings.countable_order_statuses;
  const bt = ctx.commission.base_type;

  let data: PeriodData = filterByCustomer(raw, { zone: sp.zona, city: sp.poblacion, type: sp.tipo, status: sp.estado });
  if (sp.resultado) data = { ...data, activities: data.activities.filter((a) => (sp.resultado === "none" ? !a.result_id : a.result_id === sp.resultado)) };
  if (sp.visita === "prospect" || sp.visita === "customer") data = { ...data, visits: data.visits.filter((v) => v.visit_kind === sp.visita) };

  // Filtro por categoría de producto: pedidos que contienen líneas de esa categoría (importe sólo de esas líneas)
  const periodOrderIds = data.orders.filter((o) => o.order_date >= period.startDate && o.order_date <= period.endDate).map((o) => o.id);
  let items: OrderItem[] = [];
  for (let i = 0; i < periodOrderIds.length; i += 150) {
    const { data: rows, error } = await ctx.supabase.from("order_items").select("*").in("order_id", periodOrderIds.slice(i, i + 150));
    if (error) throw new Error(`No se han podido cargar las líneas: ${error.message}`);
    items.push(...((rows ?? []) as OrderItem[]));
  }
  if (sp.categoria) {
    items = items.filter((i) => i.category_id === sp.categoria);
    const base = new Map<string, { base: number; vat: number }>();
    for (const i of items) {
      const b = base.get(i.order_id) ?? { base: 0, vat: 0 };
      b.base += Number(i.base_cents);
      b.vat += Number(i.vat_cents);
      base.set(i.order_id, b);
    }
    data = {
      ...data,
      orders: data.orders
        .filter((o) => base.has(o.id))
        .map((o) => ({ ...o, base_cents: base.get(o.id)!.base, vat_cents: base.get(o.id)!.vat, total_cents: base.get(o.id)!.base + base.get(o.id)!.vat, returns: [] })),
    };
  }

  const s = snapshot(data, period.startDate, period.endDate, flags, countable, bt);
  const p = snapshot(data, prev.startDate, prev.endDate, flags, countable, bt);
  const visitsInPeriod = data.visits.filter((v) => {
    const t = Date.parse(v.occurred_at);
    return t >= period.start.getTime() && t < period.end.getTime();
  });
  const orderLite: OrderLite[] = data.orders.map((o) => ({
    id: o.id,
    customer_id: o.customer_id,
    order_date: o.order_date,
    status: o.status,
    visit_id: (o as { visit_id?: string | null }).visit_id ?? null,
    net_base_cents: netOrderBase(o),
  }));
  const periodOrders = orderLite.filter((o) => o.order_date >= period.startDate && o.order_date <= period.endDate);
  const close = closeRates(visitsInPeriod, periodOrders);
  const days = workdaysIn(cal, period.startDate, [period.endDate, today].sort()[0]);
  const hours = hoursWorked(cal, period.startDate, [period.endDate, today].sort()[0]);
  const cohort = cohortConversion(
    data.customers.map((c) => ({ ...c, started_as_prospect: c.initial_status ? !c.initial_status.startsWith("customer_") : true })), period.startDate, period.endDate, today, ctx.settings.cohort_maturity_days);
  const net = s.revenue.computable.netCents;

  // Series
  const longPeriod = daysBetweenInclusive(period.startDate, period.endDate) > 62;
  const dayRows = longPeriod
    ? []
    : eachDayISO(period.startDate, period.endDate).map((d) => {
        const x = snapshot(data, d, d, flags, countable, bt);
        return { dia: formatDate(d).slice(0, 5), puertas: x.prospecting.coldCalls, contactos: x.prospecting.effectiveContacts, visitas: x.visits.total };
      });
  const weeks: { semana: string; puertas: number; visitas: number; ventas: number }[] = [];
  {
    const all = eachDayISO(period.startDate, period.endDate);
    for (let i = 0; i < all.length; i += 7) {
      const a = all[i];
      const b = all[Math.min(i + 6, all.length - 1)];
      const x = snapshot(data, a, b, flags, countable, bt);
      weeks.push({ semana: formatDate(a).slice(0, 5), puertas: x.prospecting.coldCalls, visitas: x.visits.total, ventas: x.revenue.computable.netCents });
    }
  }
  const months = Array.from({ length: 12 }, (_, i) => addMonthsISO(trendStart, i)).map((ms) => {
    const x = snapshot(data, ms, monthEndISO(ms), flags, countable, bt);
    const lite = orderLite.filter((o) => o.order_date >= ms && o.order_date <= monthEndISO(ms));
    const vis = data.visits.filter((v) => madridDateKey(v.occurred_at) >= ms && madridDateKey(v.occurred_at) <= monthEndISO(ms));
    return {
      mes: monthLabel(ms).slice(0, 3),
      puertas: x.prospecting.coldCalls,
      visitas: x.visits.total,
      ventas: x.revenue.computable.netCents,
      nuevos: x.newCustomers,
      ticket: ratioOrNull(average(x.revenue.computable.netCents, x.revenue.computable.orderCount)),
      contacto: ratioOrNull(effectiveContactRate(x.prospecting)),
      cierre: ratioOrNull(closeRates(vis, lite).all),
    };
  });

  // Agrupaciones
  const zoneName = new Map(ctx.zones.map((z) => [z.id, z.name]));
  const typeName = new Map(ctx.types.map((t) => [t.id, t.name]));
  const byZone = revenueBy(data, period.startDate, period.endDate, (c) => (c?.zone_id ? (zoneName.get(c.zone_id) ?? "Zona archivada") : "Sin zona"), countable, bt);
  const byType = revenueBy(data, period.startDate, period.endDate, (c) => (c?.establishment_type_id ? (typeName.get(c.establishment_type_id) ?? "—") : "Sin tipo"), countable, bt);
  const custIds = [...new Set(data.orders.map((o) => o.customer_id))];
  const { data: custNames } = custIds.length ? await ctx.supabase.from("customers").select("id, trade_name").in("id", custIds.slice(0, 500)) : { data: [] };
  const nameOf = new Map((custNames ?? []).map((c) => [c.id as string, c.trade_name as string]));
  const byCustomer = revenueBy(data, period.startDate, period.endDate, (_, id) => nameOf.get(id) ?? "—", countable, bt);
  const toRows = (m: Map<string, number>) =>
    [...m.entries()]
      .filter(([, v]) => v !== 0)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value }));

  // Rendimiento por tipo de negocio: actividad + ventas
  const typePerf = ctx.types.map((t) => {
    const d = filterByCustomer(data, { type: t.id });
    const x = snapshot(d, period.startDate, period.endDate, flags, countable, bt);
    return { name: t.name, coldCalls: x.prospecting.coldCalls, contact: effectiveContactRate(x.prospecting), newCustomers: x.newCustomers, revenue: x.revenue.computable.netCents };
  }).filter((r) => r.coldCalls || r.revenue || r.newCustomers);

  const rejections = ctx.results
    .filter((r) => r.is_rejection || r.code === "manager_absent")
    .map((r) => ({
      label: r.name,
      value: data.activities.filter((a) => a.result_id === r.id && Date.parse(a.occurred_at) >= period.start.getTime() && Date.parse(a.occurred_at) < period.end.getTime()).length,
    }));

  const catAgg = new Map<string, { qty: number; base: number }>();
  const validIds = new Set(periodOrders.filter((o) => !["draft", "cancelled"].includes(o.status)).map((o) => o.id));
  const catName = new Map(ctx.categories.map((c) => [c.id, c.name]));
  for (const i of items.filter((i) => validIds.has(i.order_id))) {
    const k = i.category_id ? (catName.get(i.category_id) ?? "—") : "Sin categoría";
    const a = catAgg.get(k) ?? { qty: 0, base: 0 };
    a.qty += Number(i.quantity);
    a.base += Number(i.base_cents);
    catAgg.set(k, a);
  }

  const exportQs = `desde=${period.startDate}&hasta=${period.endDate}`;

  return (
    <>
      <PageHeader
        title="Estadísticas"
        description={`${period.label} · comparado con ${prev.label}`}
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <a href={`/api/exportar/prospecciones?${exportQs}`}>
                <Download />
                Prospecciones
              </a>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <a href={`/api/exportar/visitas?${exportQs}`}>
                <Download />
                Visitas
              </a>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <a href={`/api/exportar/pedidos?${exportQs}`}>
                <Download />
                Pedidos
              </a>
            </Button>
          </>
        }
      />
      <div className="mb-3">
        <PeriodPicker value={sp.periodo === "custom" ? "custom" : period.kind} from={sp.desde} to={sp.hasta} options={["week", "month", "prev_month", "custom"]} />
      </div>
      <StatsFilters />

      <h2 className="mt-6 mb-2 text-[13px] font-medium text-ink-muted">Actividad comercial</h2>
      <KpiGrid className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Puertas frías" value={String(s.prospecting.coldCalls)} change={compare(s.prospecting.coldCalls, p.prospecting.coldCalls)} />
        <Kpi label="Tasa de contacto efectivo" value={formatRatio(effectiveContactRate(s.prospecting))} hint="Contactos efectivos / puertas frías" />
        <Kpi label="Tasa de interés" value={formatRatio(interestRate(s.prospecting))} hint="Interesados / contactos efectivos" />
        <Kpi label="Visitas realizadas" value={String(s.visits.total)} change={compare(s.visits.total, p.visits.total)} />
        <Kpi label="Seguimientos completados" value={String(s.followUpsDone)} change={compare(s.followUpsDone, p.followUpsDone)} />
        <Kpi label="Nuevos clientes" value={String(s.newCustomers)} change={compare(s.newCustomers, p.newCustomers)} />
      </KpiGrid>

      <h2 className="mt-6 mb-2 text-[13px] font-medium text-ink-muted">Conversión y cierre</h2>
      <KpiGrid className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Cierre: todas las visitas" value={formatRatio(close.all)} hint="Visitas comerciales con al menos un pedido / visitas comerciales" />
        <Kpi label="Cierre: prospectos" value={formatRatio(close.prospects)} />
        <Kpi label="Cierre: clientes actuales" value={formatRatio(close.customers)} />
        <Kpi label="Conversión de la cohorte" value={formatRatio(cohort.conversion)} hint={`Prospectos captados en el periodo que ya son clientes (${cohort.converted} de ${cohort.cohortSize})`} />
        <Kpi label="Conversión (maduros)" value={formatRatio(cohort.matureConversion)} hint={`Excluye ${cohort.immature} prospectos con menos de ${ctx.settings.cohort_maturity_days} días`} />
        <Kpi label="Clientes por 100 puertas" value={(() => { const r = rate(s.newCustomers, s.prospecting.coldCalls); return r.kind === "ok" ? formatNumber(r.value, 1) : "Datos insuficientes"; })()} />
      </KpiGrid>
      {cohort.immature > 0 && (
        <p className="mt-2 text-[12px] text-ink-muted">
          {cohort.immature} prospectos de esta cohorte aún no han tenido tiempo de madurar ({ctx.settings.cohort_maturity_days} días configurados).
        </p>
      )}

      <h2 className="mt-6 mb-2 text-[13px] font-medium text-ink-muted">Ventas</h2>
      <KpiGrid className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Facturación computable" value={formatEUR(net)} change={compare(net, p.revenue.computable.netCents)} />
        <Kpi label="Pedidos válidos" value={String(s.validOrders)} change={compare(s.validOrders, p.validOrders)} />
        <Kpi label="Ticket medio" value={(() => { const r = average(net, s.revenue.computable.orderCount); return r.kind === "ok" ? formatEUR(Math.round(r.value)) : "Datos insuficientes"; })()} />
        <Kpi label="Frecuencia de recompra" value={fmtAvg(repurchaseFrequencyDays(orderLite), "días", 0)} hint="Media de días entre pedidos del mismo cliente (todo el historial cargado)" />
        <Kpi label="Tiempo hasta 1er pedido" value={fmtAvg(timeToFirstOrderDays(data.customers, orderLite), "días", 0)} hint="Desde el primer contacto" />
        <Kpi label="Devoluciones" value={formatEUR(s.revenue.returns.baseCents)} />
      </KpiGrid>

      <h2 className="mt-6 mb-2 text-[13px] font-medium text-ink-muted">Productividad</h2>
      <KpiGrid className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Puertas por día trabajado" value={fmtAvg(average(s.prospecting.coldCalls, days.length), "")} hint={`${days.length} días laborables`} />
        <Kpi label="Puertas por hora" value={hours.recorded ? fmtAvg(average(s.prospecting.coldCalls, hours.hours), "") : "Sin registro de horas"} hint="Requiere registrar horas trabajadas en Objetivos → Calendario laboral" />
        <Kpi label="Contactos por día" value={fmtAvg(average(s.prospecting.effectiveContacts, days.length), "")} />
        <Kpi label="Visitas por día" value={fmtAvg(average(s.visits.total, days.length), "")} />
        <Kpi label="Pedidos por visita" value={fmtAvg(average(s.validOrders, s.visits.commercial), "", 2)} />
        <Kpi label="Facturación por visita" value={(() => { const r = average(net, s.visits.commercial); return r.kind === "ok" ? formatEUR(Math.round(r.value)) : "Datos insuficientes"; })()} />
      </KpiGrid>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {!longPeriod && (
          <Card className="lg:col-span-2">
            <CardHeader title="Actividad diaria" />
            <CardBody className="pt-2">
              <BarSeriesChart
                data={dayRows}
                xKey="dia"
                series={[
                  { key: "puertas", name: "Puertas frías" },
                  { key: "contactos", name: "Contactos efectivos" },
                  { key: "visitas", name: "Visitas" },
                ]}
              />
            </CardBody>
          </Card>
        )}
        <Card>
          <CardHeader title="Actividad semanal" description="Semanas del periodo (inicio de semana)" />
          <CardBody className="pt-2">
            <BarSeriesChart data={weeks} xKey="semana" series={[{ key: "puertas", name: "Puertas frías" }, { key: "visitas", name: "Visitas" }]} height={200} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Actividad mensual" description="Últimos 12 meses" />
          <CardBody className="pt-2">
            <BarSeriesChart data={months} xKey="mes" series={[{ key: "puertas", name: "Puertas frías" }, { key: "visitas", name: "Visitas" }]} height={200} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Evolución de ventas" description="Facturación computable mensual" />
          <CardBody className="pt-2">
            <BarSeriesChart data={months} xKey="mes" series={[{ key: "ventas", name: "Facturación" }]} format="eur" height={200} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Ticket medio mensual" />
          <CardBody className="pt-2">
            <LineSeriesChart data={months} xKey="mes" series={[{ key: "ticket", name: "Ticket medio" }]} format="eur" height={200} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Nuevos clientes por mes" />
          <CardBody className="pt-2">
            <BarSeriesChart data={months} xKey="mes" series={[{ key: "nuevos", name: "Nuevos clientes" }]} height={200} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Tasas mensuales" description="Contacto efectivo y cierre de visitas (%)" />
          <CardBody className="pt-2">
            <LineSeriesChart
              data={months}
              xKey="mes"
              series={[
                { key: "contacto", name: "Contacto efectivo" },
                { key: "cierre", name: "Cierre de visitas" },
              ]}
              format="pct"
              height={200}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Facturación por zona" description="Sin datos de tiempo invertido no indica rentabilidad" />
          <CardBody className="pt-3">
            <HBars rows={toRows(byZone)} format={formatEUR} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Facturación por cliente" description="Diez principales del periodo" />
          <CardBody className="pt-3">
            <HBars rows={toRows(byCustomer).slice(0, 10)} format={formatEUR} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Facturación por tipo de establecimiento" />
          <CardBody className="pt-3">
            <HBars rows={toRows(byType)} format={formatEUR} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Motivos de rechazo" description="Resultados marcados como rechazo y ausencias" />
          <CardBody className="pt-3">
            <HBars rows={rejections.filter((r) => r.value > 0)} />
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Rendimiento por tipo de negocio" description="Actividad y ventas por separado; las diferencias no implican causalidad" />
          <CardBody className="overflow-x-auto pt-3">
            {typePerf.length === 0 ? (
              <p className="text-sm text-ink-muted">Sin datos en el periodo.</p>
            ) : (
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[12px] text-ink-muted">
                    <th className="py-2 font-medium">Tipo</th>
                    <th className="py-2 text-right font-medium">Puertas frías</th>
                    <th className="py-2 text-right font-medium">Contacto efectivo</th>
                    <th className="py-2 text-right font-medium">Nuevos clientes</th>
                    <th className="py-2 text-right font-medium">Facturación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {typePerf.map((r) => (
                    <tr key={r.name}>
                      <td className="py-2">{r.name}</td>
                      <td className="num py-2 text-right">{r.coldCalls}</td>
                      <td className="num py-2 text-right">{formatRatio(r.contact, 0)}</td>
                      <td className="num py-2 text-right">{r.newCustomers}</td>
                      <td className="num py-2 text-right">{formatEUR(r.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Resultados por categoría de producto" description="Pedidos válidos del periodo, base imponible por línea" />
          <CardBody className="pt-3">
            <HBars
              rows={[...catAgg.entries()].sort((a, b) => b[1].base - a[1].base).map(([label, v]) => ({ label, value: v.base, hint: `${formatNumber(v.qty, 0)} unidades` }))}
              format={formatEUR}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
