import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getContext } from "@/lib/data/context";
import { attachTotals } from "@/lib/data/sales";
import { formatDate, formatDateTime } from "@/lib/domain/dates";
import { formatEUR, formatPercentBp } from "@/lib/domain/money";
import { ORDER_STATUS_LABEL } from "@/lib/labels";
import type { Order, OrderItem, OrderReturn, Product } from "@/lib/types";
import type { OrderStatus } from "@/lib/domain/revenue";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { OrderForm } from "@/components/app/forms/order-form";
import { OrderControls } from "./controls";

export const metadata: Metadata = { title: "Pedido" };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ editar?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await getContext();
  const { supabase } = ctx;
  const { data: order, error } = await supabase
    .from("orders")
    .select("*, customer:customers(id, trade_name, city, status)")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`No se ha podido cargar el pedido: ${error.message}`);
  if (!order) notFound();
  const [itemsRes, retRes, histRes] = await Promise.all([
    supabase.from("order_items").select("*").eq("order_id", id).order("position"),
    supabase.from("order_returns").select("*").eq("order_id", id).order("return_date"),
    supabase.from("order_status_history").select("*").eq("order_id", id).order("changed_at"),
  ]);
  const items = (itemsRes.data ?? []) as OrderItem[];
  const returns = (retRes.data ?? []) as OrderReturn[];
  const history = (histRes.data ?? []) as { id: string; to_status: OrderStatus; changed_at: string }[];
  const [full] = await attachTotals(ctx, [order as Order]);
  const customer = (order as { customer: { id: string; trade_name: string; city: string | null; status: string } }).customer;
  const returnedBase = returns.reduce((s, r) => s + Number(r.base_cents), 0);
  const catName = new Map(ctx.categories.map((c) => [c.id, c.name]));

  const byRate = new Map<number, { base: number; vat: number }>();
  for (const i of items) {
    const r = byRate.get(i.vat_rate_bp) ?? { base: 0, vat: 0 };
    r.base += Number(i.base_cents);
    r.vat += Number(i.vat_cents);
    byRate.set(i.vat_rate_bp, r);
  }

  if (sp.editar === "1") {
    const { data: products } = await supabase.from("products").select("*").order("name");
    return (
      <>
        <Link href={`/ventas/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
          <ArrowLeft className="size-4" />
          Volver al pedido
        </Link>
        <h1 className="mb-5 text-[22px] font-semibold tracking-[-0.02em]">Editar pedido</h1>
        <OrderForm products={(products ?? []) as Product[]} order={order as Order} items={items} initialCustomer={customer} hasReturns={returns.length > 0} />
      </>
    );
  }

  return (
    <>
      <Link href="/ventas" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" />
        Ventas
      </Link>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] lg:text-[26px]">
            Pedido {full.order_number ? `nº ${full.order_number}` : "sin número"}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            <Link href={`/clientes/${customer.id}`} className="font-medium text-ink hover:underline">
              {customer.trade_name}
            </Link>
            {customer.city && ` · ${customer.city}`} · {formatDate(full.order_date)}
            {full.is_demo && " · Demo"}
          </p>
        </div>
        <OrderControls
          order={{ id: full.id, status: full.status, paid_date: full.paid_date }}
          pendingReturnBase={full.base_cents - returnedBase}
          hasReturns={returns.length > 0}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Líneas" description="Precios e IVA guardados en el momento del pedido." />
          <CardBody className="overflow-x-auto pt-3">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-ink-muted">
                  <th className="py-2 font-medium">Producto</th>
                  <th className="py-2 text-right font-medium">Cant.</th>
                  <th className="py-2 text-right font-medium">Precio</th>
                  <th className="py-2 text-right font-medium">Dto.</th>
                  <th className="py-2 text-right font-medium">IVA</th>
                  <th className="py-2 text-right font-medium">Base</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((i) => (
                  <tr key={i.id}>
                    <td className="py-2.5">
                      {i.description}
                      {i.category_id && <span className="block text-[12px] text-ink-muted">{catName.get(i.category_id)}</span>}
                    </td>
                    <td className="num py-2.5 text-right">{Number(i.quantity).toLocaleString("es-ES")}</td>
                    <td className="num py-2.5 text-right">{formatEUR(Number(i.unit_price_cents))}</td>
                    <td className="num py-2.5 text-right">{i.discount_bp ? formatPercentBp(i.discount_bp) : "—"}</td>
                    <td className="num py-2.5 text-right">{formatPercentBp(i.vat_rate_bp)}</td>
                    <td className="num py-2.5 text-right font-medium">{formatEUR(Number(i.base_cents))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="mt-4 ml-auto max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Base imponible</dt>
                <dd className="num">{formatEUR(full.base_cents)}</dd>
              </div>
              {[...byRate.entries()].map(([bp, r]) => (
                <div key={bp} className="flex justify-between">
                  <dt className="text-ink-muted">IVA {formatPercentBp(bp)}</dt>
                  <dd className="num">{formatEUR(r.vat)}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-line pt-1.5 text-[15px] font-semibold">
                <dt>Total</dt>
                <dd className="num">{formatEUR(full.total_cents)}</dd>
              </div>
              {returnedBase > 0 && (
                <div className="flex justify-between text-warning">
                  <dt>Devuelto (base)</dt>
                  <dd className="num">−{formatEUR(returnedBase)}</dd>
                </div>
              )}
            </dl>
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Datos" />
            <CardBody className="pt-3">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-muted">Estado</dt>
                  <dd>{ORDER_STATUS_LABEL[full.status]}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-muted">Entrega</dt>
                  <dd className="num">{formatDate(full.delivery_date)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-muted">Cobro</dt>
                  <dd className="num">{formatDate(full.paid_date)}</dd>
                </div>
                {full.notes && (
                  <div>
                    <dt className="text-ink-muted">Observaciones</dt>
                    <dd className="whitespace-pre-line">{full.notes}</dd>
                  </div>
                )}
              </dl>
            </CardBody>
          </Card>

          {returns.length > 0 && (
            <Card>
              <CardHeader title="Devoluciones y abonos" />
              <CardBody className="pt-3">
                <ul className="space-y-2 text-sm">
                  {returns.map((r) => (
                    <li key={r.id} className="flex justify-between gap-2">
                      <span>
                        {formatDate(r.return_date)}
                        {r.reason && <span className="block text-[12px] text-ink-muted">{r.reason}</span>}
                      </span>
                      <span className="num text-right">
                        −{formatEUR(Number(r.base_cents))}
                        <span className="block text-[12px] text-ink-muted">{formatEUR(Number(r.total_cents))} con IVA</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Historial de estados" />
            <CardBody className="pt-3">
              <ol className="space-y-1.5 text-sm">
                {history.map((h) => (
                  <li key={h.id} className="flex justify-between gap-2">
                    <span>{ORDER_STATUS_LABEL[h.to_status] ?? h.to_status}</span>
                    <span className="num text-ink-muted">{formatDateTime(h.changed_at)}</span>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
