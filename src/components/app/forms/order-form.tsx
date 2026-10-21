"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { CustomerPicker, type PickedCustomer } from "@/components/app/customer-picker";
import { useLookups } from "@/components/app/lookups";
import { useAction } from "@/components/app/use-action";
import { saveOrder } from "@/lib/actions/orders";
import { computeLine, formatEUR, formatPercentBp, parseEurosToCents, parsePercentToBp } from "@/lib/domain/money";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/domain/revenue";
import { ORDER_STATUS_LABEL } from "@/lib/labels";
import type { Order, OrderItem, Product } from "@/lib/types";
import { newRequestId } from "@/lib/utils";

interface Line {
  key: string;
  product_id: string;
  category_id: string;
  description: string;
  quantity: string;
  unit_price: string;
  discount: string;
  vat: string;
}

const toEuros = (c: number) => (c / 100).toFixed(2).replace(".", ",");
const toPct = (bp: number) => String(bp / 100).replace(".", ",");
const emptyLine = (): Line => ({ key: newRequestId(), product_id: "", category_id: "", description: "", quantity: "1", unit_price: "", discount: "0", vat: "21" });

function lineAmounts(l: Line) {
  const price = parseEurosToCents(l.unit_price);
  const disc = parsePercentToBp(l.discount || "0");
  const vat = parsePercentToBp(l.vat || "0");
  try {
    if (price == null || disc == null || vat == null) return null;
    return { ...computeLine({ quantity: l.quantity, unitPriceCents: price, discountBp: disc, vatRateBp: vat }), vatBp: vat };
  } catch {
    return null;
  }
}

