import type { Metadata } from "next";
import { getContext, getWorkCalendar, resultFlags } from "@/lib/data/context";
import { loadPeriodData } from "@/lib/data/analytics";
import { loadGoals, resolveGoal } from "@/lib/data/goals";
import { snapshot, type PeriodSnapshot } from "@/lib/domain/analytics";
import { computeCommission } from "@/lib/domain/commissions";
import { addMonthsISO, eachDayISO, formatDate, monthEndISO, monthLabel, monthStartISO, resolvePeriod, todayISO, type ISODate } from "@/lib/domain/dates";
import { GOAL_METRICS, MONETARY_METRICS, goalProgress, type GoalMetric, type GoalProgress } from "@/lib/domain/goals";
import { formatNumber, formatRatio } from "@/lib/domain/metrics";
import { formatEUR } from "@/lib/domain/money";
import { GOAL_METRIC_LABEL } from "@/lib/labels";
import type { WorkdayRow } from "@/lib/types";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/app/hbars";
import { GoalEditor, WorkCalendarEditor } from "./editors";

export const metadata: Metadata = { title: "Objetivos" };

const STATUS: Record<GoalProgress["status"], { label: string; tone: "positive" | "progress" | "warning" | "neutral" }> = {
  achieved: { label: "Alcanzado", tone: "positive" },
  on_track: { label: "Al ritmo", tone: "progress" },
  behind: { label: "Por debajo del ritmo", tone: "warning" },
  not_started: { label: "No iniciado", tone: "neutral" },
  closed: { label: "Cerrado", tone: "neutral" },
  no_target: { label: "Sin objetivo", tone: "neutral" },
};

function metricValue(s: PeriodSnapshot, metric: GoalMetric, commissionCents: number): number {
  switch (metric) {
    case "cold_calls":
      return s.prospecting.coldCalls;
    case "effective_contacts":
      return s.prospecting.effectiveContacts;
    case "visits":
      return s.visits.total;
    case "follow_ups_done":
      return s.followUpsDone;
    case "new_customers":
      return s.newCustomers;
    case "orders":
      return s.validOrders;
    case "revenue":
      return s.revenue.computable.netCents;
    case "commission":
      return commissionCents;
  }
}

