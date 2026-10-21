"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuth } from "@/lib/data/context";
import { eventSchema, eventStatusSchema, followUpSchema, isoDate, optText, optUuid, requestId } from "@/lib/validation";
import { madridLocalToInstant } from "@/lib/domain/dates";
import type { ActionResult } from "@/lib/types";
import { action, describeDbError, fail } from "./helpers";

const done = (message: string) => {
  revalidatePath("/", "layout");
  return { ok: true as const, data: undefined, message };
};

function eventRow(data: z.output<typeof eventSchema>) {
  const starts = madridLocalToInstant(data.date, data.start_time);
  const ends = data.end_time ? madridLocalToInstant(data.date, data.end_time) : null;
  return {
    title: data.title,
    event_type: data.event_type,
    customer_id: data.customer_id,
    starts_at: starts.toISOString(),
    ends_at: ends?.toISOString() ?? null,
    city: data.city,
    address: data.address,
    zone_id: data.zone_id,
    notes: data.notes,
    reminder_minutes: data.reminder_minutes ?? null,
  };
}

export async function createEvent(input: unknown): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const data = eventSchema.parse(input);
    const { supabase } = await getAuth();
    if (data.client_request_id) {
      const ex = await supabase.from("calendar_events").select("id").eq("client_request_id", data.client_request_id).maybeSingle();
      if (ex.data) return { ok: true, data: { id: ex.data.id } };
    }
    const { data: row, error } = await supabase
      .from("calendar_events")
      .insert({ ...eventRow(data), client_request_id: data.client_request_id ?? null })
      .select("id")
      .single();
    if (error) return fail(describeDbError(error));
    // Una visita concertada adelanta el estado comercial del prospecto (sólo si aún no es cliente)
    if (data.customer_id && data.event_type === "prospect_visit") {
      await supabase
        .from("customers")
        .update({ status: "visit_scheduled" })
        .eq("id", data.customer_id)
        .in("status", ["prospect_uncontacted", "prospect_contacted", "interested", "follow_up_pending"]);
    }
    revalidatePath("/", "layout");
    return { ok: true, data: { id: row.id }, message: "Evento programado." };
  });
}

export async function updateEvent(id: string, input: unknown): Promise<ActionResult> {
  return action(async () => {
    const data = eventSchema.parse(input);
    const { supabase } = await getAuth();
    const { error, count } = await supabase
      .from("calendar_events")
      .update(eventRow(data), { count: "exact" })
      .eq("id", z.string().uuid().parse(id))
      .is("deleted_at", null);
    if (error) return fail(describeDbError(error));
    if (!count) return fail("No se ha encontrado el evento.");
    return done("Evento actualizado.");
  });
}

/** Cambia el estado. «Realizado» crea una única visita (la función SQL evita duplicados). */
export async function setEventStatus(
  id: string,
  status: string,
  outcome?: { result_id?: string | null; notes?: string | null },
): Promise<ActionResult<{ visitId: string | null }>> {
  return action(async () => {
    const s = eventStatusSchema.parse(status);
    const { supabase } = await getAuth();
    const { data, error } = await supabase.rpc("set_event_status", {
      p_event_id: z.string().uuid().parse(id),
      p_status: s,
      p_outcome_result_id: optUuid.parse(outcome?.result_id ?? null),
      p_notes: optText(2000).parse(outcome?.notes ?? null),
    });
    if (error) return fail(describeDbError(error));
    revalidatePath("/", "layout");
    return { ok: true, data: { visitId: (data as string | null) ?? null }, message: "Estado actualizado." };
  });
}

export async function rescheduleEvent(id: string, date: string, start: string, end?: string | null): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const d = isoDate.parse(date);
    const s = madridLocalToInstant(d, z.string().regex(/^\d{2}:\d{2}$/).parse(start));
    const e = end ? madridLocalToInstant(d, end) : null;
    if (e && e < s) return fail("La hora de fin es anterior al inicio.");
    const { supabase } = await getAuth();
    const { data, error } = await supabase.rpc("reschedule_event", {
      p_event_id: id,
      p_starts_at: s.toISOString(),
      p_ends_at: e?.toISOString() ?? null,
    });
    if (error) return fail(describeDbError(error));
    revalidatePath("/", "layout");
    return { ok: true, data: { id: data as string }, message: "Evento reprogramado." };
  });
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  return action(async () => {
    const { supabase } = await getAuth();
    // Si generó una visita, la anulamos para no contarla
    const { error: e1 } = await supabase.rpc("set_event_status", { p_event_id: id, p_status: "cancelled" });
    if (e1) return fail(describeDbError(e1));
    const { error } = await supabase.from("calendar_events").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) return fail(describeDbError(error));
    return done("Evento eliminado.");
  });
}

const visitSchema = z.object({
  client_request_id: requestId,
  customer_id: z.string().uuid("Elige un cliente."),
  date: isoDate,
  time: z.string().regex(/^\d{2}:\d{2}$/),
  is_commercial: z.boolean().default(true),
  outcome_result_id: optUuid,
  notes: optText(2000),
});