/** Editable mientras no haya devoluciones registradas */
export function OrderForm({
  products,
  order,
  items,
  initialCustomer,
  hasReturns = false,
}: {
  products: Product[];
  order?: Order;
  items?: OrderItem[];
  initialCustomer?: PickedCustomer | null;
  hasReturns?: boolean;
}) {
  const { categories, today } = useLookups();
  const router = useRouter();
  const { run, pending } = useAction();
  const [requestId] = useState(newRequestId);
  const [customer, setCustomer] = useState<PickedCustomer | null>(initialCustomer ?? null);
  const [date, setDate] = useState(order?.order_date ?? today);
  const [number, setNumber] = useState(order?.order_number ?? "");
  const [status, setStatus] = useState<OrderStatus>(order?.status ?? "confirmed");
  const [notes, setNotes] = useState(order?.notes ?? "");
  const [delivery, setDelivery] = useState(order?.delivery_date ?? "");
  const [paid, setPaid] = useState(order?.paid_date ?? "");
  const [promote, setPromote] = useState(true);
  const [lines, setLines] = useState<Line[]>(
    items?.length
      ? items.map((i) => ({
          key: i.id,
          product_id: i.product_id ?? "",
          category_id: i.category_id ?? "",
          description: i.description,
          quantity: String(Number(i.quantity)).replace(".", ","),
          unit_price: toEuros(Number(i.unit_price_cents)),
          discount: toPct(i.discount_bp),
          vat: toPct(i.vat_rate_bp),
        }))
      : [emptyLine()],
  );
  const [error, setError] = useState<string | null>(null);
  const active = products.filter((p) => p.active);
  const isProspect = customer?.status ? !customer.status.startsWith("customer_") || customer.status === "customer_inactive" : false;

  const totals = useMemo(() => {
    let base = 0;
    let vat = 0;
    const byRate = new Map<number, { base: number; vat: number }>();
    let invalid = false;
    for (const l of lines) {
      const a = lineAmounts(l);
      if (!a) {
        invalid = true;
        continue;
      }
      base += a.baseCents;
      vat += a.vatCents;
      const r = byRate.get(a.vatBp) ?? { base: 0, vat: 0 };
      r.base += a.baseCents;
      r.vat += a.vatCents;
      byRate.set(a.vatBp, r);
    }
    return { base, vat, total: base + vat, byRate: [...byRate.entries()].sort((a, b) => b[0] - a[0]), invalid };
  }, [lines]);

  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const pickProduct = (key: string, id: string) => {
    const p = products.find((x) => x.id === id);
    if (!p) return update(key, { product_id: "" });
    update(key, { product_id: p.id, category_id: p.category_id ?? "", description: p.name, unit_price: toEuros(p.price_cents), vat: toPct(p.vat_rate_bp) });
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!customer) return setError("Elige el cliente del pedido.");
    if (totals.invalid) return setError("Revisa las líneas: hay cantidades, precios o porcentajes no válidos.");
    if (lines.some((l) => !l.description.trim())) return setError("Cada línea necesita una descripción o un producto.");
    setError(null);
    const res = await run(
      saveOrder(
        {
          id: order?.id ?? null,
          client_request_id: order ? undefined : requestId,
          customer_id: customer.id,
          order_date: date,
          order_number: number,
          status,
          notes,
          delivery_date: delivery || null,
          paid_date: paid || null,
          visit_id: order?.visit_id ?? null,
          items: lines.map((l) => ({
            product_id: l.product_id || null,
            category_id: l.category_id || null,
            description: l.description,
            quantity: l.quantity,
            unit_price: l.unit_price,
            discount: l.discount || "0",
            vat: l.vat || "0",
          })),
        },
        { promoteCustomer: isProspect && promote },
      ),
      { refresh: false },
    );
    if (res.ok) router.push(`/ventas/${res.data.id}`);
  }

  if (hasReturns) {
    return <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">Este pedido tiene devoluciones registradas: sus líneas ya no se pueden modificar.</p>;
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <Card className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
        <Field label="Cliente" htmlFor="of-cust" className="sm:col-span-2" error={!customer && error ? error : undefined}>
          <CustomerPicker id="of-cust" value={customer} onChange={setCustomer} autoFocus={!customer} />
        </Field>
        <Field label="Fecha del pedido" htmlFor="of-date">
          <Input id="of-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Nº de pedido" htmlFor="of-num" optional>
          <Input id="of-num" value={number} onChange={(e) => setNumber(e.target.value)} />
        </Field>
        <Field label="Estado" htmlFor="of-status">
          <NativeSelect id="of-status" value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)}>
            {ORDER_STATUSES.filter((s) => s !== "partially_returned" && s !== "fully_returned").map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABEL[s]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Fecha de entrega" htmlFor="of-del" optional>
          <Input id="of-del" type="date" value={delivery} onChange={(e) => setDelivery(e.target.value)} />
        </Field>
        <Field label="Fecha de cobro" htmlFor="of-paid" optional>
          <Input id="of-paid" type="date" value={paid} onChange={(e) => setPaid(e.target.value)} />
        </Field>
        {isProspect && !["draft", "cancelled"].includes(status) && (
          <label className="flex items-start gap-2 self-end rounded-[var(--radius-field)] bg-sunken px-3 py-2.5 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={promote} onChange={(e) => setPromote(e.target.checked)} />
            {customer?.status === "customer_inactive" ? "Marcar como cliente activo (reactivado)" : "Marcar como cliente nuevo"}
          </label>
        )}
      </Card>

      <Card className="p-4 sm:p-5">
        <h2 className="mb-3 text-[15px] font-semibold">Productos</h2>
        <div className="space-y-3">
          {lines.map((l, idx) => {
            const a = lineAmounts(l);
            return (
              <div key={l.key} className="grid grid-cols-6 gap-2 rounded-[var(--radius-field)] border border-line p-3 lg:grid-cols-12 lg:items-end lg:border-0 lg:p-0">
                <Field label="Producto" htmlFor={`p-${l.key}`} className="col-span-6 lg:col-span-3">
                  <NativeSelect id={`p-${l.key}`} value={l.product_id} onChange={(e) => pickProduct(l.key, e.target.value)}>
                    <option value="">Línea libre</option>
                    {active.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.reference ? ` (${p.reference})` : ""}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Descripción" htmlFor={`d-${l.key}`} className="col-span-6 lg:col-span-3">
                  <Input id={`d-${l.key}`} value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} />
                </Field>
                {!l.product_id && (
                  <Field label="Categoría" htmlFor={`c-${l.key}`} className="col-span-6 lg:hidden">
                    <NativeSelect id={`c-${l.key}`} value={l.category_id} onChange={(e) => update(l.key, { category_id: e.target.value })}>
                      <option value="">Sin categoría</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                )}
                <Field label="Cant." htmlFor={`q-${l.key}`} className="col-span-2 lg:col-span-1">
                  <Input id={`q-${l.key}`} inputMode="decimal" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} />
                </Field>
                <Field label="Precio (€)" htmlFor={`u-${l.key}`} className="col-span-4 lg:col-span-1">
                  <Input id={`u-${l.key}`} inputMode="decimal" value={l.unit_price} placeholder="0,00" onChange={(e) => update(l.key, { unit_price: e.target.value })} />
                </Field>
                <Field label="Dto. %" htmlFor={`x-${l.key}`} className="col-span-2 lg:col-span-1">
                  <Input id={`x-${l.key}`} inputMode="decimal" value={l.discount} onChange={(e) => update(l.key, { discount: e.target.value })} />
                </Field>
                <Field label="IVA %" htmlFor={`v-${l.key}`} className="col-span-2 lg:col-span-1">
                  <Input id={`v-${l.key}`} inputMode="decimal" value={l.vat} onChange={(e) => update(l.key, { vat: e.target.value })} />
                </Field>
                <div className="col-span-2 flex items-center justify-end gap-1 lg:col-span-2 lg:h-10">
                  <span className="num text-sm font-medium" title="Base imponible de la línea">
                    {a ? formatEUR(a.baseCents) : <span className="text-negative">—</span>}
                  </span>
                  {lines.length > 1 && (
                    <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="rounded-md p-1.5 text-ink-muted hover:bg-sunken hover:text-negative" aria-label={`Quitar línea ${idx + 1}`}>
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <Button type="button" variant="ghost" className="mt-3" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
          <Plus />
          Añadir línea
        </Button>

        <dl className="mt-4 ml-auto max-w-xs space-y-1.5 border-t border-line pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-muted">Base imponible</dt>
            <dd className="num">{formatEUR(totals.base)}</dd>
          </div>
          {totals.byRate.map(([bp, r]) => (
            <div key={bp} className="flex justify-between">
              <dt className="text-ink-muted">
                IVA {formatPercentBp(bp)} sobre {formatEUR(r.base)}
              </dt>
              <dd className="num">{formatEUR(r.vat)}</dd>
            </div>
          ))}
          <div className="flex justify-between border-t border-line pt-1.5 text-[15px] font-semibold">
            <dt>Total</dt>
            <dd className="num">{formatEUR(totals.total)}</dd>
          </div>
        </dl>
      </Card>

      <Field label="Observaciones" htmlFor="of-notes" optional>
        <Textarea id="of-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      {error && (
        <p className="rounded-lg bg-negative-soft px-3 py-2 text-sm text-negative" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full sm:w-auto">
          {order ? "Guardar pedido" : "Registrar pedido"}
        </Button>
      </div>
    </form>
  );
}
