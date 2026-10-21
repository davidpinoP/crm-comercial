"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { CustomerPicker, type PickedCustomer } from "@/components/app/customer-picker";
import { useLookups } from "@/components/app/lookups";
import { useAction } from "@/components/app/use-action";
import { updateActivity } from "@/lib/actions/prospecting";
import { madridDateKey, madridLocalToInstant, madridTime } from "@/lib/domain/dates";
import type { ActivityWithCustomerClient } from "@/components/app/activity-list";

/** Edita o completa una actividad (también las provisionales) */
export function ActivityEditForm({ activity, onDone }: { activity: ActivityWithCustomerClient; onDone?: () => void }) {
  const { types, results } = useLookups();
  const { run, pending } = useAction();
  const [customer, setCustomer] = useState<PickedCustomer | null>(activity.customer);
  const [name, setName] = useState(activity.customer ? "" : (activity.establishment_name ?? ""));
  const [createCustomer, setCreateCustomer] = useState(true);
  const [city, setCity] = useState(activity.city ?? "");
  const [typeId, setTypeId] = useState(activity.establishment_type_id ?? "");
  const [contact, setContact] = useState(activity.contact_name ?? "");
  const [resultId, setResultId] = useState(activity.result_id ?? "");
  const [notes, setNotes] = useState(activity.notes ?? "");
  const [nextAction, setNextAction] = useState(activity.next_action ?? "");
  const [followUp, setFollowUp] = useState(activity.follow_up_date ?? "");
  const [date, setDate] = useState(madridDateKey(activity.occurred_at));
  const [time, setTime] = useState(madridTime(activity.occurred_at));
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!customer && !name.trim()) {
      setError("Indica el establecimiento para completar la actividad.");
      return;
    }
    const res = await run(
      updateActivity({
        id: activity.id,
        customer_id: customer?.id ?? null,
        establishment_name: customer ? customer.trade_name : name,
        city: city || customer?.city || null,
        establishment_type_id: typeId || null,
        contact_name: contact,
        result_id: resultId || null,
        notes,
        next_action: nextAction,
        follow_up_date: followUp || null,
        occurred_at: madridLocalToInstant(date, time).toISOString(),
        create_customer: !customer && createCustomer,
      }),
    );
    if (res.ok) onDone?.();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {activity.is_provisional && (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          Puerta fría provisional: añade el establecimiento para completarla.
        </p>
      )}
      <Field label="Establecimiento" htmlFor="ae-est" error={error ?? undefined}>
        <CustomerPicker id="ae-est" value={customer} onChange={setCustomer} text={name} onTextChange={setName} allowNew invalid={!!error} />
      </Field>
      {!customer && name.trim() && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={createCustomer} onChange={(e) => setCreateCustomer(e.target.checked)} />
          Añadirlo a clientes como prospecto
        </label>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Población" htmlFor="ae-city" optional>
          <Input id="ae-city" value={city} onChange={(e) => setCity(e.target.value)} />
        </Field>
        <Field label="Tipo de establecimiento" htmlFor="ae-type" optional>
          <NativeSelect id="ae-type" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            <option value="">Sin especificar</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Resultado" htmlFor="ae-res" optional>
          <NativeSelect id="ae-res" value={resultId} onChange={(e) => setResultId(e.target.value)}>
            <option value="">Sin resultado</option>
            {results.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Persona de contacto" htmlFor="ae-contact" optional>
          <Input id="ae-contact" value={contact} onChange={(e) => setContact(e.target.value)} />
        </Field>
        <Field label="Fecha" htmlFor="ae-date">
          <Input id="ae-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Hora" htmlFor="ae-time">
          <Input id="ae-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Próxima acción" htmlFor="ae-next" optional>
          <Input id="ae-next" value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
        </Field>
        <Field label="Fecha de seguimiento" htmlFor="ae-fu" optional>
          <Input id="ae-fu" type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
        </Field>
      </div>
      <Field label="Observaciones" htmlFor="ae-notes" optional>
        <Textarea id="ae-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Button type="submit" variant="primary" size="lg" loading={pending}>
        {activity.is_provisional ? "Completar actividad" : "Guardar cambios"}
      </Button>
    </form>
  );
}