export default async function GoalsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const today = todayISO();
  const calMonth = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? `${sp.mes}-01` : monthStartISO(today);
  const periods = { day: resolvePeriod("today", today), week: resolvePeriod("week", today), month: resolvePeriod("month", today) } as const;
  const from = [periods.week.startDate, periods.month.startDate].sort()[0];
  const to = [periods.week.endDate, periods.month.endDate].sort().at(-1)!;

  const [data, goals, cal, wdRes] = await Promise.all([
    loadPeriodData(ctx, from, to),
    loadGoals(ctx),
    getWorkCalendar(ctx, from, to),
    ctx.supabase.from("workdays").select("*").gte("date", calMonth).lte("date", monthEndISO(calMonth)),
  ]);
  const flags = resultFlags(ctx);

  const sections = (["day", "week", "month"] as const).map((type) => {
    const p = periods[type];
    const s = snapshot(data, p.startDate, p.endDate, flags, ctx.settings.countable_order_statuses, ctx.commission.base_type);
    const commission = computeCommission(s.revenue.computable.netCents, ctx.tiers, ctx.commission.method).amountCents;
    const rows = GOAL_METRICS.map((metric) => {
      const g = resolveGoal(goals, type, p.startDate, metric);
      const current = metricValue(s, metric, commission);
      return { metric, goal: g, progress: g ? goalProgress(g.target_value, current, p.startDate, p.endDate, today, cal) : null, current };
    });
    return { type, period: p, rows };
  });

  const fmt = (metric: GoalMetric, v: number) => (MONETARY_METRICS.includes(metric) ? formatEUR(Math.round(v)) : formatNumber(v, v % 1 ? 1 : 0));
  const titles = { day: "Hoy", week: "Esta semana", month: monthLabel(periods.month.startDate) };

  const workdays = (wdRes.data ?? []) as WorkdayRow[];
  const days: { date: ISODate; kind: string; hours: number | null; isDefaultWork: boolean }[] = eachDayISO(calMonth, monthEndISO(calMonth)).map((d) => {
    const o = workdays.find((w) => w.date === d);
    const wd = new Date(`${d}T12:00:00Z`).getUTCDay() || 7;
    return { date: d, kind: o?.kind ?? "default", hours: o?.hours_worked == null ? null : Number(o.hours_worked), isDefaultWork: ctx.settings.working_weekdays.includes(wd) };
  });

  return (
    <>
      <PageHeader title="Objetivos" description="Define metas diarias, semanales y mensuales y sigue el ritmo necesario para cumplirlas." />

      <div className="grid gap-5 xl:grid-cols-3">
        {sections.map(({ type, period, rows }) => {
          const withGoal = rows.filter((r) => r.progress);
          return (
            <Card key={type}>
              <CardHeader title={titles[type]} description={`${formatDate(period.startDate)} – ${formatDate(period.endDate)}`} />
              <CardBody className="space-y-4 pt-3">
                {withGoal.length === 0 && <p className="text-sm text-ink-muted">Sin objetivos definidos para este periodo.</p>}
                {withGoal.map(({ metric, progress: g }) => (
                  <div key={metric}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{GOAL_METRIC_LABEL[metric]}</span>
                      <Badge tone={STATUS[g!.status].tone}>{STATUS[g!.status].label}</Badge>
                    </div>
                    <ProgressBar value={g!.current} max={g!.target} />
                    <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[12px] text-ink-muted">
                      <div>
                        Actual <span className="num font-medium text-ink">{fmt(metric, g!.current)}</span> de {fmt(metric, g!.target)}
                      </div>
                      <div className="text-right">{formatRatio(g!.completion, 0)}</div>
                      <div>
                        Diferencia <span className="num">{g!.difference >= 0 ? "+" : "−"}{fmt(metric, Math.abs(g!.difference))}</span>
                      </div>
                      <div className="text-right">
                        {type !== "day" && g!.requiredPerDay != null && (
                          <>
                            Necesitas <span className="num font-medium text-ink">{fmt(metric, Math.ceil(g!.requiredPerDay))}</span>/día · {g!.workdaysRemaining} días
                          </>
                        )}
                      </div>
                      {type !== "day" && (
                        <div className="col-span-2">
                          Estimación al cierre: {g!.projected != null ? <span className="num">{fmt(metric, g!.projected)}</span> : "Datos insuficientes"}
                        </div>
                      )}
                    </dl>
                  </div>
                ))}
              </CardBody>
            </Card>
          );
        })}
      </div>

      <Card className="mt-6">
        <CardHeader title="Definir objetivos" description="Un objetivo por defecto se aplica a todos los periodos de ese tipo; puedes fijar uno distinto para el periodo actual." />
        <CardBody>
          <GoalEditor
            goals={goals}
            periodStarts={{ day: periods.day.startDate, week: periods.week.startDate, month: periods.month.startDate }}
            metrics={GOAL_METRICS.map((m) => ({ key: m, label: GOAL_METRIC_LABEL[m], monetary: MONETARY_METRICS.includes(m) }))}
          />
        </CardBody>
      </Card>

      <Card className="mt-6" id="calendario-laboral">
        <CardHeader
          title="Calendario laboral"
          description="Marca vacaciones, festivos y días extra. Las horas trabajadas permiten calcular puertas por hora."
        />
        <CardBody>
          <WorkCalendarEditor
            month={calMonth.slice(0, 7)}
            prevMonth={addMonthsISO(calMonth, -1).slice(0, 7)}
            nextMonth={addMonthsISO(calMonth, 1).slice(0, 7)}
            label={monthLabel(calMonth)}
            days={days}
            today={today}
            defaultHours={ctx.settings.default_work_hours}
          />
        </CardBody>
      </Card>
    </>
  );
}
