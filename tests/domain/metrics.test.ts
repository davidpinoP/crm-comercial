import { describe, expect, it } from "vitest";
import {
  averageTicket,
  closeRates,
  cohortConversion,
  compare,
  countProspecting,
  effectiveContactRate,
  formatRatio,
  interestRate,
  rate,
  repurchaseFrequencyDays,
  timeToFirstOrderDays,
  type OrderLite,
  type VisitRow,
} from "@/lib/domain/metrics";
import { periodRevenue, type OrderWithTotals } from "@/lib/domain/revenue";
import { compare as cmp } from "@/lib/domain/metrics";

describe("tasas y denominador cero", () => {
  it("nunca devuelve NaN ni infinito", () => {
    expect(rate(0, 0)).toEqual({ kind: "insufficient", numerator: 0, denominator: 0 });
    expect(rate(5, 0).kind).toBe("insufficient");
    expect(formatRatio(rate(1, 0))).toBe("Datos insuficientes");
    expect(rate(1, 4)).toMatchObject({ kind: "ok", value: 25 });
  });

  it("respeta un denominador mínimo", () => {
    expect(rate(1, 2, 5).kind).toBe("insufficient");
  });

  it("comparativas sin porcentajes engañosos cuando el anterior es 0", () => {
    expect(compare(10, 0)).toEqual({ kind: "from_zero", delta: 10 });
    expect(compare(0, 0)).toEqual({ kind: "unchanged_zero" });
    expect(compare(15, 10)).toEqual({ kind: "pct", value: 50 });
    expect(compare(5, 10)).toEqual({ kind: "pct", value: -50 });
    expect(compare(null, 10)).toEqual({ kind: "no_data" });
  });
});

describe("prospección", () => {
  const flags = new Map([
    ["absent", { is_effective_contact: false, is_interest: false, is_rejection: false }],
    ["no", { is_effective_contact: true, is_interest: false, is_rejection: true }],
    ["yes", { is_effective_contact: true, is_interest: true, is_rejection: false }],
  ]);
  const a = (id: string, result: string | null, extra: Partial<{ is_provisional: boolean; deleted_at: string }> = {}) => ({
    id,
    occurred_at: "2026-10-01T10:00:00Z",
    customer_id: null,
    result_id: result,
    is_provisional: false,
    ...extra,
  });

  it("cuenta puertas frías, contactos e interés con las banderas configurables", () => {
    const c = countProspecting(
      [a("1", "absent"), a("2", "no"), a("3", "yes"), a("4", null, { is_provisional: true }), a("5", "yes", { deleted_at: "x" })],
      flags,
    );
    expect(c).toEqual({ coldCalls: 4, provisional: 1, effectiveContacts: 2, interested: 1, rejections: 1, withoutResult: 0 });
    expect(effectiveContactRate(c)).toMatchObject({ kind: "ok", value: 50 });
    expect(interestRate(c)).toMatchObject({ kind: "ok", value: 50 });
  });

  it("recalcula al editar o eliminar (los contadores derivan de las filas)", () => {
    const rows = [a("1", "absent"), a("2", "yes")];
    expect(countProspecting(rows, flags).effectiveContacts).toBe(1);
    rows[0].result_id = "yes"; // edición
    expect(countProspecting(rows, flags).effectiveContacts).toBe(2);
    const deleted = [{ ...rows[0], deleted_at: "2026-10-02" }, rows[1]];
    expect(countProspecting(deleted, flags).coldCalls).toBe(1);
  });
});

describe("conversión por cohortes", () => {
  const cust = (id: string, first: string, since: string | null, started = true) => ({
    id,
    first_contact_date: first,
    customer_since_date: since,
    started_as_prospect: started,
  });

  it("mide la cohorte por fecha de captación y separa los inmaduros", () => {
    const r = cohortConversion(
      [
        cust("a", "2026-09-02", "2026-09-20"),
        cust("b", "2026-09-10", null), // maduro, no convertido
        cust("c", "2026-09-28", null), // inmaduro con 30 días de maduración y asOf 15/10
        cust("d", "2026-08-30", "2026-09-05"), // otra cohorte
        cust("e", "2026-09-05", "2026-09-05", false), // alta directa como cliente: fuera
      ],
      "2026-09-01",
      "2026-09-30",
      "2026-10-15",
      30,
    );
    expect(r).toMatchObject({ cohortSize: 3, converted: 1, immature: 1, notConverted: 1 });
    expect(r.conversion).toMatchObject({ kind: "ok" });
    expect(r.matureConversion).toMatchObject({ kind: "ok", value: 50 });
  });

  it("una cohorte vacía devuelve datos insuficientes", () => {
    expect(cohortConversion([], "2026-09-01", "2026-09-30", "2026-10-15", 30).conversion.kind).toBe("insufficient");
  });

  it("no cuenta conversiones posteriores a la fecha de corte", () => {
    const r = cohortConversion([cust("a", "2026-09-02", "2026-11-01")], "2026-09-01", "2026-09-30", "2026-10-15", 10);
    expect(r.converted).toBe(0);
  });
});

