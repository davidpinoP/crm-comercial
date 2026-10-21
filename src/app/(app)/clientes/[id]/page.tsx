import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, MapPin, Phone } from "lucide-react";
import { getContext } from "@/lib/data/context";
import { loadActivities } from "@/lib/data/activities";
import { attachTotals } from "@/lib/data/sales";
import { formatDate, formatDateTime, madridDateKey, relativeDayLabel, todayISO } from "@/lib/domain/dates";
import { formatEUR } from "@/lib/domain/money";
import { isValidOrder } from "@/lib/domain/metrics";
import { netOrderBase } from "@/lib/domain/revenue";
import { CUSTOMER_STATUS_LABEL, EVENT_STATUS_LABEL, EVENT_TYPE_LABEL, FOLLOW_UP_TYPE_LABEL, ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from "@/lib/labels";
import type { CalendarEvent, Customer, CustomerStatus, FollowUp, Order, OrderItem, Visit } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CustomerStatusSelect } from "@/components/app/customer-status";
import { ActivityList } from "@/components/app/activity-list";
import { CustomerActions } from "./actions";
import { FollowUpRowActions } from "@/app/(app)/seguimientos/row-actions";

export const metadata: Metadata = { title: "Ficha de cliente" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await getContext();
  const { supabase } = ctx;

  const { data: customer, error } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`No se ha podido cargar el cliente: ${error.message}`);
  if (!customer) notFound();
  const c = customer as Customer;

  const [activities, visitsRes, ordersRes, fuRes, eventsRes, histRes] = await Promise.all([
    loadActivities(ctx, "2000-01-01", "2100-01-01", { customerId: id, limit: 300 }),
    supabase.from("visits").select("*").eq("customer_id", id).is("deleted_at", null).order("occurred_at", { ascending: false }),
    supabase.from("orders").select("*").eq("customer_id", id).is("deleted_at", null).order("order_date", { ascending: false }),
    supabase.from("follow_ups").select("*").eq("customer_id", id).order("due_date", { ascending: true, nullsFirst: false }),
    supabase.from("calendar_events").select("*").eq("customer_id", id).is("deleted_at", null).gte("starts_at", new Date(Date.now() - 86400000).toISOString()).order("starts_at"),
    supabase.from("customer_status_history").select("*").eq("customer_id", id).order("changed_at", { ascending: false }),
  ]);
  for (const r of [visitsRes, ordersRes, fuRes, eventsRes, histRes]) if (r.error) throw new Error(`No se ha podido cargar la ficha: ${r.error.message}`);

  const orders = await attachTotals(ctx, ordersRes.data as Order[]);
  const validOrders = orders.filter(isValidOrder);
  const revenue = validOrders.reduce((s, o) => s + netOrderBase(o), 0);
  const visits = visitsRes.data as Visit[];
  const followUps = fuRes.data as FollowUp[];
  const pending = followUps.filter((f) => f.status === "pending");
  const events = (eventsRes.data as CalendarEvent[]).filter((e) => e.status === "scheduled");
  const history = histRes.data as { id: string; from_status: string | null; to_status: CustomerStatus; changed_at: string }[];

  // Productos comprados (pedidos válidos)
  let products: { description: string; quantity: number; base: number }[] = [];
  if (validOrders.length) {
    const { data: items } = await supabase.from("order_items").select("*").in("order_id", validOrders.map((o) => o.id));
    const agg = new Map<string, { description: string; quantity: number; base: number }>();
    for (const i of (items ?? []) as OrderItem[]) {
      const k = i.product_id ?? i.description;
      const a = agg.get(k) ?? { description: i.description, quantity: 0, base: 0 };
      a.quantity += Number(i.quantity);
      a.base += Number(i.base_cents);
      agg.set(k, a);
    }
    products = [...agg.values()].sort((a, b) => b.base - a.base);
  }

  const lastContactCandidates = [visits[0]?.occurred_at, activities[0]?.occurred_at].filter(Boolean) as string[];
  const lastContact = lastContactCandidates.length ? madridDateKey(lastContactCandidates.sort().at(-1)!) : null;
  const today = todayISO();
  const typeName = ctx.types.find((t) => t.id === c.establishment_type_id)?.name;
  const zoneName = ctx.zones.find((z) => z.id === c.zone_id)?.name;
  const resultName = new Map(ctx.results.map((r) => [r.id, r.name]));
  const picked = { id: c.id, trade_name: c.trade_name, city: c.city, status: c.status };

  const stats: [string, string, string?][] = [
    ["Facturación acumulada", formatEUR(revenue), "Base imponible neta de devoluciones"],
    ["Pedidos", String(validOrders.length)],
    ["Ticket medio", validOrders.length ? formatEUR(Math.round(revenue / validOrders.length)) : "Datos insuficientes"],
    ["Último pedido", validOrders[0] ? formatDate(validOrders[0].order_date) : "—"],
    ["Último contacto", lastContact ? relativeDayLabel(lastContact, today) : "—"],
    ["Próximo seguimiento", c.next_follow_up_date ? formatDate(c.next_follow_up_date) : "—"],
  ];

  return (
    <>
      <Link href="/clientes" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" />
        Clientes
      </Link>

      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[24px] font-semibold tracking-[-0.02em] lg:text-[28px]">{c.trade_name}</h1>
            {c.is_demo && <Badge>Demo</Badge>}
            {c.archived_at && <Badge tone="warning">Archivado</Badge>}
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {[typeName, c.city, zoneName, c.legal_name].filter(Boolean).join(" · ") || "Sin datos de establecimiento"}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <CustomerStatusSelect id={c.id} status={c.status} />
            {c.phone && (
              <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1 text-[13px] hover:bg-sunken">
                <Phone className="size-3.5" />
                {c.phone}
              </a>
            )}
            {c.email && (
              <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1 text-[13px] hover:bg-sunken">
                <Mail className="size-3.5" />
                {c.email}
              </a>
            )}
            {(c.address || c.city) && (
              <a
                href={`https://www.openstreetmap.org/search?query=${encodeURIComponent([c.address, c.postal_code, c.city, c.province].filter(Boolean).join(", "))}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1 text-[13px] hover:bg-sunken"
              >
                <MapPin className="size-3.5" />
                Ver en el mapa
              </a>
            )}
          </div>
        </div>
        <CustomerActions customer={c} picked={picked} />
      </div>

      <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
        {stats.map(([label, value, hint]) => (
          <div key={label} className="bg-paper px-4 py-3" title={hint}>
            <dt className="text-[12px] text-ink-muted">{label}</dt>
            <dd className="num mt-0.5 truncate text-[15px] font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Prospecciones" description={`${activities.length} registradas`} />
            <CardBody>
              {activities.length ? <ActivityList activities={activities} grouped={false} showCustomer={false} /> : <p className="text-sm text-ink-muted">Sin prospecciones registradas.</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Visitas realizadas" description={`${visits.length} visitas`} />
            <CardBody className="pt-3">
              {visits.length === 0 ? (
                <p className="text-sm text-ink-muted">Sin visitas registradas.</p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {visits.map((v) => (
                    <li key={v.id} className="flex items-center gap-3 py-2.5">
                      <span className="num w-36 shrink-0 text-ink-muted">{formatDateTime(v.occurred_at)}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {v.visit_kind === "customer" ? "Visita a cliente" : "Visita a prospecto"}
                        {!v.is_commercial && " (administrativa)"}
                        {v.notes && <span className="text-ink-muted"> · {v.notes}</span>}
                      </span>
                      {v.outcome_result_id && <Badge>{resultName.get(v.outcome_result_id)}</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Pedidos" description={`${orders.length} pedidos`} />
            <CardBody className="pt-3">
              {orders.length === 0 ? (
                <EmptyState title="Sin pedidos" description="Crea el primer pedido con el botón «Crear pedido»." className="py-6" />
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {orders.map((o) => (
                    <li key={o.id}>
                      <Link href={`/ventas/${o.id}`} className="flex items-center gap-3 py-2.5 hover:bg-canvas/60">
                        <span className="num w-24 shrink-0 text-ink-muted">{formatDate(o.order_date)}</span>
                        <span className="min-w-0 flex-1 truncate">{o.order_number ? `Nº ${o.order_number}` : "Sin número"}</span>
                        <Badge tone={ORDER_STATUS_TONE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Badge>
                        <span className="num w-24 text-right font-medium">{formatEUR(o.total_cents)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Seguimientos pendientes" />
            <CardBody className="pt-3">
              {pending.length === 0 ? (
                <p className="text-sm text-ink-muted">Ninguno pendiente.</p>
              ) : (
                <ul className="space-y-2.5 text-sm">
                  {pending.map((f) => (
                    <li key={f.id} className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{FOLLOW_UP_TYPE_LABEL[f.follow_up_type]}</p>
                        <p className={`text-[13px] ${f.due_date && f.due_date < today ? "text-negative" : "text-ink-muted"}`}>
                          {f.due_date ? `${formatDate(f.due_date)} · ${relativeDayLabel(f.due_date, today)}` : "Sin fecha"}
                          {f.reason && ` · ${f.reason}`}
                        </p>
                      </div>
                      <FollowUpRowActions followUp={f} />
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Próximas citas" />
            <CardBody className="pt-3">
              {events.length === 0 ? (
                <p className="text-sm text-ink-muted">Sin citas programadas.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {events.map((e) => (
                    <li key={e.id}>
                      <p className="font-medium">{EVENT_TYPE_LABEL[e.event_type]}</p>
                      <p className="text-[13px] text-ink-muted">
                        {formatDateTime(e.starts_at)} · {EVENT_STATUS_LABEL[e.status]}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Productos comprados" />
            <CardBody className="pt-3">
              {products.length === 0 ? (
                <p className="text-sm text-ink-muted">Sin compras registradas.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {products.slice(0, 12).map((p) => (
                    <li key={p.description} className="flex justify-between gap-2">
                      <span className="truncate">{p.description}</span>
                      <span className="num shrink-0 text-ink-muted">
                        {p.quantity.toLocaleString("es-ES")} ud · {formatEUR(p.base)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Datos comerciales" />
            <CardBody className="pt-3">
              <dl className="space-y-2.5 text-sm">
                {(
                  [
                    ["Responsable", c.contact_name],
                    ["Dirección", [c.address, c.postal_code, c.city, c.province].filter(Boolean).join(", ")],
                    ["Primer contacto", c.first_contact_date && formatDate(c.first_contact_date)],
                    ["Cliente desde", c.customer_since_date && formatDate(c.customer_since_date)],
                    ["Próxima acción", c.next_action],
                    ["Marcas competidoras", c.competitor_brands],
                    ["Productos de interés", c.products_of_interest],
                    ["Potencial estimado", c.estimated_potential_cents != null && formatEUR(c.estimated_potential_cents)],
                    ["Frecuencia estimada", c.estimated_purchase_frequency],
                    ["Observaciones", c.notes],
                  ] as [string, string | null | false][]
                )
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-[12px] text-ink-muted">{k}</dt>
                      <dd className="whitespace-pre-line">{v}</dd>
                    </div>
                  ))}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Historial de estado" />
            <CardBody className="pt-3">
              <ol className="space-y-2 text-sm">
                {history.map((h) => (
                  <li key={h.id} className="flex justify-between gap-2">
                    <span>{CUSTOMER_STATUS_LABEL[h.to_status] ?? h.to_status}</span>
                    <span className="num shrink-0 text-ink-muted">{formatDate(h.changed_at)}</span>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>
      <p className="mt-6 text-[12px] text-ink-faint">
        Creado el {formatDate(c.created_at)} · Última modificación {formatDateTime(c.updated_at)}
      </p>
    </>
  );
}
