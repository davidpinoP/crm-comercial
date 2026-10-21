import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { getContext } from "@/lib/data/context";
import { reactivationCandidates } from "@/lib/data/customers";
import { addDaysISO, formatDate, madridDateKey, relativeDayLabel, todayISO } from "@/lib/domain/dates";
import { formatRatio, rate } from "@/lib/domain/metrics";
import { FOLLOW_UP_TYPE_LABEL } from "@/lib/labels";
import type { FollowUp } from "@/lib/types";
import { PageHeader } from "@/components/app/page-header";
import { SegmentedLinks } from "@/components/app/filters";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { FollowUpRowActions } from "./row-actions";
import { NewFollowUpButton, ReactivateButton } from "./buttons";

export const metadata: Metadata = { title: "Seguimientos" };

const FILTERS = ["vencidos", "hoy", "semana", "sin-fecha", "completados"] as const;

export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const filter = (FILTERS as readonly string[]).includes(sp.filtro ?? "") ? sp.filtro! : "hoy";
  const ctx = await getContext();
  const today = todayISO();
  const since30 = addDaysISO(today, -30);

  let q = ctx.supabase.from("follow_ups").select("*, customer:customers(id, trade_name, city, phone)");
  if (filter === "vencidos") q = q.eq("status", "pending").lt("due_date", today).order("due_date");
  else if (filter === "hoy") q = q.eq("status", "pending").eq("due_date", today);
  else if (filter === "semana") q = q.eq("status", "pending").gt("due_date", today).lte("due_date", addDaysISO(today, 7)).order("due_date");
  else if (filter === "sin-fecha") q = q.eq("status", "pending").is("due_date", null).order("created_at");
  else q = q.eq("status", "done").order("completed_at", { ascending: false }).limit(100);

  const [list, pendingAll, done30, candidates] = await Promise.all([
    q,
    ctx.supabase.from("follow_ups").select("id, due_date").eq("status", "pending"),
    ctx.supabase.from("follow_ups").select("id, customer_id, completed_at").eq("status", "done").gte("completed_at", `${since30}T00:00:00Z`),
    reactivationCandidates(ctx),
  ]);
  if (list.error || pendingAll.error || done30.error) throw new Error("No se han podido cargar los seguimientos.");
  const rows = list.data as (FollowUp & { customer: { id: string; trade_name: string; city: string | null; phone: string | null } | null })[];
  const pending = pendingAll.data as { id: string; due_date: string | null }[];
  const overdue = pending.filter((p) => p.due_date && p.due_date < today).length;
  const dueInWindow = pending.filter((p) => p.due_date && p.due_date >= since30 && p.due_date < today).length;
  const completedRate = rate(done30.data.length, done30.data.length + dueInWindow);

  // Conversión posterior: clientes con seguimiento completado (30 días) que después hicieron un pedido válido
  const doneRows = done30.data as { customer_id: string; completed_at: string }[];
  const firstDone = new Map<string, string>();
  for (const d of doneRows) {
    const day = madridDateKey(d.completed_at);
    if (!firstDone.has(d.customer_id) || day < firstDone.get(d.customer_id)!) firstDone.set(d.customer_id, day);
  }
  let converted = 0;
  if (firstDone.size) {
    const { data: ords } = await ctx.supabase
      .from("orders")
      .select("customer_id, order_date")
      .in("customer_id", [...firstDone.keys()])
      .is("deleted_at", null)
      .not("status", "in", "(draft,cancelled)")
      .gte("order_date", since30);
    const conv = new Set((ords ?? []).filter((o) => o.order_date >= firstDone.get(o.customer_id as string)!).map((o) => o.customer_id));
    converted = conv.size;
  }
  const conversion = rate(converted, firstDone.size);

  const kpis: [string, string, string][] = [
    ["Pendientes", String(pending.length), "Todos los seguimientos sin completar"],
    ["Vencidos", String(overdue), "Fecha prevista anterior a hoy"],
    ["Completados (30 días)", formatRatio(completedRate, 0), "Completados / (completados + vencidos en el periodo)"],
    ["Conversión posterior", formatRatio(conversion, 0), "Clientes con seguimiento completado que hicieron un pedido después (30 días)"],
  ];

  return (
    <>
      <PageHeader title="Seguimientos" description="Tu bandeja de trabajo: qué toca hoy y qué se ha quedado atrás." actions={<NewFollowUpButton />} />
      <dl className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map(([k, v, hint]) => (
          <Card key={k} className="p-4" title={hint}>
            <dt className="text-[13px] text-ink-muted">{k}</dt>
            <dd className={`num mt-1 text-[22px] font-semibold ${k === "Vencidos" && overdue > 0 ? "text-negative" : ""}`}>{v}</dd>
          </Card>
        ))}
      </dl>

      <SegmentedLinks
        param="filtro"
        value={filter}
        className="mb-4"
        options={[
          { value: "vencidos", label: `Vencidos${overdue ? ` (${overdue})` : ""}` },
          { value: "hoy", label: "Para hoy" },
          { value: "semana", label: "Próximos 7 días" },
          { value: "sin-fecha", label: "Sin fecha" },
          { value: "completados", label: "Completados" },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {rows.length === 0 ? (
            <Card>
              <EmptyState icon={<ClipboardCheck />} title={filter === "vencidos" ? "No tienes seguimientos vencidos" : "No hay seguimientos en esta vista"} />
            </Card>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-paper">
              {rows.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {f.customer ? (
                        <Link href={`/clientes/${f.customer.id}`} className="hover:underline">
                          {f.customer.trade_name}
                        </Link>
                      ) : (
                        "—"
                      )}
                      <span className="font-normal text-ink-muted"> · {FOLLOW_UP_TYPE_LABEL[f.follow_up_type]}</span>
                    </p>
                    <p className="truncate text-[13px] text-ink-muted">
                      {f.status === "done"
                        ? `Completado el ${formatDate(f.completed_at)}${f.result ? ` · ${f.result}` : ""}`
                        : [f.due_date ? `${formatDate(f.due_date)} (${relativeDayLabel(f.due_date, today).toLowerCase()})` : "Sin fecha", f.reason, f.customer?.city].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {f.customer?.phone && f.status === "pending" && (
                    <a href={`tel:${f.customer.phone}`} className="hidden text-[13px] text-ink-muted hover:text-ink sm:block">
                      {f.customer.phone}
                    </a>
                  )}
                  {f.status === "done" ? <Badge tone="positive">Completado</Badge> : <FollowUpRowActions followUp={f} />}
                </li>
              ))}
            </ul>
          )}
        </div>

        <Card>
          <CardHeader title="Candidatos a reactivación" description={`Clientes sin pedidos en más de ${ctx.settings.inactivity_days} días`} />
          <CardBody className="pt-3">
            {candidates.length === 0 ? (
              <p className="text-sm text-ink-muted">Ningún cliente supera el umbral.</p>
            ) : (
              <ul className="space-y-2.5 text-sm">
                {candidates.slice(0, 15).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/clientes/${c.id}`} className="block truncate font-medium hover:underline">
                        {c.trade_name}
                      </Link>
                      <p className="text-[12px] text-ink-muted">
                        {c.last_order_date ? `Último pedido ${formatDate(c.last_order_date)}` : "Sin pedidos"} · {c.days} días
                      </p>
                    </div>
                    <ReactivateButton customer={{ id: c.id, trade_name: c.trade_name, city: c.city }} />
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[12px] text-ink-faint">El estado comercial no cambia automáticamente: decide tú si pasa a «Cliente inactivo».</p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
