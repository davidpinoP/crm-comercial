import type { Metadata } from "next";
import Link from "next/link";
import { Download, Plus, ShoppingBag } from "lucide-react";
import { getContext, getWorkCalendar } from "@/lib/data/context";
import { loadOrdersForRange, monthCommission } from "@/lib/data/sales";
import { addMonthsISO, formatDate, monthEndISO, monthLabel, monthStartISO, todayISO } from "@/lib/domain/dates";
import { formatEUR, formatPercentBp } from "@/lib/domain/money";
import { projectCommission } from "@/lib/domain/commissions";
import { workdaysIn } from "@/lib/domain/goals";
import { compare } from "@/lib/domain/metrics";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from "@/lib/labels";
import { ORDER_STATUSES } from "@/lib/domain/revenue";
import type { CommissionCalculation } from "@/lib/types";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { BarSeriesChart } from "@/components/app/charts";
import { ProgressBar } from "@/components/app/hbars";
import { ChangeLabel } from "@/components/app/kpi";
import { MonthPicker, OrderStatusFilter, SnapshotButton, SettleButton } from "./controls";

import { plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Pedidos y ventas" };

export default async function SalesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const today = todayISO();
  const month = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? `${sp.mes}-01` : monthStartISO(today);
  const monthEnd = monthEndISO(month);
  const historyStart = addMonthsISO(month, -5);

  const [orders, cal, snaps, customers] = await Promise.all([
    loadOrdersForRange(ctx, historyStart, monthEnd),
    getWorkCalendar(ctx, month, monthEnd),
    ctx.supabase.from("commission_calculations").select("*").order("calculated_at", { ascending: false }).limit(24),
    ctx.supabase.from("customers").select("id, trade_name"),
  ]);
  const custName = new Map((customers.data ?? []).map((c) => [c.id as string, c.trade_name as string]));

  const months = Array.from({ length: 6 }, (_, i) => addMonthsISO(historyStart, i));
  const perMonth = months.map((m) => monthCommission(ctx, orders, m));
  const current = perMonth.at(-1)!;
  const previous = perMonth.at(-2)!;
  const r = current.revenue;
  const cm = current.result;

  const isCurrentMonth = month === monthStartISO(today);
  const allWorkdays = workdaysIn(cal, month, monthEnd);
  const elapsed = isCurrentMonth ? allWorkdays.filter((d) => d <= today).length : allWorkdays.length;
  const projection = isCurrentMonth ? projectCommission(r.computable.netCents, elapsed, allWorkdays.length, ctx.tiers, ctx.commission.method) : null;
  const provisional = !ctx.commission.method_confirmed;

  const statusFilter = sp.estado && (ORDER_STATUSES as readonly string[]).includes(sp.estado) ? sp.estado : null;
  const monthOrders = orders
    .filter((o) => o.order_date >= month && o.order_date <= monthEnd)
    .filter((o) => !statusFilter || o.status === statusFilter)
    .sort((a, b) => (a.order_date < b.order_date ? 1 : -1));

  const separate: [string, string, string][] = [
    ["Pedidos registrados", `${r.registered.count}`, formatEUR(r.registered.totalCents)],
    ["Ventas confirmadas", formatEUR(r.confirmed.baseCents), `${plural(r.confirmed.count, "pedido")} · base imponible`],
    ["Ventas entregadas", formatEUR(r.delivered.baseCents), plural(r.delivered.count, "pedido")],
    ["Facturación emitida", formatEUR(r.invoiced.baseCents), `IVA ${formatEUR(r.invoiced.vatCents)} · total ${formatEUR(r.invoiced.totalCents)}`],
    ["Importes cobrados", formatEUR(r.collected.totalCents), `${plural(r.collected.count, "cobro")} (IVA incl.)`],
    ["Devoluciones", formatEUR(r.returns.baseCents), `${plural(r.returns.count, "abono")} · base imponible`],
  ];
  const snapshots = (snaps.data ?? []) as CommissionCalculation[];

  return (
    <>
      <PageHeader
        title="Pedidos y ventas"
        description={monthLabel(month)}
        actions={
          <>
            <MonthPicker value={month.slice(0, 7)} />
            <Button asChild variant="dark" size="sm">
              <Link href="/ventas/nuevo">
                <Plus />
                Nuevo pedido
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Comisión del mes"
            description={
              <>
                {ctx.commission.method === "flat" ? "Porcentaje del tramo sobre toda la base" : "Porcentaje marginal por tramos"} ·{" "}
                {ctx.commission.base_type === "net" ? "base imponible" : "importe con IVA"}
              </>
            }
            action={provisional ? <Badge tone="warning">Estimación provisional</Badge> : <Badge tone="positive">Método confirmado</Badge>}
          />
          <CardBody>
            <div className="grid gap-5 sm:grid-cols-[1.3fr_1fr]">
              <div>
                <p className="text-[13px] text-ink-muted">Ventas computables</p>
                <p className="num text-[34px] leading-tight font-semibold tracking-[-0.03em]">{formatEUR(r.computable.netCents)}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
                  <ChangeLabel change={compare(r.computable.netCents, previous.revenue.computable.netCents)} deltaFormat={formatEUR} />
                  <span>frente a {monthLabel(previous.monthStart).toLowerCase()}</span>
                </p>
                {cm.next ? (
                  <div className="mt-4">
                    <div className="mb-1.5 flex justify-between text-[13px]">
                      <span className="text-ink-muted">Siguiente tramo ({formatPercentBp(cm.next.rateBp)})</span>
                      <span className="num">
                        faltan <strong>{formatEUR(cm.next.remainingCents)}</strong>
                      </span>
                    </div>
                    <ProgressBar value={Math.max(0, r.computable.netCents)} max={cm.next.thresholdCents} />
                  </div>
                ) : (
                  <p className="mt-4 text-[13px] text-positive">Estás en el tramo más alto.</p>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-1">
                <div>
                  <dt className="text-[12px] text-ink-muted">Tramo actual</dt>
                  <dd className="font-medium">{cm.tierLabel}</dd>
                </div>
                <div>
                  <dt className="text-[12px] text-ink-muted">Porcentaje aplicable</dt>
                  <dd className="num font-medium">{formatPercentBp(cm.rateBp)}</dd>
                </div>
                <div>
                  <dt className="text-[12px] text-ink-muted">Comisión estimada</dt>
                  <dd className="num text-[20px] font-semibold text-accent">{formatEUR(cm.amountCents)}</dd>
                </div>
                <div>
                  <dt className="text-[12px] text-ink-muted">Si mantienes el ritmo</dt>
                  <dd className="num font-medium">
                    {projection ? `${formatEUR(projection.result.amountCents)} (ventas ${formatEUR(projection.projectedBaseCents)})` : isCurrentMonth ? "Datos insuficientes" : "Mes cerrado"}
                  </dd>
                </div>
              </dl>
            </div>
            {r.computable.returnsCents > 0 && (
              <p className="mt-4 text-[13px] text-ink-muted">
                Base: {formatEUR(r.computable.salesCents)} en ventas − {formatEUR(r.computable.returnsCents)} en devoluciones del mes.
              </p>
            )}
            {provisional && (
              <p className="mt-3 text-[12px] text-ink-faint">
                Confirma en Configuración → Comisiones si tu empresa aplica el porcentaje sobre todo o por tramos. Ninguna comisión figura como liquidada sin registrarlo.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Últimos 6 meses" description="Ventas computables y comisión estimada" />
          <CardBody className="pt-2">
            <BarSeriesChart
              data={perMonth.map((p) => ({ mes: monthLabel(p.monthStart).slice(0, 3), ventas: p.revenue.computable.netCents }))}
              xKey="mes"
              series={[{ key: "ventas", name: "Ventas computables" }]}
              format="eur"
              height={170}
            />
            <table className="mt-3 w-full text-[13px]">
              <tbody className="divide-y divide-line">
                {perMonth
                  .slice()
                  .reverse()
                  .map((p) => (
                    <tr key={p.monthStart}>
                      <td className="py-1.5 text-ink-muted">{monthLabel(p.monthStart)}</td>
                      <td className="num py-1.5 text-right">{formatEUR(p.revenue.computable.netCents)}</td>
                      <td className="num py-1.5 text-right font-medium">{formatEUR(p.result.amountCents)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      </div>

      <dl className="my-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {separate.map(([k, v, hint]) => (
          <Card key={k} className="p-4">
            <dt className="text-[12px] text-ink-muted">{k}</dt>
            <dd className="num mt-1 text-[17px] font-semibold">{v}</dd>
            <dd className="mt-0.5 text-[12px] text-ink-faint">{hint}</dd>
          </Card>
        ))}
      </dl>

      <Card>
        <CardHeader
          title="Pedidos del mes"
          description={plural(monthOrders.length, "pedido")}
          action={
            <div className="flex items-center gap-2">
              <OrderStatusFilter value={statusFilter ?? ""} />
              <Button asChild variant="ghost" size="sm">
                <a href={`/api/exportar/pedidos?desde=${month}&hasta=${monthEnd}`}>
                  <Download />
                  CSV
                </a>
              </Button>
            </div>
          }
        />
        <CardBody className="pt-3">
          {monthOrders.length === 0 ? (
            <EmptyState icon={<ShoppingBag />} title="No hay pedidos en este mes" description="Registra un pedido desde aquí o desde la ficha del cliente." />
          ) : (
            <ul className="divide-y divide-line">
              {monthOrders.map((o) => (
                <li key={o.id}>
                  <Link href={`/ventas/${o.id}`} className="flex items-center gap-3 py-2.5 text-sm hover:bg-canvas/60">
                    <span className="num w-20 shrink-0 text-ink-muted">{formatDate(o.order_date)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{custName.get(o.customer_id) ?? "—"}</span>
                      <span className="block truncate text-[12px] text-ink-muted">{o.order_number ? `Nº ${o.order_number}` : "Sin número"}</span>
                    </span>
                    <Badge tone={ORDER_STATUS_TONE[o.status]} className="hidden sm:inline-flex">
                      {ORDER_STATUS_LABEL[o.status]}
                    </Badge>
                    <span className="num w-24 text-right">
                      <span className="block font-medium">{formatEUR(o.base_cents)}</span>
                      <span className="block text-[12px] text-ink-muted">{formatEUR(o.total_cents)} IVA incl.</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card className="mt-5">
        <CardHeader
          title="Historial de cálculos de comisión"
          description="Instantáneas guardadas: se conservan aunque cambies la configuración."
          action={<SnapshotButton month={month} />}
        />
        <CardBody className="overflow-x-auto pt-3">
          {snapshots.length === 0 ? (
            <p className="text-sm text-ink-muted">Aún no has guardado ningún cálculo.</p>
          ) : (
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-ink-muted">
                  <th className="py-2 font-medium">Periodo</th>
                  <th className="py-2 text-right font-medium">Ventas</th>
                  <th className="py-2 text-right font-medium">Devoluciones</th>
                  <th className="py-2 text-right font-medium">Base</th>
                  <th className="py-2 font-medium">Método · tramo</th>
                  <th className="py-2 text-right font-medium">Comisión</th>
                  <th className="py-2 font-medium">Calculado</th>
                  <th className="py-2 font-medium">Liquidación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {snapshots.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2">{monthLabel(s.period_month)}</td>
                    <td className="num py-2 text-right">{formatEUR(Number(s.gross_sales_cents))}</td>
                    <td className="num py-2 text-right">{formatEUR(Number(s.returns_cents))}</td>
                    <td className="num py-2 text-right">{formatEUR(Number(s.base_cents))}</td>
                    <td className="py-2">
                      {s.method === "flat" ? "Sobre todo" : "Marginal"} · {s.tier_label} ({formatPercentBp(s.rate_bp)}) · {plural(s.order_ids.length, "pedido")}
                      {s.is_provisional && <span className="text-warning"> · provisional</span>}
                    </td>
                    <td className="num py-2 text-right font-medium">{formatEUR(Number(s.amount_cents))}</td>
                    <td className="num py-2 text-ink-muted">{formatDate(s.calculated_at)}</td>
                    <td className="py-2">
                      {s.settled_at ? (
                        <span className="text-positive">
                          Liquidada {formatEUR(Number(s.settled_amount_cents))} el {formatDate(s.settled_at)}
                        </span>
                      ) : (
                        <SettleButton id={s.id} amountCents={Number(s.amount_cents)} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </>
  );
}
