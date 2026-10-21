import { NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/lib/data/context";
import { loadActivities } from "@/lib/data/activities";
import { attachTotals } from "@/lib/data/sales";
import { toCsv, euros, type CsvValue } from "@/lib/domain/csv";
import { addDaysISO, formatDate, formatDateTime, madridDateKey, todayISO } from "@/lib/domain/dates";
import { CUSTOMER_STATUS_LABEL, FOLLOW_UP_TYPE_LABEL, ORDER_STATUS_LABEL } from "@/lib/labels";
import type { Customer, FollowUp, Order, Visit } from "@/lib/types";

export const dynamic = "force-dynamic";

const isDate = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function GET(req: NextRequest, { params }: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await params;
  const sp = req.nextUrl.searchParams;
  const today = todayISO();
  const from = isDate(sp.get("desde")) ? sp.get("desde")! : addDaysISO(today, -365);
  const to = isDate(sp.get("hasta")) ? sp.get("hasta")! : today;
  const ctx = await getContext();
  const { supabase } = ctx;
  const typeName = new Map(ctx.types.map((t) => [t.id, t.name]));
  const zoneName = new Map(ctx.zones.map((z) => [z.id, z.name]));
  const resultName = new Map(ctx.results.map((r) => [r.id, r.name]));

  let headers: string[] = [];
  let rows: CsvValue[][] = [];

  try {
    if (tipo === "clientes") {
      const { data, error } = await supabase.from("customers").select("*").is("archived_at", null).order("trade_name");
      if (error) throw error;
      headers = ["Nombre comercial", "Razón social", "Tipo", "Estado", "Responsable", "Teléfono", "Correo", "Dirección", "Población", "Provincia", "CP", "Zona", "Primer contacto", "Cliente desde", "Próximo seguimiento", "Potencial (€)", "Demo"];
      rows = (data as Customer[]).map((c) => [
        c.trade_name, c.legal_name, c.establishment_type_id ? typeName.get(c.establishment_type_id) : null, CUSTOMER_STATUS_LABEL[c.status],
        c.contact_name, c.phone, c.email, c.address, c.city, c.province, c.postal_code, c.zone_id ? zoneName.get(c.zone_id) : null,
        formatDate(c.first_contact_date), formatDate(c.customer_since_date), formatDate(c.next_follow_up_date), euros(c.estimated_potential_cents), c.is_demo,
      ]);
    } else if (tipo === "pedidos") {
      const { data, error } = await supabase
        .from("orders")
        .select("*, customer:customers(trade_name, city)")
        .is("deleted_at", null)
        .gte("order_date", from)
        .lte("order_date", to)
        .order("order_date");
      if (error) throw error;
      const full = await attachTotals(ctx, data as Order[]);
      const cust = new Map((data as (Order & { customer: { trade_name: string; city: string | null } })[]).map((o) => [o.id, o.customer]));
      headers = ["Fecha", "Nº pedido", "Cliente", "Población", "Estado", "Base imponible (€)", "IVA (€)", "Total (€)", "Devuelto base (€)", "Entrega", "Cobro", "Demo"];
      rows = full.map((o) => [
        formatDate(o.order_date), o.order_number, cust.get(o.id)?.trade_name, cust.get(o.id)?.city, ORDER_STATUS_LABEL[o.status],
        euros(o.base_cents), euros(o.vat_cents), euros(o.total_cents), euros(o.returns.reduce((s, r) => s + r.base_cents, 0)),
        formatDate(o.delivery_date), formatDate(o.paid_date), o.is_demo,
      ]);
    } else if (tipo === "prospecciones") {
      const acts = await loadActivities(ctx, from, to, { limit: 20000 });
      headers = ["Fecha y hora", "Establecimiento", "Población", "Tipo", "Contacto", "Resultado", "Provisional", "Próxima acción", "Seguimiento", "Observaciones"];
      rows = acts.map((a) => [
        formatDateTime(a.occurred_at), a.customer?.trade_name ?? a.establishment_name, a.city ?? a.customer?.city,
        a.establishment_type_id ? typeName.get(a.establishment_type_id) : null, a.contact_name,
        a.result_id ? resultName.get(a.result_id) : null, a.is_provisional, a.next_action, formatDate(a.follow_up_date), a.notes,
      ]);
    } else if (tipo === "visitas") {
      const { data, error } = await supabase
        .from("visits")
        .select("*, customer:customers(trade_name, city)")
        .is("deleted_at", null)
        .gte("occurred_at", `${from}T00:00:00Z`)
        .order("occurred_at");
      if (error) throw error;
      headers = ["Fecha y hora", "Cliente", "Población", "Tipo", "Comercial", "Resultado", "Notas"];
      rows = (data as (Visit & { customer: { trade_name: string; city: string | null } })[])
        .filter((v) => madridDateKey(v.occurred_at) <= to)
        .map((v) => [
          formatDateTime(v.occurred_at), v.customer?.trade_name, v.customer?.city, v.visit_kind === "customer" ? "Cliente actual" : "Prospecto",
          v.is_commercial, v.outcome_result_id ? resultName.get(v.outcome_result_id) : null, v.notes,
        ]);
    } else if (tipo === "seguimientos") {
      const { data, error } = await supabase.from("follow_ups").select("*, customer:customers(trade_name)").order("due_date");
      if (error) throw error;
      headers = ["Cliente", "Tipo", "Fecha prevista", "Estado", "Motivo", "Resultado", "Completado"];
      rows = (data as (FollowUp & { customer: { trade_name: string } })[]).map((f) => [
        f.customer?.trade_name, FOLLOW_UP_TYPE_LABEL[f.follow_up_type], formatDate(f.due_date),
        f.status === "pending" ? "Pendiente" : f.status === "done" ? "Completado" : "Cancelado", f.reason, f.result, formatDate(f.completed_at),
      ]);
    } else {
      return NextResponse.json({ error: "Tipo de exportación no válido" }, { status: 404 });
    }
  } catch (e) {
    console.error("[exportar]", e);
    return NextResponse.json({ error: "No se ha podido generar la exportación" }, { status: 500 });
  }

  return new NextResponse(toCsv(headers, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${tipo}-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