describe("tasa de cierre de visitas", () => {
  const v = (id: string, kind: "prospect" | "customer", commercial = true, deleted?: string): VisitRow => ({
    id,
    customer_id: `c-${id}`,
    occurred_at: "2026-10-05T09:00:00Z",
    visit_kind: kind,
    is_commercial: commercial,
    deleted_at: deleted ?? null,
  });
  const o = (customer: string, status = "confirmed", visit: string | null = null, date = "2026-10-05"): OrderLite => ({
    id: `o-${customer}-${status}`,
    customer_id: customer,
    order_date: date,
    status,
    visit_id: visit,
    net_base_cents: 10000,
  });

  it("separa prospectos, clientes y excluye visitas no comerciales y eliminadas", () => {
    const visits = [v("1", "prospect"), v("2", "prospect"), v("3", "customer"), v("4", "customer", false), v("5", "customer", true, "x")];
    const orders = [o("c-1"), o("c-3", "cancelled"), o("c-4"), o("zzz", "confirmed", "2")];
    const r = closeRates(visits, orders);
    expect(r.prospects).toMatchObject({ kind: "ok", value: 100 }); // 1 por mismo día, 2 por vínculo explícito
    expect(r.customers).toMatchObject({ kind: "ok", value: 0 }); // pedido cancelado no cuenta
    expect(r.all).toMatchObject({ kind: "ok", numerator: 2, denominator: 3 });
  });

  it("sin visitas → datos insuficientes", () => {
    expect(closeRates([], []).all.kind).toBe("insufficient");
  });
});

describe("ventas", () => {
  const o = (id: string, customer: string, date: string, base: number, status = "confirmed"): OrderLite => ({
    id,
    customer_id: customer,
    order_date: date,
    status,
    visit_id: null,
    net_base_cents: base,
  });

  it("ticket medio ignora cancelados y borradores", () => {
    expect(averageTicket([o("1", "a", "2026-10-01", 1000), o("2", "a", "2026-10-02", 3000), o("3", "a", "2026-10-03", 9999, "cancelled")])).toMatchObject({
      kind: "ok",
      value: 2000,
    });
    expect(averageTicket([]).kind).toBe("insufficient");
  });

  it("frecuencia de recompra y tiempo hasta el primer pedido", () => {
    const orders = [o("1", "a", "2026-10-01", 1), o("2", "a", "2026-10-11", 1), o("3", "a", "2026-10-31", 1), o("4", "b", "2026-10-05", 1)];
    expect(repurchaseFrequencyDays(orders)).toMatchObject({ kind: "ok", value: 15 });
    expect(timeToFirstOrderDays([{ id: "a", first_contact_date: "2026-09-21" }, { id: "b", first_contact_date: null }], orders)).toMatchObject({
      kind: "ok",
      value: 10,
    });
  });
});

describe("facturación y devoluciones", () => {
  const order = (id: string, date: string, status: OrderWithTotals["status"], base: number, returns: OrderWithTotals["returns"] = []): OrderWithTotals => ({
    id,
    customer_id: "c",
    order_date: date,
    status,
    base_cents: base,
    vat_cents: Math.round(base * 0.21),
    total_cents: base + Math.round(base * 0.21),
    returns,
  });

  it("separa métricas y no cuenta cancelados", () => {
    const orders = [
      order("1", "2026-10-02", "confirmed", 100000),
      order("2", "2026-10-03", "invoiced", 50000),
      order("3", "2026-10-04", "cancelled", 70000),
      order("4", "2026-10-05", "draft", 20000),
      order("5", "2026-09-30", "paid", 999999),
    ];
    const r = periodRevenue(orders, "2026-10-01", "2026-10-31");
    expect(r.registered.count).toBe(4);
    expect(r.confirmed.count).toBe(2);
    expect(r.invoiced.baseCents).toBe(50000);
    expect(r.computable.netCents).toBe(150000);
    expect(r.computable.orderIds).toEqual(["1", "2"]);
  });

  it("descuenta devoluciones en el mes en que ocurren sin borrar la venta original", () => {
    const o = order("1", "2026-09-15", "partially_returned", 100000, [{ return_date: "2026-10-03", base_cents: 30000, total_cents: 36300 }]);
    const sept = periodRevenue([o], "2026-09-01", "2026-09-30");
    const oct = periodRevenue([o], "2026-10-01", "2026-10-31");
    expect(sept.computable.netCents).toBe(100000);
    expect(oct.computable.netCents).toBe(-30000);
    expect(oct.returns).toMatchObject({ count: 1, baseCents: 30000 });
  });

  it("un pedido totalmente devuelto el mismo mes queda en cero", () => {
    const o = order("1", "2026-10-02", "fully_returned", 50000, [{ return_date: "2026-10-20", base_cents: 50000, total_cents: 60500 }]);
    expect(periodRevenue([o], "2026-10-01", "2026-10-31").computable.netCents).toBe(0);
  });

  it("respeta los estados computables configurados y la base con IVA", () => {
    const orders = [order("1", "2026-10-02", "confirmed", 10000), order("2", "2026-10-02", "paid", 10000)];
    expect(periodRevenue(orders, "2026-10-01", "2026-10-31", ["paid"]).computable.netCents).toBe(10000);
    expect(periodRevenue(orders, "2026-10-01", "2026-10-31", ["paid"], "gross").computable.netCents).toBe(12100);
  });

  it("comparativa entre meses", () => {
    const orders = [order("1", "2026-09-10", "confirmed", 100000), order("2", "2026-10-10", "confirmed", 150000)];
    const sep = periodRevenue(orders, "2026-09-01", "2026-09-30").computable.netCents;
    const oct = periodRevenue(orders, "2026-10-01", "2026-10-31").computable.netCents;
    expect(cmp(oct, sep)).toEqual({ kind: "pct", value: 50 });
  });

  it("periodos sin datos devuelven ceros", () => {
    const r = periodRevenue([], "2026-10-01", "2026-10-31");
    expect(r.computable).toMatchObject({ netCents: 0, orderCount: 0 });
  });
});
