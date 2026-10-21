"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { CustomerPicker, type PickedCustomer } from "@/components/app/customer-picker";
import { useLookups } from "@/components/app/lookups";
import { useAction } from "@/components/app/use-action";
import { createEvent, createFollowUp, registerVisit, setEventStatus, updateEvent } from "@/lib/actions/calendar";
import { EVENT_TYPE_LABEL, FOLLOW_UP_TYPE_LABEL } from "@/lib/labels";
import { EVENT_TYPES, FOLLOW_UP_TYPES, type CalendarEvent, type EventType, type FollowUpType } from "@/lib/types";
import { madridDateKey, madridTime } from "@/lib/domain/dates";
import { newRequestId } from "@/lib/utils";

// -----------------------------------------------------------------------------
// Evento del calendario
// -----------------------------------------------------------------------------
export function EventForm({
  event,
  initialCustomer = null,
  initialDate,
  initialType = "prospect_visit",
  onDone,
}: {
  event?: CalendarEvent & { customer?: PickedCustomer | null };
  initialCustomer?: PickedCustomer | null;
  initialDate?: string;
  initialType?: EventType;
  onDone?: () => void;
}) {
  const { zones, today, todayZoneId } = useLookups();
  const { run, pending } = useAction();
  const [requestId] = useState(newRequestId);
  const [customer, setCustomer] = useState<PickedCustomer | null>(event?.customer ?? initialCustomer);
  const [type, setType] = useState<EventType>(event?.event_type ?? initialType);
  const [title, setTitle] = useState(event?.title ?? "");
  const [date, setDate] = useState(event ? madridDateKey(event.starts_at) : (initialDate ?? today));
  const [start, setStart] = useState(event ? madridTime(event.starts_at) : "10:00");
  const [end, setEnd] = useState(event?.ends_at ? madridTime(event.ends_at) : "");
  const [city, setCity] = useState(event?.city ?? "");
  const [address, setAddress] = useState(event?.address ?? "");
  const [zoneId, setZoneId] = useState(event?.zone_id ?? (initialDate && initialDate !== today ? "" : (todayZoneId ?? "")));
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [reminder, setReminder] = useState(event?.reminder_minutes?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);

  const autoTitle = customer ? `${EVENT_TYPE_LABEL[type]} · ${customer.trade_name}` : EVENT_TYPE_LABEL[type];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if ((type === "customer_visit" || type === "prospect_visit") && !customer) {
      setError("Elige el establecimiento que vas a visitar.");
      return;
    }
    setError(null);
    const payload = {
      client_request_id: event ? undefined : requestId,
      title: title.trim() || autoTitle,
      event_type: type,
      customer_id: customer?.id ?? null,
      date,
      start_time: start,
      end_time: end || null,
      city: city || customer?.city || null,
      address,
      zone_id: zoneId || null,
      notes,
      reminder_minutes: reminder ? Number(reminder) : null,
    };
    const res = await run(event ? updateEvent(event.id, payload) : createEvent(payload));
    if (res.ok) onDone?.();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Tipo" htmlFor="ev-type">
        <NativeSelect id="ev-type" value={type} onChange={(e) => setType(e.target.value as EventType)}>
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {EVENT_TYPE_LABEL[t]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Cliente o prospecto" htmlFor="ev-cust" error={error ?? undefined} optional={!["customer_visit", "prospect_visit"].includes(type)}>
        <CustomerPicker id="ev-cust" value={customer} onChange={setCustomer} invalid={!!error} />
      </Field>
      <Field label="Título" htmlFor="ev-title" optional hint={!title ? `Si lo dejas vacío: «${autoTitle}»` : undefined}>
        <Input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Fecha" htmlFor="ev-date" className="col-span-2 sm:col-span-1">
          <Input id="ev-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Inicio" htmlFor="ev-start">
          <Input id="ev-start" type="time" required value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Fin" htmlFor="ev-end" optional>
          <Input id="ev-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Población" htmlFor="ev-city" optional>
          <Input id="ev-city" value={city} placeholder={customer?.city ?? ""} onChange={(e) => setCity(e.target.value)} />
        </Field>
        <Field label="Zona comercial" htmlFor="ev-zone" optional>
          <NativeSelect id="ev-zone" value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
            <option value="">Sin zona</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Dirección" htmlFor="ev-address" optional className="sm:col-span-2">
          <Input id="ev-address" value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field label="Recordatorio" htmlFor="ev-rem" optional>
          <NativeSelect id="ev-rem" value={reminder} onChange={(e) => setReminder(e.target.value)}>
            <option value="">Sin recordatorio</option>
            <option value="15">15 minutos antes</option>
            <option value="60">1 hora antes</option>
            <option value="1440">1 día antes</option>
          </NativeSelect>
        </Field>
      </div>
      <Field label="Notas" htmlFor="ev-notes" optional>
        <Textarea id="ev-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Button type="submit" variant="primary" size="lg" loading={pending}>
        {event ? "Guardar cambios" : "Programar"}
      </Button>
    </form>
  );
}

