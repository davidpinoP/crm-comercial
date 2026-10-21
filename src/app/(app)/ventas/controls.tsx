"use client";
import { useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useSearchParamUpdater } from "@/components/app/filters";
import { useAction } from "@/components/app/use-action";
import { settleCommission, snapshotCommission } from "@/lib/actions/settings";
import { ORDER_STATUSES } from "@/lib/domain/revenue";
import { ORDER_STATUS_LABEL } from "@/lib/labels";

export function MonthPicker({ value }: { value: string }) {
  const { set } = useSearchParamUpdater();
  return <Input type="month" aria-label="Mes" className="h-9 w-auto" value={value} onChange={(e) => e.target.value && set({ mes: e.target.value })} />;
}

export function OrderStatusFilter({ value }: { value: string }) {
  const { set } = useSearchParamUpdater();
  return (
    <NativeSelect aria-label="Filtrar por estado" className="h-8 w-auto text-[13px]" value={value} onChange={(e) => set({ estado: e.target.value })}>
      <option value="">Todos los estados</option>
      {ORDER_STATUSES.map((s) => (
        <option key={s} value={s}>
          {ORDER_STATUS_LABEL[s]}
        </option>
      ))}
    </NativeSelect>
  );
}

export function SnapshotButton({ month }: { month: string }) {
  const { run, pending } = useAction();
  return (
    <Button size="sm" loading={pending} onClick={() => run(snapshotCommission(month))}>
      <Save />
      Guardar cálculo del mes
    </Button>
  );
}

export function SettleButton({ id, amountCents }: { id: string; amountCents: number }) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState((amountCents / 100).toFixed(2).replace(".", ","));
  const [note, setNote] = useState("");
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Registrar liquidación
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {open && (
          <DialogContent title="Registrar liquidación" description="Indica el importe que te ha pagado la empresa por este periodo.">
            <form
              className="flex flex-col gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                const res = await run(settleCommission(id, amount, note || null));
                if (res.ok) setOpen(false);
              }}
            >
              <Field label="Importe liquidado (€)" htmlFor="st-amount">
                <Input id="st-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field label="Nota" htmlFor="st-note" optional>
                <Input id="st-note" value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <Button type="submit" variant="primary" loading={pending}>
                Registrar
              </Button>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
