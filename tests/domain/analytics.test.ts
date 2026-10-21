import { describe, expect, it } from "vitest";
import { dailySeries, filterByCustomer, revenueBy, snapshot, type PeriodData } from "@/lib/domain/analytics";

const flags = new Map([
  ["contact", { is_effective_contact: true, is_interest: false, is_rejection: false }],
  ["yes", { is_effective_contact: true, is_interest: true, is_rejection: false }],
]);
const cust = (id: string, zone: string, extra: Partial<PeriodData["customers"][number]> = {}) => ({
  id,
  status: "customer_active",
  city: zone === "Z1" ? "Huesca" : "Teruel",
  zone_id: zone,
  establishment_type_id: "peluqueria",
  first_contact_date: "2026-10-01",
  customer_since_date: null,
  created_at: "2026-10-01T09:00:00Z",
  initial_status: "prospect_contacted",
  ...extra,
});
const order = (id: string, customer: string, date: string, base: number, status = "confirmed") => ({
  id, customer_id: customer, order_date: date, status: status as never, base_cents: base, vat_cents: 0, total_cents: base, returns: [],
});

const data: PeriodData = {
  customers: [cust("a", "Z1"), cust("b", "Z2"), cust("c", "Z1", { initial_status: "customer_active", created_at: "2026-09-01T09:00:00Z" })],
  activities: [
    { id: "1", occurred_at: "2026-10-05T09:00:00Z", customer_id: "a", result_id: "yes", is_provisional: false },
    { id: "2", occurred_at: "2026-10-05T10:00:00Z", customer_id: "b", result_id: "contact", is_provisional: false },
    { id: "3", occurred_at: "2026-10-06T10:00:00Z", customer_id: null, result_id: null, is_provisional: true },
    { id: "4", occurred_at: "2026-10-06T11:00:00Z", customer_id: null, result_id: null, is_provisional: false, city: "Huesca" },
  ],
  visits: [
    { id: "v1", customer_id: "a", occurred_at: "2026-10-05T11:00:00Z", visit_kind: "prospect", is_commercial: true },
    { id: "v2", customer_id: "c", occurred_at: "2026-10-07T11:00:00Z", visit_kind: "customer", is_commercial: false },
    { id: "v3", customer_id: "c", occurred_at: "2026-10-08T11:00:00Z", visit_kind: "customer", is_commercial: true, deleted_at: "x" },
  ],
  orders: [order("o1", "a", "2026-10-05", 50000), order("o2", "b", "2026-10-06", 30000), order("o3", "c", "2026-10-07", 9999, "cancelled")],
  followUpsDone: [{ id: "f", customer_id: "a", completed_at: "2026-10-05T12:00:00Z" }],
  statusChanges: [
    { customer_id: "a", from_status: "interested", to_status: "customer_new", changed_at: "2026-10-05T12:00:00Z" },
    { customer_id: "c", from_status: "customer_inactive", to_status: "customer_active", changed_at: "2026-10-07T12:00:00Z" },
    { customer_id: "b", from_status: "customer_new", to_status: "customer_active", changed_at: "2026-10-07T12:00:00Z" },
  ],
};

describe("agregados de periodo", () => {
  it("cuenta cada concepto por separado sin duplicar visitas", () => {
    const s = snapshot(data, "2026-10-01", "2026-10-31", flags, ["confirmed"]);
    expect(s.prospecting).toMatchObject({ coldCalls: 4, effectiveContacts: 2, interested: 1, provisional: 1 });
    expect(s.visits).toEqual({ total: 2, prospect: 1, customer: 1, commercial: 1 });
    expect(s.newProspects).toBe(2);
    expect(s.newCustomers).toBe(1); // b ya era cliente: no cuenta
    expect(s.reactivated).toBe(1);
    expect(s.validOrders).toBe(2);
    expect(s.revenue.computable.netCents).toBe(80000);
    expect(s.followUpsDone).toBe(1);
  });

  it("filtra por zona incluyendo actividades sin cliente por su población", () => {
    const z1 = filterByCustomer(data, { zone: "Z1" });
    const s = snapshot(z1, "2026-10-01", "2026-10-31", flags, ["confirmed"]);
    expect(s.revenue.computable.netCents).toBe(50000);
    expect(s.prospecting.coldCalls).toBe(1); // sin cliente → sin zona conocida
    const huesca = snapshot(filterByCustomer(data, { city: "huesca" }), "2026-10-01", "2026-10-31", flags, ["confirmed"]);
    expect(huesca.prospecting.coldCalls).toBe(2);
  });

  it("periodos sin datos devuelven ceros", () => {
    const s = snapshot(data, "2026-01-01", "2026-01-31", flags, ["confirmed"]);
    expect(s.prospecting.coldCalls).toBe(0);
    expect(s.revenue.computable.netCents).toBe(0);
  });

  it("genera series diarias y agrupaciones", () => {
    const d = dailySeries(data, "2026-10-05", "2026-10-07", flags, ["confirmed"]);
    expect(d.map((x) => x.coldCalls)).toEqual([2, 2, 0]);
    expect(d.map((x) => x.revenueCents)).toEqual([50000, 30000, 0]);
    const byZone = revenueBy(data, "2026-10-01", "2026-10-31", (c) => c?.zone_id ?? "—", ["confirmed"]);
    expect(Object.fromEntries(byZone)).toEqual({ Z1: 50000, Z2: 30000 });
  });
});
