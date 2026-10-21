/**
 * Pruebas contra Postgres real (PGlite) ejecutando las migraciones del proyecto:
 * RLS, idempotencia, visitas sin doble cómputo, pedidos, devoluciones y fusión.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser, type TestDb } from "./harness";
import { computeLine } from "@/lib/domain/money";

const ALICE = "aaaaaaaa-0000-4000-8000-000000000001";
const BOB = "bbbbbbbb-0000-4000-8000-000000000002";
const REQ = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

let db: TestDb;
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows;
const asAlice = <T>(fn: () => Promise<T>) => asUser(db, ALICE, fn);
const asBob = <T>(fn: () => Promise<T>) => asUser(db, BOB, fn);

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, ALICE);
  await createUser(db, BOB);
});

async function newCustomer(name: string, status = "prospect_contacted"): Promise<string> {
  const [row] = await q<{ id: string }>(
    "insert into customers(trade_name, city, status) values ($1, 'Zaragoza', $2) returning id",
    [name, status],
  );
  return row.id;
}

describe("valores iniciales", () => {
  it("crea configuración, resultados, tipos y tramos para cada usuario", async () => {
    await asAlice(async () => {
      expect((await q("select * from establishment_types")).length).toBe(8);
      expect((await q("select * from prospecting_results")).length).toBe(8);
      expect((await q("select * from product_categories")).length).toBe(4);
      const tiers = await q<{ lower_cents: string; lower_inclusive: boolean; rate_bp: number }>(
        "select lower_cents, lower_inclusive, rate_bp from commission_tiers order by lower_cents",
      );
      expect(tiers.map((t) => [Number(t.lower_cents), t.lower_inclusive, t.rate_bp])).toEqual([
        [0, true, 0],
        [600000, true, 400],
        [800000, true, 600],
        [1000000, false, 800],
      ]);
      expect((await q("select * from app_settings")).length).toBe(1);
    });
  });
});

describe("seguridad (RLS)", () => {
  let aliceCustomer: string;

  beforeAll(async () => {
    aliceCustomer = await asAlice(() => newCustomer("Perfumería Alice"));
  });

  it("cada usuario sólo ve sus propios datos", async () => {
    await asBob(async () => {
      expect(await q("select * from customers")).toEqual([]);
      expect((await q("select * from prospecting_results")).length).toBe(8); // los suyos
    });
    await asAlice(async () => {
      expect((await q("select * from customers")).length).toBeGreaterThan(0);
    });
  });

  it("no permite modificar ni borrar datos ajenos", async () => {
    await asBob(async () => {
      await q("update customers set trade_name = 'hack' where id = $1", [aliceCustomer]);
      await q("delete from customers where id = $1", [aliceCustomer]);
    });
    await asAlice(async () => {
      const [c] = await q<{ trade_name: string }>("select trade_name from customers where id = $1", [aliceCustomer]);
      expect(c.trade_name).toBe("Perfumería Alice");
    });
  });

  it("rechaza insertar filas a nombre de otro usuario", async () => {
    await expect(
      asBob(() => q("insert into customers(user_id, trade_name) values ($1, 'x')", [ALICE])),
    ).rejects.toThrow(/row-level security/);
  });

  it("rechaza vincular registros propios con registros ajenos", async () => {
    await expect(
      asBob(() =>
        q("insert into prospecting_activities(customer_id, establishment_name) values ($1, 'x')", [aliceCustomer]),
      ),
    ).rejects.toThrow(/Referencia no válida/);
  });

  it("los anónimos no acceden a nada", async () => {
    await expect(asUser(db, null, () => q("select * from customers"))).rejects.toThrow(/permission denied/);
  });

  it("las funciones transaccionales exigen autenticación", async () => {
    await expect(
      asUser(db, null, () => q("select register_prospecting('{}'::jsonb)")),
    ).rejects.toThrow();
  });
});

describe("prospección", () => {
  it("crea una prospección con establecimiento nuevo y su cliente", async () => {
    await asAlice(async () => {
      const [{ id: resultId }] = await q<{ id: string }>("select id from prospecting_results where code = 'interested'");
      const [{ register_prospecting: id }] = await q<{ register_prospecting: string }>(
        "select register_prospecting($1::jsonb)",
        [
          JSON.stringify({
            client_request_id: REQ(1),
            establishment_name: "Peluquería Nueva",
            city: "Huesca",
            result_id: resultId,
            new_customer_status: "interested",
            follow_up_date: "2026-11-02",
            next_action: "Llevar catálogo",
          }),
        ],
      );
      const [act] = await q<{ customer_id: string; city: string; establishment_name: string }>(
        "select * from prospecting_activities where id = $1",
        [id],
      );
      expect(act.establishment_name).toBe("Peluquería Nueva");
      const [cust] = await q<{ status: string; city: string; next_follow_up_date: string }>(
        "select status, city, next_follow_up_date::text from customers where id = $1",
        [act.customer_id],
      );
      expect(cust).toMatchObject({ status: "interested", city: "Huesca", next_follow_up_date: "2026-11-02" });
      const fus = await q("select * from follow_ups where source_activity_id = $1", [id]);
      expect(fus).toHaveLength(1);
    });
  });

  it("es idempotente ante reenvíos del mismo formulario", async () => {
    await asAlice(async () => {
      const payload = JSON.stringify({ client_request_id: REQ(2), establishment_name: "Reintento", city: "Teruel" });
      const [a] = await q<{ register_prospecting: string }>("select register_prospecting($1::jsonb)", [payload]);
      const [b] = await q<{ register_prospecting: string }>("select register_prospecting($1::jsonb)", [payload]);
      expect(a.register_prospecting).toBe(b.register_prospecting);
      expect(await q("select * from prospecting_activities where client_request_id = $1", [REQ(2)])).toHaveLength(1);
      expect(await q("select * from customers where trade_name = 'Reintento'")).toHaveLength(1);
    });
  });

  it("registra actividades provisionales sin inventar el establecimiento", async () => {
    await asAlice(async () => {
      const [{ register_prospecting: id }] = await q<{ register_prospecting: string }>(
        "select register_prospecting($1::jsonb)",
        [JSON.stringify({ client_request_id: REQ(3), is_provisional: true })],
      );
      const [act] = await q<{ customer_id: string | null; establishment_name: string | null; is_provisional: boolean }>(
        "select * from prospecting_activities where id = $1",
        [id],
      );
      expect(act).toMatchObject({ customer_id: null, establishment_name: null, is_provisional: true });
    });
  });

  it("no acepta actividades no provisionales sin identificar", async () => {
    await expect(asAlice(() => q("insert into prospecting_activities(is_provisional) values (false)"))).rejects.toThrow(
      /prospecting_identified/,
    );
  });

  it("asocia varias actividades al mismo cliente y permite editar", async () => {
    await asAlice(async () => {
      const cid = await newCustomer("Estética Repetida");
      for (const n of [10, 11, 12]) {
        await q("select register_prospecting($1::jsonb)", [JSON.stringify({ client_request_id: REQ(n), customer_id: cid })]);
      }
      const acts = await q<{ id: string; establishment_name: string }>(
        "select * from prospecting_activities where customer_id = $1 order by occurred_at",
        [cid],
      );
      expect(acts).toHaveLength(3);
      expect(acts[0].establishment_name).toBe("Estética Repetida");
      await q("update prospecting_activities set notes = 'editada' where id = $1", [acts[0].id]);
      const [e] = await q<{ notes: string }>("select notes from prospecting_activities where id = $1", [acts[0].id]);
      expect(e.notes).toBe("editada");
    });
  });
});

describe("clientes", () => {
  it("registra el historial de cambios de estado y la fecha de alta", async () => {
    await asAlice(async () => {
      const id = await newCustomer("Historial SL", "prospect_uncontacted");
      await q("update customers set status = 'interested' where id = $1", [id]);
      await q("update customers set status = 'customer_new' where id = $1", [id]);
      await q("update customers set phone = '600000000' where id = $1", [id]); // no es cambio de estado
      const h = await q<{ from_status: string | null; to_status: string }>(
        "select from_status, to_status from customer_status_history where customer_id = $1 order by changed_at, to_status",
        [id],
      );
      expect(h.map((r) => r.to_status)).toEqual(["prospect_uncontacted", "interested", "customer_new"]);
      const [c] = await q<{ customer_since_date: string | null; first_contact_date: string | null }>(
        "select customer_since_date, first_contact_date from customers where id = $1",
        [id],
      );
      expect(c.customer_since_date).not.toBeNull();
      expect(c.first_contact_date).not.toBeNull();
    });
  });

  it("el historial no se puede modificar por el usuario", async () => {
    await asAlice(async () => {
      const before = await q("select * from customer_status_history");
      await q("update customer_status_history set to_status = 'x'");
      await q("delete from customer_status_history");
      expect(await q("select * from customer_status_history where to_status = 'x'")).toHaveLength(0);
      expect((await q("select * from customer_status_history")).length).toBe(before.length);
    });
  });

  it("fusiona duplicados conservando actividades y pedidos", async () => {
    await asAlice(async () => {
      const keep = await newCustomer("Farmacia Centro");
      const dup = await newCustomer("FARMACIA CENTRO");
      await q("update customers set phone = '611111111' where id = $1", [dup]);
      await q("select register_prospecting($1::jsonb)", [JSON.stringify({ client_request_id: REQ(20), customer_id: dup })]);
      await q("select save_order($1::jsonb, $2::jsonb)", [
        JSON.stringify({ customer_id: dup, order_date: "2026-10-01", status: "confirmed" }),
        JSON.stringify([{ description: "Cera", quantity: 1, unit_price_cents: 1000, vat_rate_bp: 2100 }]),
      ]);
      await q("select merge_customers($1, $2)", [keep, dup]);
      expect(await q("select * from prospecting_activities where customer_id = $1", [keep])).toHaveLength(1);
      expect(await q("select * from orders where customer_id = $1", [keep])).toHaveLength(1);
      const [k] = await q<{ phone: string }>("select phone from customers where id = $1", [keep]);
      expect(k.phone).toBe("611111111");
      const [d] = await q<{ merged_into_id: string; archived_at: string | null }>("select * from customers where id = $1", [dup]);
      expect(d.merged_into_id).toBe(keep);
      expect(d.archived_at).not.toBeNull();
    });
  });
});

describe("calendario y visitas", () => {
  async function newEvent(customerId: string, type = "prospect_visit") {
    const [e] = await q<{ id: string }>(
      "insert into calendar_events(title, event_type, customer_id, starts_at) values ('Visita', $1, $2, '2026-10-05T09:00:00Z') returning id",
      [type, customerId],
    );
    return e.id;
  }

  it("una visita programada no cuenta hasta marcarla como realizada", async () => {
    await asAlice(async () => {
      const cid = await newCustomer("Salón Agenda");
      const ev = await newEvent(cid);
      expect(await q("select * from visits where calendar_event_id = $1", [ev])).toHaveLength(0);
      await q("select set_event_status($1, 'done')", [ev]);
      const v = await q<{ visit_kind: string; is_commercial: boolean }>("select * from visits where calendar_event_id = $1", [ev]);
      expect(v).toHaveLength(1);
      expect(v[0]).toMatchObject({ visit_kind: "prospect", is_commercial: true });
    });
  });

  it("no contabiliza dos veces aunque se cambie el estado varias veces", async () => {
    await asAlice(async () => {
      const cid = await newCustomer("Cliente Vaivén", "customer_active");
      const ev = await newEvent(cid, "customer_visit");
      await q("select set_event_status($1, 'done')", [ev]);
      await q("select set_event_status($1, 'done')", [ev]);
      await q("select set_event_status($1, 'not_done')", [ev]);
      expect(await q("select * from visits where calendar_event_id = $1 and deleted_at is null", [ev])).toHaveLength(0);
      await q("select set_event_status($1, 'done')", [ev]);
      const all = await q<{ deleted_at: string | null }>("select * from visits where calendar_event_id = $1", [ev]);
      expect(all).toHaveLength(1);
      expect(all[0].deleted_at).toBeNull();
    });
  });

  it("cancela y reprograma conservando el original", async () => {
    await asAlice(async () => {
      const cid = await newCustomer("Reprogramada");
      const ev = await newEvent(cid);
      await q("select set_event_status($1, 'cancelled')", [ev]);
      const [c] = await q<{ status: string }>("select status from calendar_events where id = $1", [ev]);
      expect(c.status).toBe("cancelled");
      const [{ reschedule_event: newId }] = await q<{ reschedule_event: string }>(
        "select reschedule_event($1, '2026-10-08T10:00:00Z', '2026-10-08T11:00:00Z')",
        [ev],
      );
      const [orig] = await q<{ status: string; rescheduled_to_id: string }>("select * from calendar_events where id = $1", [ev]);
      expect(orig).toMatchObject({ status: "rescheduled", rescheduled_to_id: newId });
      const [n] = await q<{ status: string }>("select status from calendar_events where id = $1", [newId]);
      expect(n.status).toBe("scheduled");
    });
  });

  it("los eventos de reposición generan visitas no comerciales", async () => {
    await asAlice(async () => {
      const cid = await newCustomer("Reposición", "customer_active");
      const ev = await newEvent(cid, "restock");
      await q("select set_event_status($1, 'done')", [ev]);
      const [v] = await q<{ is_commercial: boolean; visit_kind: string }>("select * from visits where calendar_event_id = $1", [ev]);
      expect(v).toMatchObject({ is_commercial: false, visit_kind: "customer" });
    });
  });
});

describe("pedidos y devoluciones", () => {
  it("calcula los importes en SQL igual que en TypeScript", async () => {
    const cases: [string, number, number, number][] = [];
    let seed = 7;
    const rnd = (n: number) => (seed = (seed * 16807) % 2147483647) % n;
    for (let i = 0; i < 300; i++) {
      cases.push([`${1 + rnd(50)}.${String(rnd(1000)).padStart(3, "0")}`, rnd(100000), rnd(5001), [0, 400, 1000, 2100][rnd(4)]]);
    }
    for (const [qty, price, disc, vat] of cases) {
      const [sql] = await q<{ base_cents: string; vat_cents: string; total_cents: string }>(
        "select * from order_line_amounts($1::numeric, $2::bigint, $3::int, $4::int)",
        [qty, price, disc, vat],
      );
      const ts = computeLine({ quantity: qty, unitPriceCents: price, discountBp: disc, vatRateBp: vat });
      expect([Number(sql.base_cents), Number(sql.vat_cents), Number(sql.total_cents)]).toEqual([ts.baseCents, ts.vatCents, ts.totalCents]);
    }
  });

  it("guarda pedido y líneas de forma atómica, idempotente y con instantánea de precio", async () => {
    await asAlice(async () => {
      const cid = await newCustomer("Tienda Pedidos", "customer_active");
      const [{ id: productId }] = await q<{ id: string }>(
        "insert into products(name, price_cents, vat_rate_bp) values ('Crema', 1500, 2100) returning id",
      );
      const order = JSON.stringify({ client_request_id: REQ(30), customer_id: cid, order_date: "2026-10-10", status: "confirmed" });
      const items = JSON.stringify([
        { product_id: productId, description: "Crema", quantity: 2, unit_price_cents: 1500, discount_bp: 1000, vat_rate_bp: 2100 },
        { description: "Cera", quantity: 1, unit_price_cents: 1000, vat_rate_bp: 1000 },
      ]);
      const [{ save_order: id1 }] = await q<{ save_order: string }>("select save_order($1::jsonb, $2::jsonb)", [order, items]);
      const [{ save_order: id2 }] = await q<{ save_order: string }>("select save_order($1::jsonb, $2::jsonb)", [order, items]);
      expect(id1).toBe(id2);
      const [t] = await q<{ base_cents: string; vat_cents: string; total_cents: string }>("select * from order_totals where order_id = $1", [id1]);
      expect([Number(t.base_cents), Number(t.vat_cents), Number(t.total_cents)]).toEqual([2700 + 1000, 567 + 100, 3700 + 667]);

      // Cambiar el precio del catálogo no altera el pedido histórico
      await q("update products set price_cents = 9999 where id = $1", [productId]);
      const [line] = await q<{ unit_price_cents: string }>("select unit_price_cents from order_items where order_id = $1 and product_id = $2", [id1, productId]);
      expect(Number(line.unit_price_cents)).toBe(1500);

      // Rechaza pedidos sin líneas sin crear nada
      await expect(
        q("select save_order($1::jsonb, '[]'::jsonb)", [JSON.stringify({ customer_id: cid, order_date: "2026-10-10" })]),
      ).rejects.toThrow(/al menos una línea/);
    });
  });

  it("la base de datos rechaza líneas con importes incoherentes", async () => {
    await asAlice(async () => {
      const cid = await newCustomer("Incoherente", "customer_active");
      const [o] = await q<{ id: string }>("insert into orders(customer_id, order_date) values ($1, '2026-10-01') returning id", [cid]);
      await expect(
        q(
          `insert into order_items(order_id, description, quantity, unit_price_cents, vat_rate_bp, base_cents, vat_cents, total_cents)
           values ($1, 'x', 1, 1000, 2100, 999, 210, 1209)`,
          [o.id],
        ),
      ).rejects.toThrow(/check constraint/);
    });
  });

  it("registra devoluciones parciales y totales sin borrar el historial", async () => {
    await asAlice(async () => {
      const cid = await newCustomer("Devoluciones", "customer_active");
      const [{ save_order: id }] = await q<{ save_order: string }>("select save_order($1::jsonb, $2::jsonb)", [
        JSON.stringify({ customer_id: cid, order_date: "2026-10-01", status: "delivered" }),
        JSON.stringify([{ description: "Lote", quantity: 1, unit_price_cents: 10000, vat_rate_bp: 2100 }]),
      ]);
      await q("select register_return($1, '2026-10-05', 4000, 'Defecto', $2)", [id, REQ(40)]);
      await q("select register_return($1, '2026-10-05', 4000, 'Defecto', $2)", [id, REQ(40)]); // reintento
      let [o] = await q<{ status: string }>("select status from orders where id = $1", [id]);
      expect(o.status).toBe("partially_returned");
      const rets = await q<{ vat_cents: string }>("select * from order_returns where order_id = $1", [id]);
      expect(rets).toHaveLength(1);
      expect(Number(rets[0].vat_cents)).toBe(840);
      await expect(q("select register_return($1, '2026-10-06', 7000, null)", [id])).rejects.toThrow(/supera/);
      await q("select register_return($1, '2026-10-06', 6000, null)", [id]);
      [o] = await q<{ status: string }>("select status from orders where id = $1", [id]);
      expect(o.status).toBe("fully_returned");
      const hist = await q<{ to_status: string }>("select to_status from order_status_history where order_id = $1 order by changed_at", [id]);
      expect(hist.map((h) => h.to_status)).toEqual(["delivered", "partially_returned", "fully_returned"]);
      const [t] = await q<{ base_cents: string }>("select base_cents from order_totals where order_id = $1", [id]);
      expect(Number(t.base_cents)).toBe(10000); // la venta original se conserva
    });
  });

  it("no permite devolver pedidos cancelados", async () => {
    await asAlice(async () => {
      const cid = await newCustomer("Cancelado", "customer_active");
      const [{ save_order: id }] = await q<{ save_order: string }>("select save_order($1::jsonb, $2::jsonb)", [
        JSON.stringify({ customer_id: cid, order_date: "2026-10-01", status: "cancelled" }),
        JSON.stringify([{ description: "X", quantity: 1, unit_price_cents: 1000, vat_rate_bp: 2100 }]),
      ]);
      await expect(q("select register_return($1, '2026-10-05', 100, null)", [id])).rejects.toThrow(/cancelado/);
    });
  });
});

describe("datos de demostración", () => {
  it("se borran sin tocar los datos reales", async () => {
    await asAlice(async () => {
      const real = (await q("select * from customers")).length;
      await q("insert into customers(trade_name, is_demo) values ('[DEMO] Uno', true), ('[DEMO] Dos', true)");
      const [{ delete_demo_data: n }] = await q<{ delete_demo_data: number }>("select delete_demo_data()");
      expect(n).toBe(2);
      expect((await q("select * from customers")).length).toBe(real);
    });
  });
});
