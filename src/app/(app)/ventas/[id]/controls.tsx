"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect, Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from "@/components/ui/dropdown";
import { ConfirmDialog } from "@/components/ui/confirm";
import { useAction } from "@/components/app/use-action";
import { useLookups } from "@/components/app/lookups";
import { deleteOrder, registerReturn, setOrderStatus } from "@/lib/actions/orders";
import { ORDER_STATUS_LABEL } from "@/lib/labels";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/domain/revenue";
import { formatEUR } from "@/lib/domain/money";
import { newRequestId } from "@/lib/utils";

export function OrderControls({
  order,
  pendingReturnBase,
  hasReturns,
}: {
  order: { id: string; status: OrderStatus; paid_date: string | null };
  pendingReturnBase: number;
  hasReturns: boolean;
}) {
  const { run, pending } = useAction();
  const router = useRouter();
  const [returning, setReturning] = useState(false);
  const returned = order.status === "partially_returned" || order.status === "fully_returned";
  const canReturn = !["draft", "cancelled", "fully_returned"].includes(order.status) && pendingReturnBase > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {returned ? (
        <span className="rounded-full bg-warning-soft px-3 py-1.5 text-[13px] font-medium text-warning">{ORDER_STATUS_LABEL[order.status]}</span>
      ) : (
        <NativeSelect
          aria-label="Estado del pedido"
          className="h-10 w-auto"
          value={order.status}
          disabled={pending}
          onChange={(e) => run(setOrderStatus(order.id, e.target.value))}
        >
          {ORDER_STATUSES.filter((s) => s !== "partially_returned" && s !== "fully_returned").map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_LABEL[s]}
            </option>
          ))}
        </NativeSelect>
      )}
      {canReturn && (
        <Button onClick={() => setReturning(true)}>
          <RotateCcw />
          Registrar devolución
        </Button>
      )}
      <Dropdown>
        <DropdownTrigger asChild>
          <Button size="icon" aria-label="Más acciones">
            <MoreHorizontal />
          </Button>
        </DropdownTrigger>
        <DropdownContent>
          {!hasReturns && (
            <DropdownItem asChild>
              <Link href={`/ventas/${order.id}?editar=1`}>
                <Pencil />
                Editar líneas y datos
              </Link>
            </DropdownItem>
          )}
          <ConfirmDialog
            trigger={
              <DropdownItem danger onSelect={(e) => e.preventDefault()}>
                <Trash2 />
                Eliminar pedido
              </DropdownItem>
            }
            title="¿Eliminar este pedido?"
            description="Dejará de contar en facturación, objetivos y comisiones. Si fue una venta real que se anuló, es mejor cambiar su estado a «Cancelado» para conservar el historial."
            onConfirm={async () => {
              const res = await run(deleteOrder(order.id), { refresh: false });
              if (res.ok) router.push("/ventas");
            }}
          />
        </DropdownContent>
      </Dropdown>
      <Dialog open={returning} onOpenChange={setReturning}>
        {returning && (
          <DialogContent title="Registrar devolución" description={`Pendiente de devolver: ${formatEUR(pendingReturnBase)} (base imponible).`}>
            <ReturnForm orderId={order.id} max={pendingReturnBase} onDone={() => setReturning(false)} />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function ReturnForm({ orderId, max, onDone }: { orderId: string; max: number; onDone: () => void }) {
  const { today } = useLookups();
  const { run, pending } = useAction();
  const [requestId] = useState(newRequestId);
  const [amount, setAmount] = useState((max / 100).toFixed(2).replace(".", ","));
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState("");
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await run(registerReturn({ order_id: orderId, return_date: date, amount, reason, client_request_id: requestId }));
        if (res.ok) onDone();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Importe devuelto (base, €)" htmlFor="rt-amount" hint="El IVA se calcula en proporción.">
          <Input id="rt-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Fecha" htmlFor="rt-date">
          <Input id="rt-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Motivo" htmlFor="rt-reason" optional>
        <Input id="rt-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <p className="text-[13px] text-ink-muted">El pedido original no se borra. La devolución se descuenta de la base computable del mes en que se registra.</p>
      <Button type="submit" variant="primary" size="lg" loading={pending}>
        Registrar devolución
      </Button>
    </form>
  );
}