/** Visita realizada sin evento previo en el calendario */
export async function registerVisit(input: unknown): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const data = visitSchema.parse(input);
    const { supabase } = await getAuth();
    const ex = await supabase.from("visits").select("id").eq("client_request_id", data.client_request_id).maybeSingle();
    if (ex.data) return { ok: true, data: { id: ex.data.id } };
    const { data: c, error: ce } = await supabase.from("customers").select("status").eq("id", data.customer_id).single();
    if (ce) return fail(describeDbError(ce));
    const { data: row, error } = await supabase
      .from("visits")
      .insert({
        customer_id: data.customer_id,
        occurred_at: madridLocalToInstant(data.date, data.time).toISOString(),
        visit_kind: String(c.status).startsWith("customer_") ? "customer" : "prospect",
        is_commercial: data.is_commercial,
        outcome_result_id: data.outcome_result_id,
        notes: data.notes,
        client_request_id: data.client_request_id,
      })
      .select("id")
      .single();
    if (error) return fail(describeDbError(error));
    revalidatePath("/", "layout");
    return { ok: true, data: { id: row.id }, message: "Visita registrada." };
  });
}

export async function deleteVisit(id: string): Promise<ActionResult> {
  return action(async () => {
    const { supabase } = await getAuth();
    const { error } = await supabase.from("visits").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) return fail(describeDbError(error));
    return done("Visita eliminada.");
  });
}

// -----------------------------------------------------------------------------
// Seguimientos
// -----------------------------------------------------------------------------
export async function createFollowUp(input: unknown): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const data = followUpSchema.parse(input);
    const { supabase } = await getAuth();
    if (data.client_request_id) {
      const ex = await supabase.from("follow_ups").select("id").eq("client_request_id", data.client_request_id).maybeSingle();
      if (ex.data) return { ok: true, data: { id: ex.data.id } };
    }
    const { data: row, error } = await supabase
      .from("follow_ups")
      .insert({ ...data, client_request_id: data.client_request_id ?? null })
      .select("id")
      .single();
    if (error) return fail(describeDbError(error));
    if (data.due_date) {
      await supabase.from("customers").update({ next_follow_up_date: data.due_date }).eq("id", data.customer_id);
    }
    revalidatePath("/", "layout");
    return { ok: true, data: { id: row.id }, message: "Seguimiento programado." };
  });
}

const completeSchema = z.object({
  id: z.string().uuid(),
  result: optText(1000),
  next_action: optText(300),
  next: followUpSchema.omit({ customer_id: true }).optional().nullable(),
});

/** Completa un seguimiento y, opcionalmente, programa el siguiente */
export async function completeFollowUp(input: unknown): Promise<ActionResult> {
  return action(async () => {
    const data = completeSchema.parse(input);
    const { supabase } = await getAuth();
    const { data: fu, error: fe } = await supabase
      .from("follow_ups")
      .update({ status: "done", completed_at: new Date().toISOString(), result: data.result, next_action: data.next_action })
      .eq("id", data.id)
      .eq("status", "pending")
      .select("customer_id")
      .maybeSingle();
    if (fe) return fail(describeDbError(fe));
    if (!fu) return fail("Este seguimiento ya estaba completado o no existe.");

    if (data.next) {
      const { error } = await supabase.from("follow_ups").insert({
        ...data.next,
        client_request_id: data.next.client_request_id ?? null,
        customer_id: fu.customer_id,
        previous_follow_up_id: data.id,
      });
      if (error && error.code !== "23505") return fail(`Seguimiento completado, pero no se pudo programar el siguiente: ${describeDbError(error)}`);
    }
    // Próximo seguimiento del cliente = el pendiente más cercano
    const { data: pending } = await supabase
      .from("follow_ups")
      .select("due_date")
      .eq("customer_id", fu.customer_id)
      .eq("status", "pending")
      .not("due_date", "is", null)
      .order("due_date")
      .limit(1);
    await supabase
      .from("customers")
      .update({
        next_follow_up_date: pending?.[0]?.due_date ?? null,
        ...(data.next_action ? { next_action: data.next_action } : {}),
      })
      .eq("id", fu.customer_id);
    return done(data.next ? "Seguimiento completado y siguiente programado." : "Seguimiento completado.");
  });
}

export async function cancelFollowUp(id: string): Promise<ActionResult> {
  return action(async () => {
    const { supabase } = await getAuth();
    const { error } = await supabase.from("follow_ups").update({ status: "cancelled" }).eq("id", id).eq("status", "pending");
    if (error) return fail(describeDbError(error));
    return done("Seguimiento cancelado.");
  });
}

export async function rescheduleFollowUp(id: string, dueDate: string | null): Promise<ActionResult> {
  return action(async () => {
    const { supabase } = await getAuth();
    const { error } = await supabase
      .from("follow_ups")
      .update({ due_date: dueDate ? isoDate.parse(dueDate) : null })
      .eq("id", id)
      .eq("status", "pending");
    if (error) return fail(describeDbError(error));
    return done("Fecha actualizada.");
  });
}
