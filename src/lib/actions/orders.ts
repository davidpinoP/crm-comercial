"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuth } from "@/lib/data/context";
import { eurosToCents, isoDate, optText, orderSchema, productSchema, requestId } from "@/lib/validation";
import { ORDER_STATUSES } from "@/lib/domain/revenue";
import type { ActionResult } from "@/lib/types";
import { action, describeDbError, fail } from "./helpers";

/** Guarda cabecera + líneas en una transacción. Los importes se calculan en la base de datos. */
export async function saveOrder(input: unknown, opts: { promoteCustomer?: boolean } = {}): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const data = orderSchema.parse(input);
    const { supabase } = await getAuth();
    const items = data.items.map((i) => ({
      product_id: i.product_id,
      category_id: i.category_id,
      description: i.description,
      quantity: i.quantity,
      unit_price_cents: i.unit_price,
      discount_bp: i.discount,
      vat_rate_bp: i.vat,
    }));
    const { items: _omit, ...order } = data;
    void _omit;
    const call = () => supabase.rpc("save_order", { p_order: order, p_items: items });
    let { data: id, error } = await call();
    if (error?.code === "23505" && data.client_request_id && !data.id) ({ data: id, error } = await call());
    if (error) return fail(describeDbError(error));

    // Con confirmación del usuario (casilla del formulario): un pedido válido convierte al prospecto
    // en «cliente nuevo» y reactiva a un cliente inactivo. Nunca degrada un estado.
    if (opts.promoteCustomer && !["draft", "cancelled"].includes(data.status)) {
      await supabase
        .from("customers")
        .update({ status: "customer_new" })
        .eq("id", data.customer_id)
        .in("status", ["prospect_uncontacted", "prospect_contacted", "interested", "follow_up_pending", "visit_scheduled"]);
      await supabase.from("customers").update({ status: "customer_active" }).eq("id", data.customer_id).eq("status", "customer_inactive");
    }
    revalidatePath("/", "layout");
    return { ok: true, data: { id: id as string }, message: data.id ? "Pedido actualizado." : "Pedido registrado." };
  });
}

/** Cambia el estado sin tocar las líneas: nunca duplica la facturación */
export async function setOrderStatus(id: string, status: string, paidDate?: string | null): Promise<ActionResult> {
  return action(async () => {
    const s = z.enum(ORDER_STATUSES).parse(status);
    if (s === "partially_returned" || s === "fully_returned") {
      return fail("Para registrar una devolución usa «Registrar devolución»: así se conserva el importe devuelto.");
    }
    const { supabase } = await getAuth();
    const patch: Record<string, unknown> = { status: s };
    if (s === "paid") patch.paid_date = paidDate ? isoDate.parse(paidDate) : new Date().toISOString().slice(0, 10);
    const { error, count } = await supabase.from("orders").update(patch, { count: "exact" }).eq("id", id).is("deleted_at", null);
    if (error) return fail(describeDbError(error));
    if (!count) return fail("No se ha encontrado el pedido.");
    revalidatePath("/", "layout");
    return { ok: true, data: undefined, message: "Estado del pedido actualizado." };
  });
}

const returnSchema = z.object({
  order_id: z.string().uuid(),
  return_date: isoDate,
  amount: eurosToCents("Importe devuelto", { allowZero: false }),
  reason: optText(500),
  client_request_id: requestId,
});

/** Devolución o abono: no borra el pedido; se descuenta en el mes de la devolución */
export async function registerReturn(input: unknown): Promise<ActionResult> {
  return action(async () => {
    const data = returnSchema.parse(input);
    const { supabase } = await getAuth();
    const { error } = await supabase.rpc("register_return", {
      p_order_id: data.order_id,
      p_return_date: data.return_date,
      p_base_cents: data.amount,
      p_reason: data.reason,
      p_client_request_id: data.client_request_id,
    });
    if (error) return fail(describeDbError(error));
    revalidatePath("/", "layout");
    return { ok: true, data: undefined, message: "Devolución registrada." };
  });
}

export async function deleteOrder(id: string): Promise<ActionResult> {
  return action(async () => {
    const { supabase } = await getAuth();
    const { error, count } = await supabase
      .from("orders")
      .update({ deleted_at: new Date().toISOString() }, { count: "exact" })
      .eq("id", id)
      .is("deleted_at", null);
    if (error) return fail(describeDbError(error));
    if (!count) return fail("El pedido ya no existe.");
    revalidatePath("/", "layout");
    return { ok: true, data: undefined, message: "Pedido eliminado." };
  });
}

export async function saveProduct(input: unknown): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const d = productSchema.parse(input);
    const { supabase } = await getAuth();
    const row = { name: d.name, reference: d.reference, category_id: d.category_id, price_cents: d.price, vat_rate_bp: d.vat, active: d.active };
    // Cambiar el precio no altera pedidos: cada línea guarda su propia instantánea
    const res = d.id
      ? await supabase.from("products").update(row).eq("id", d.id).select("id").single()
      : await supabase.from("products").insert(row).select("id").single();
    if (res.error) return fail(describeDbError(res.error));
    revalidatePath("/", "layout");
    return { ok: true, data: { id: res.data.id }, message: d.id ? "Producto actualizado." : "Producto creado." };
  });
}
