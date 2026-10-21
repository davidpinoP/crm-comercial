"use client";
import { useState } from "react";
import { Check, MoreHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from "@/components/ui/dropdown";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAction } from "@/components/app/use-action";
import { useLookups } from "@/components/app/lookups";
import { cancelFollowUp, completeFollowUp, rescheduleFollowUp } from "@/lib/actions/calendar";
import { FOLLOW_UP_TYPE_LABEL } from "@/lib/labels";
import { FOLLOW_UP_TYPES, type FollowUp, type FollowUpType } from "@/lib/types";
import { addDaysISO } from "@/lib/domain/dates";
import { newRequestId } from "@/lib/utils";

export function FollowUpRowActions({ followUp, compact = true }: { followUp: FollowUp; compact?: boolean }) {
  const { run } = useAction();
  const { today } = useLookups();
  const [completing, setCompleting] = useState(false);
  if (followUp.status !== "pending") return null;
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button size={compact ? "icon-sm" : "sm"} variant="secondary" onClick={() => setCompleting(true)} aria-label="Completar seguimiento" title="Completar">
        <Check />
        {!compact && "Completar"}
      </Button>
      <Dropdown>
        <DropdownTrigger asChild>
          <button type="button" className="rounded-md p-1.5 text-ink-muted hover:bg-sunken hover:text-ink" aria-label="Más opciones">
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownTrigger>
        <DropdownContent>
          <DropdownItem onSelect={() => run(rescheduleFollowUp(followUp.id, today))}>Para hoy</DropdownItem>
          <DropdownItem onSelect={() => run(rescheduleFollowUp(followUp.id, addDaysISO(today, 1)))}>Para mañana</DropdownItem>
          <DropdownItem onSelect={() => run(rescheduleFollowUp(followUp.id, addDaysISO(today, 7)))}>Dentro de una semana</DropdownItem>
          <DropdownItem danger onSelect={() => run(cancelFollowUp(followUp.id))}>
            <X />
            Cancelar seguimiento
          </DropdownItem>
        </DropdownContent>
      </Dropdown>
      <Dialog open={completing} onOpenChange={setCompleting}>
        {completing && (
          <DialogContent title="Completar seguimiento" description={followUp.reason ?? FOLLOW_UP_TYPE_LABEL[followUp.follow_up_type]}>
            <CompleteFollowUpForm followUp={followUp} onDone={() => setCompleting(false)} />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function CompleteFollowUpForm({ followUp, onDone }: { followUp: FollowUp; onDone: () => void }) {
  const { today } = useLookups();
  const { run, pending } = useAction();
  const [result, setResult] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [scheduleNext, setScheduleNext] = useState(false);
  const [type, setType] = useState<FollowUpType>(followUp.follow_up_type);
  const [due, setDue] = useState(addDaysISO(today, 7));
  const [reason, setReason] = useState("");
  const [requestId] = useState(newRequestId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await run(
      completeFollowUp({
        id: followUp.id,
        result,
        next_action: nextAction,
        next: scheduleNext ? { client_request_id: requestId, follow_up_type: type, due_date: due || null, reason: reason || nextAction || null, notes: null } : null,
      }),
    );
    if (res.ok) onDone();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Resultado" htmlFor="cf-result" optional>
        <Textarea id="cf-result" rows={2} value={result} onChange={(e) => setResult(e.target.value)} placeholder="Ha pedido presupuesto de cera" />
      </Field>
      <Field label="Próxima acción" htmlFor="cf-next" optional>
        <Input id="cf-next" value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
      </Field>
      <label className="flex items-center justify-between gap-3 text-sm font-medium">
        Programar el siguiente seguimiento
        <Switch checked={scheduleNext} onCheckedChange={setScheduleNext} />
      </label>
      {scheduleNext && (
        <div className="grid gap-4 rounded-[var(--radius-field)] bg-sunken p-3 sm:grid-cols-2">
          <Field label="Tipo" htmlFor="cf-type">
            <NativeSelect id="cf-type" value={type} onChange={(e) => setType(e.target.value as FollowUpType)}>
              {FOLLOW_UP_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FOLLOW_UP_TYPE_LABEL[t]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Fecha" htmlFor="cf-due">
            <Input id="cf-due" type="date" value={due} min={today} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label="Motivo" htmlFor="cf-reason" optional className="sm:col-span-2">
            <Input id="cf-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
      )}
      <Button type="submit" variant="primary" size="lg" loading={pending}>
        Marcar como completado
      </Button>
    </form>
  );
}
