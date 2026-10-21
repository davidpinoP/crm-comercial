"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuth } from "@/lib/data/context";
import { customerSchema, requestId } from "@/lib/validation";
import { CUSTOMER_STATUSES, type ActionResult, type Customer } from "@/lib/types";
import { action, describeDbError, fail } from "./helpers";

const revalidate = (id?: string) => {
  revalidatePath("/", "layout");
  if (id) revalidatePath(`/clientes/${id}`);
};

export async function createCustomer(input: unknown, clientRequestId: string): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const data = customerSchema.parse(input);
    const req = requestId.parse(clientRequestId);
    const { supabase } = await getAuth();
    // Idempotencia: si el formulario se reenvía, devolver el cliente ya creado
    const existing = await supabase.from("customers").select("id").eq("client_request_id", req).maybeSingle();
    if (existing.data) return { ok: true, data: { id: existing.data.id } };
    const { data: row, error } = await supabase
      .from("customers")
      .insert({ ...data, client_request_id: req })
      .select("id")
      .single();
    if (error) {
      // Dos envíos simultáneos: el segundo choca con el índice único y recupera el primero
      if (error.code === "23505") {
        const again = await supabase.from("customers").select("id").eq("client_request_id", req).maybeSingle();
        if (again.data) return { ok: true, data: { id: again.data.id } };
      }
      return fail(describeDbError(error));
    }
    revalidate();
    return { ok: true, data: { id: row.id }, message: "Cliente creado." };
  });
}

export async function updateCustomer(id: string, input: unknown): Promise<ActionResult> {
  return action(async () => {
    const data = customerSchema.parse(input);
    const { supabase } = await getAuth();
    const { error, count } = await supabase.from("customers").update(data, { count: "exact" }).eq("id", z.string().uuid().parse(id));
    if (error) return fail(describeDbError(error));
    if (!count) return fail("No se ha encontrado el cliente.");
    revalidate(id);
    return { ok: true, data: undefined, message: "Cambios guardados." };
  });
}

export async function setCustomerStatus(id: string, status: string): Promise<ActionResult> {
  return action(async () => {
    const s = z.enum(CUSTOMER_STATUSES).parse(status);
    const { supabase } = await getAuth();
    const { error, count } = await supabase.from("customers").update({ status: s }, { count: "exact" }).eq("id", id);
    if (error) return fail(describeDbError(error));
    if (!count) return fail("No se ha encontrado el cliente.");
    revalidate(id);
    return { ok: true, data: undefined, message: "Estado actualizado." };
  });
}

export async function archiveCustomer(id: string, archived: boolean): Promise<ActionResult> {
  return action(async () => {
    const { supabase } = await getAuth();
    const { error, count } = await supabase
      .from("customers")
      .update({ archived_at: archived ? new Date().toISOString() : null }, { count: "exact" })
      .eq("id", id);
    if (error) return fail(describeDbError(error));
    if (!count) return fail("No se ha encontrado el cliente.");
    revalidate(id);
    return { ok: true, data: undefined, message: archived ? "Cliente archivado." : "Cliente restaurado." };
  });
}

export async function mergeCustomers(keepId: string, mergeId: string): Promise<ActionResult> {
  return action(async () => {
    const { supabase } = await getAuth();
    const { error } = await supabase.rpc("merge_customers", {
      p_keep: z.string().uuid().parse(keepId),
      p_merge: z.string().uuid().parse(mergeId),
    });
    if (error) return fail(describeDbError(error));
    revalidate(keepId);
    return { ok: true, data: undefined, message: "Clientes fusionados. Se han conservado todas las actividades y pedidos." };
  });
}

export type CustomerSuggestion = Pick<Customer, "id" | "trade_name" | "city" | "status" | "phone" | "establishment_type_id">;

/** Búsqueda para autocompletar y para el buscador global (nombre, población, teléfono, tipo) */
export async function searchCustomers(term: string, limit = 8): Promise<CustomerSuggestion[]> {
  const t = term.trim().replace(/[%,()]/g, " ").slice(0, 60);
  if (t.length < 2) return [];
  const { supabase } = await getAuth();
  const like = `%${t}%`;
  const digits = t.replace(/\D/g, "");
  const { data: types } = await supabase.from("establishment_types").select("id").ilike("name", like);
  const typeIds = (types ?? []).map((x) => x.id);
  const filters = [`trade_name.ilike.${like}`, `legal_name.ilike.${like}`, `city.ilike.${like}`, `contact_name.ilike.${like}`];
  if (digits.length >= 3) filters.push(`phone.ilike.%${digits}%`);
  if (typeIds.length) filters.push(`establishment_type_id.in.(${typeIds.join(",")})`);
  const { data } = await supabase
    .from("customers")
    .select("id, trade_name, city, status, phone, establishment_type_id")
    .is("archived_at", null)
    .or(filters.join(","))
    .order("updated_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as CustomerSuggestion[];
}