// -----------------------------------------------------------------------------
// Marcar evento como realizado: ofrece registrar el resultado comercial
// -----------------------------------------------------------------------------
export function CompleteEventForm({ event, onDone }: { event: CalendarEvent; onDone?: () => void }) {
  const { results } = useLookups();
  const { run, pending } = useAction();
  const [resultId, setResultId] = useState("");
  const [notes, setNotes] = useState("");
  const createsVisit = !!event.customer_id && ["customer_visit", "prospect_visit", "meeting", "restock"].includes(event.event_type);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await run(setEventStatus(event.id, "done", { result_id: resultId || null, notes: notes || null }), {
      success: createsVisit ? "Visita registrada como realizada." : "Evento marcado como realizado.",
    });
    if (res.ok) onDone?.();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">
        {createsVisit
          ? "Se contará como una visita realizada. Si cambias el estado más tarde, no se duplicará."
          : "Este tipo de evento no genera una visita comercial."}
      </p>
      {createsVisit && (
        <>
          <Field label="Resultado de la visita" htmlFor="ce-res" optional>
            <NativeSelect id="ce-res" value={resultId} onChange={(e) => setResultId(e.target.value)}>
              <option value="">Sin especificar</option>
              {results
                .filter((r) => r.active)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </NativeSelect>
          </Field>
          <Field label="Notas de la visita" htmlFor="ce-notes" optional>
            <Textarea id="ce-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </>
      )}
      <Button type="submit" variant="primary" size="lg" loading={pending}>
        Marcar como realizado
      </Button>
    </form>
  );
}

// -----------------------------------------------------------------------------
// Seguimiento
// -----------------------------------------------------------------------------
export function FollowUpForm({
  initialCustomer = null,
  onDone,
}: {
  initialCustomer?: PickedCustomer | null;
  onDone?: () => void;
}) {
  const { today } = useLookups();
  const { run, pending } = useAction();
  const [requestId, setRequestId] = useState(newRequestId);
  const [customer, setCustomer] = useState<PickedCustomer | null>(initialCustomer);
  const [type, setType] = useState<FollowUpType>("call");
  const [due, setDue] = useState(today);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!customer) {
      setError("Elige un cliente o prospecto.");
      return;
    }
    setError(null);
    const res = await run(
      createFollowUp({
        client_request_id: requestId,
        customer_id: customer.id,
        follow_up_type: type,
        due_date: due || null,
        reason,
        notes,
      }),
    );
    if (res.ok) {
      setRequestId(newRequestId());
      onDone?.();
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Cliente o prospecto" htmlFor="fu-cust" error={error ?? undefined}>
        <CustomerPicker id="fu-cust" value={customer} onChange={setCustomer} invalid={!!error} autoFocus={!initialCustomer} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo" htmlFor="fu-type">
          <NativeSelect id="fu-type" value={type} onChange={(e) => setType(e.target.value as FollowUpType)}>
            {FOLLOW_UP_TYPES.map((t) => (
              <option key={t} value={t}>
                {FOLLOW_UP_TYPE_LABEL[t]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Fecha prevista" htmlFor="fu-due" optional hint="Déjala vacía si aún no tiene fecha.">
          <Input id="fu-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
      </div>
      <Field label="Motivo" htmlFor="fu-reason" optional>
        <Input id="fu-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Presentar nueva línea de maquillaje" />
      </Field>
      <Field label="Notas" htmlFor="fu-notes" optional>
        <Textarea id="fu-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Button type="submit" variant="primary" size="lg" loading={pending}>
        Programar seguimiento
      </Button>
    </form>
  );
}

// -----------------------------------------------------------------------------
// Visita realizada sin cita previa
// -----------------------------------------------------------------------------
export function VisitForm({ initialCustomer = null, onDone }: { initialCustomer?: PickedCustomer | null; onDone?: () => void }) {
  const { results, today } = useLookups();
  const { run, pending } = useAction();
  const [requestId] = useState(newRequestId);
  const [customer, setCustomer] = useState<PickedCustomer | null>(initialCustomer);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState(() => madridTime(new Date()));
  const [commercial, setCommercial] = useState(true);
  const [resultId, setResultId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!customer) {
      setError("Elige el cliente visitado.");
      return;
    }
    const res = await run(
      registerVisit({
        client_request_id: requestId,
        customer_id: customer.id,
        date,
        time,
        is_commercial: commercial,
        outcome_result_id: resultId || null,
        notes,
      }),
    );
    if (res.ok) onDone?.();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Cliente" htmlFor="vf-cust" error={error ?? undefined}>
        <CustomerPicker id="vf-cust" value={customer} onChange={setCustomer} invalid={!!error} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha" htmlFor="vf-date">
          <Input id="vf-date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Hora" htmlFor="vf-time">
          <Input id="vf-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>
          Visita comercial
          <span className="block text-[13px] text-ink-muted">Desactívalo para visitas administrativas: no contarán en la tasa de cierre.</span>
        </span>
        <Switch checked={commercial} onCheckedChange={setCommercial} />
      </label>
      <Field label="Resultado" htmlFor="vf-res" optional>
        <NativeSelect id="vf-res" value={resultId} onChange={(e) => setResultId(e.target.value)}>
          <option value="">Sin especificar</option>
          {results
            .filter((r) => r.active)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
        </NativeSelect>
      </Field>
      <Field label="Notas" htmlFor="vf-notes" optional>
        <Textarea id="vf-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Button type="submit" variant="primary" size="lg" loading={pending}>
        Registrar visita
      </Button>
    </form>
  );
}
