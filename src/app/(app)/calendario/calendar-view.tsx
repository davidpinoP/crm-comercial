"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import esLocale from "@fullcalendar/core/locales/es";
import type { DatesSetArg, EventClickArg, EventInput } from "@fullcalendar/core";
import { CalendarClock, CheckCircle2, ExternalLink, Pencil, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { getCalendarRange, type CalendarPayload } from "@/lib/actions/calendar-data";
import { deleteEvent, rescheduleEvent, setEventStatus } from "@/lib/actions/calendar";
import { CompleteEventForm, EventForm } from "@/components/app/forms/event-forms";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm";
import { useQuickActions } from "@/components/app/quick-actions";
import { useAction } from "@/components/app/use-action";
import { EVENT_STATUS_LABEL, EVENT_TYPE_LABEL, FOLLOW_UP_TYPE_LABEL } from "@/lib/labels";
import { addDaysISO, formatDateTime, madridDateKey, madridTime } from "@/lib/domain/dates";
import type { EventType } from "@/lib/types";

type Ev = CalendarPayload["events"][number];

const TYPE_COLOR: Record<EventType, string> = {
  cold_call: "var(--chart-4)",
  customer_visit: "var(--positive)",
  prospect_visit: "var(--accent)",
  phone_follow_up: "var(--progress)",
  meeting: "var(--chart-2)",
  restock: "var(--chart-3)",
  route: "var(--ink-muted)",
  other: "var(--ink-faint)",
};

/** Hora de pared en Madrid sin desfase: el calendario se muestra en hora de Madrid sea cual sea el dispositivo */
const wall = (iso: string) => `${madridDateKey(iso)}T${madridTime(iso)}:00`;

export function CalendarView() {
  const qa = useQuickActions();
  const router = useRouter();
  const [data, setData] = useState<CalendarPayload | null>(null);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [selected, setSelected] = useState<Ev | null>(null);
  const [mode, setMode] = useState<"view" | "edit" | "complete" | "reschedule">("view");
  const [error, setError] = useState<string | null>(null);
  const calRef = useRef<FullCalendar>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    setIsMobile(mq.matches);
  }, []);

  const load = useCallback(async (from: string, to: string) => {
    try {
      setError(null);
      setData(await getCalendarRange(from, to));
    } catch {
      setError("No se ha podido cargar el calendario. Comprueba la conexión.");
    }
  }, []);

  useEffect(() => {
    if (range) void load(range.from, range.to);
  }, [range, load]);

  const refresh = useCallback(() => {
    if (range) void load(range.from, range.to);
    router.refresh();
  }, [range, load, router]);

  const onDates = (arg: DatesSetArg) => {
    const from = arg.startStr.slice(0, 10);
    const to = addDaysISO(arg.endStr.slice(0, 10), -1);
    setRange((r) => (r?.from === from && r?.to === to ? r : { from, to }));
  };

  const events: EventInput[] = [];
  if (data) {
    for (const e of data.events) {
      const inactive = e.status === "cancelled" || e.status === "rescheduled" || e.status === "not_done";
      events.push({
        id: e.id,
        title: `${e.status === "done" ? "✓ " : ""}${e.title}`,
        start: wall(e.starts_at),
        end: e.ends_at ? wall(e.ends_at) : undefined,
        backgroundColor: inactive ? "var(--sunken)" : TYPE_COLOR[e.event_type],
        textColor: inactive ? "var(--ink-faint)" : "#fff",
        classNames: inactive ? ["line-through"] : e.status === "done" ? ["opacity-75"] : [],
        extendedProps: { kind: "event" },
      });
    }
    for (const f of data.followUps) {
      events.push({
        id: `fu-${f.id}`,
        title: `${FOLLOW_UP_TYPE_LABEL[f.follow_up_type]} · ${f.customer?.trade_name ?? ""}`,
        start: f.due_date!,
        allDay: true,
        backgroundColor: "var(--progress-soft)",
        textColor: "var(--progress)",
        extendedProps: { kind: "followup", customerId: f.customer_id },
      });
    }
    for (const z of data.zones) {
      if (!z.zone) continue;
      events.push({
        start: z.date,
        allDay: true,
        display: "background",
        backgroundColor: z.zone.color ?? "var(--ink-faint)",
        classNames: ["opacity-[0.08]"],
      });
    }
  }
  const zoneByDate = new Map(data?.zones.map((z) => [z.date, z.zone]) ?? []);

  const onEventClick = (arg: EventClickArg) => {
    if (arg.event.extendedProps.kind === "followup") {
      router.push(`/clientes/${arg.event.extendedProps.customerId}`);
      return;
    }
    const ev = data?.events.find((e) => e.id === arg.event.id);
    if (ev) {
      setSelected(ev);
      setMode("view");
    }
  };

  return (
    <>
      {error && <p className="mb-3 rounded-lg bg-negative-soft px-3 py-2 text-sm text-negative">{error}</p>}
      <div className="rounded-[var(--radius-card)] border border-line bg-paper p-2 shadow-card sm:p-4">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          locale={esLocale}
          timeZone="UTC"
          now={() => wall(new Date().toISOString())}
          initialView={isMobile ? "listWeek" : "timeGridWeek"}
          headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek" }}
          buttonText={{ today: "Hoy", month: "Mes", week: "Semana", day: "Día", list: "Agenda" }}
          firstDay={1}
          height="auto"
          slotMinTime="07:00:00"
          slotMaxTime="21:00:00"
          allDayText="Todo el día"
          nowIndicator
          events={events}
          datesSet={onDates}
          eventClick={onEventClick}
          dateClick={(arg) => qa.open({ kind: "event", date: arg.dateStr.slice(0, 10) })}
          dayCellContent={(arg) => {
            const key = arg.date.toISOString().slice(0, 10);
            const z = zoneByDate.get(key);
            return (
              <div className="flex w-full items-center justify-between gap-1">
                {z && arg.view.type === "dayGridMonth" ? (
                  <span className="truncate text-[10px] font-medium" style={{ color: z.color ?? undefined }}>
                    {z.name}
                  </span>
                ) : (
                  <span />
                )}
                <span>{arg.dayNumberText}</span>
              </div>
            );
          }}
          dayHeaderContent={(arg) => {
            const key = arg.date.toISOString().slice(0, 10);
            const z = zoneByDate.get(key);
            return (
              <div className="py-1 leading-tight">
                <div>{arg.text}</div>
                {z && arg.view.type !== "dayGridMonth" && (
                  <div className="text-[10px] font-medium normal-case" style={{ color: z.color ?? undefined }}>
                    {z.name}
                  </div>
                )}
              </div>
            );
          }}
          noEventsText="No hay eventos en este periodo"
        />
      </div>
      <p className="mt-2 text-[12px] text-ink-faint">Horas en zona horaria de Madrid. Los seguimientos aparecen como eventos de día completo.</p>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        {selected && (
          <DialogContent
            title={mode === "edit" ? "Editar evento" : mode === "complete" ? "Marcar como realizado" : mode === "reschedule" ? "Reprogramar" : selected.title}
            description={mode === "view" ? `${EVENT_TYPE_LABEL[selected.event_type]} · ${formatDateTime(selected.starts_at)}` : undefined}
            size={mode === "edit" ? "lg" : "md"}
          >
            {mode === "view" && (
              <EventDetails
                ev={selected}
                onMode={setMode}
                onChanged={() => {
                  setSelected(null);
                  refresh();
                }}
              />
            )}
            {mode === "edit" && (
              <EventForm
                event={{ ...selected, customer: selected.customer ? { ...selected.customer } : null }}
                onDone={() => {
                  setSelected(null);
                  refresh();
                }}
              />
            )}
            {mode === "complete" && (
              <CompleteEventForm
                event={selected}
                onDone={() => {
                  setSelected(null);
                  refresh();
                }}
              />
            )}
            {mode === "reschedule" && (
              <RescheduleForm
                ev={selected}
                onDone={() => {
                  setSelected(null);
                  refresh();
                }}
              />
            )}
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

function EventDetails({ ev, onMode, onChanged }: { ev: Ev; onMode: (m: "edit" | "complete" | "reschedule") => void; onChanged: () => void }) {
  const { run, pending } = useAction();
  const setStatus = async (s: "scheduled" | "not_done" | "cancelled") => {
    const res = await run(setEventStatus(ev.id, s), { refresh: false });
    if (res.ok) onChanged();
  };
  const closed = ev.status === "rescheduled";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Badge tone={ev.status === "done" ? "positive" : ev.status === "scheduled" ? "progress" : "neutral"}>{EVENT_STATUS_LABEL[ev.status]}</Badge>
        {ev.ends_at && <Badge>hasta {madridTime(ev.ends_at)}</Badge>}
      </div>
      <dl className="space-y-2 text-sm">
        {ev.customer && (
          <div>
            <dt className="text-[12px] text-ink-muted">Cliente</dt>
            <dd>
              <Link href={`/clientes/${ev.customer.id}`} className="inline-flex items-center gap-1 font-medium hover:underline">
                {ev.customer.trade_name}
                <ExternalLink className="size-3.5" />
              </Link>
            </dd>
          </div>
        )}
        {(ev.address || ev.city) && (
          <div>
            <dt className="text-[12px] text-ink-muted">Lugar</dt>
            <dd>{[ev.address, ev.city].filter(Boolean).join(", ")}</dd>
          </div>
        )}
        {ev.notes && (
          <div>
            <dt className="text-[12px] text-ink-muted">Notas</dt>
            <dd className="whitespace-pre-line">{ev.notes}</dd>
          </div>
        )}
      </dl>
      {closed ? (
        <p className="text-sm text-ink-muted">Este evento se reprogramó; edita la nueva cita.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {ev.status !== "done" && (
            <Button variant="primary" className="col-span-2" onClick={() => onMode("complete")}>
              <CheckCircle2 />
              Marcar como realizado
            </Button>
          )}
          {ev.status === "done" && (
            <Button className="col-span-2" loading={pending} onClick={() => setStatus("scheduled")}>
              Volver a «Programado»
            </Button>
          )}
          {ev.status !== "done" && (
            <Button onClick={() => onMode("reschedule")}>
              <CalendarClock />
              Reprogramar
            </Button>
          )}
          {ev.status === "scheduled" && (
            <Button loading={pending} onClick={() => setStatus("not_done")}>
              <XCircle />
              No realizado
            </Button>
          )}
          {ev.status === "scheduled" && (
            <Button loading={pending} onClick={() => setStatus("cancelled")}>
              Cancelar cita
            </Button>
          )}
          {(ev.status === "cancelled" || ev.status === "not_done") && (
            <Button loading={pending} onClick={() => setStatus("scheduled")}>
              Reactivar
            </Button>
          )}
          <Button onClick={() => onMode("edit")}>
            <Pencil />
            Editar
          </Button>
          <ConfirmDialog
            trigger={
              <Button variant="ghost" className="text-negative">
                <Trash2 />
                Eliminar
              </Button>
            }
            title="¿Eliminar este evento?"
            description="Si estaba realizado, la visita asociada dejará de contar en las estadísticas."
            onConfirm={async () => {
              const res = await run(deleteEvent(ev.id), { refresh: false });
              if (res.ok) onChanged();
            }}
          />
        </div>
      )}
    </div>
  );
}

function RescheduleForm({ ev, onDone }: { ev: Ev; onDone: () => void }) {
  const { run, pending } = useAction();
  const [date, setDate] = useState(madridDateKey(ev.starts_at));
  const [start, setStart] = useState(madridTime(ev.starts_at));
  const [end, setEnd] = useState(ev.ends_at ? madridTime(ev.ends_at) : "");
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (end && end < start) {
          toast.error("La hora de fin es anterior al inicio.");
          return;
        }
        const res = await run(rescheduleEvent(ev.id, date, start, end || null), { refresh: false });
        if (res.ok) onDone();
      }}
    >
      <p className="text-sm text-ink-muted">La cita original quedará como «Reprogramado» y se creará una nueva con los mismos datos.</p>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Fecha" htmlFor="rs-date" className="col-span-3 sm:col-span-1">
          <Input id="rs-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Inicio" htmlFor="rs-start">
          <Input id="rs-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
        </Field>
        <Field label="Fin" htmlFor="rs-end" optional>
          <Input id="rs-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <Button type="submit" variant="primary" size="lg" loading={pending}>
        Reprogramar
      </Button>
    </form>
  );
}
