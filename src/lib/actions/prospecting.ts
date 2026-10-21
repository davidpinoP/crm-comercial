"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuth } from "@/lib/data/context";
import { activityUpdateSchema, prospectingSchema } from "@/lib/validation";
import type { ActionResult } from "@/lib/types";
import { action, describeDbError, fail } from "./helpers";

/**
 * Registra una puerta fría. Atómico e idempotente (client_request_id):
 * si el mismo formulario se envía dos veces, se devuelve la misma actividad.
 */
export async function registerProspecting(input: unknown): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const data = prospectingSchema.parse(input);
    const { supabase } = await getAuth();
    const call = () => supabase.rpc("register_prospecting", { p: data });
    let { data: id, error } = await call();
    if (error?.code === "23505") ({ data: id, error } = await call());
    if (error) return fail(describeDbError(error));
    revalidatePath("/", "layout");
    return {
      ok: true,
      data: { id: id as string },
      message: data.is_provisional ? "Puerta fría sumada (pendiente de completar)." : "Prospección registrada.",
    };
  });
}

/** Edita o completa una actividad (incluidas las provisionales). Los contadores se recalculan al consultar. */
export async function updateActivity(input: unknown): Promise<ActionResult> {
  return action(async () => {
    const data = activityUpdateSchema.parse(input);
    const { supabase } = await getAuth();
    let customerId = data.customer_id;

    if (!customerId && data.create_customer && data.establishment_name) {
      const { data: c, error } = await supabase
        .from("customers")
        .insert({
          trade_name: data.establishment_name,
          city: data.city,
          establishment_type_id: data.establishment_type_id,
          contact_name: data.contact_name,
          status: "prospect_contacted",
        })
        .select("id")
        .single();
      if (error) return fail(describeDbError(error));
      customerId = c.id;
    }

    const { error, count } = await supabase
      .from("prospecting_activities")
      .update(
        {
          customer_id: customerId,
          establishment_name: data.establishment_name,
          city: data.city,
          establishment_type_id: data.establishment_type_id,
          contact_name: data.contact_name,
          result_id: data.result_id,
          notes: data.notes,
          next_action: data.next_action,
          follow_up_date: data.follow_up_date,
          occurred_at: data.occurred_at,
          is_provisional: false,
        },
        { count: "exact" },
      )
      .eq("id", data.id)
      .is("deleted_at", null);
    if (error) return fail(describeDbError(error));
    if (!count) return fail("No se ha encontrado la actividad.");

    if (customerId && data.follow_up_date) {
      const existing = await supabase.from("follow_ups").select("id").eq("source_activity_id", data.id).maybeSingle();
      if (!existing.data) {
        await supabase.from("follow_ups").insert({
          customer_id: customerId,
          follow_up_type: "visit",
          due_date: data.follow_up_date,
          reason: data.next_action ?? "Seguimiento de prospección",
          source_activity_id: data.id,
        });
      }
      await supabase.from("customers").update({ next_follow_up_date: data.follow_up_date, next_action: data.next_action }).eq("id", customerId);
    }
    revalidatePath("/", "layout");
    return { ok: true, data: undefined, message: "Actividad actualizada." };
  });
}

/** Eliminación lógica: conserva el historial y deja de contar en las estadísticas */
export async function deleteActivity(id: string): Promise<ActionResult> {
  return action(async () => {
    const { supabase } = await getAuth();
    const { error, count } = await supabase
      .from("prospecting_activities")
      .update({ deleted_at: new Date().toISOString() }, { count: "exact" })
      .eq("id", z.string().uuid().parse(id))
      .is("deleted_at", null);
    if (error) return fail(describeDbError(error));
    if (!count) return fail("La actividad ya no existe.");
    revalidatePath("/", "layout");
    return { ok: true, data: undefined, message: "Actividad eliminada." };
  });
}

export async function restoreActivity(id: string): Promise<ActionResult> {
  return action(async () => {
    const { supabase } = await getAuth();
    const { error } = await supabase.from("prospecting_activities").update({ deleted_at: null }).eq("id", id);
    if (error) return fail(describeDbError(error));
    revalidatePath("/", "layout");
    return { ok: true, data: undefined, message: "Actividad restaurada." };
  });
}
