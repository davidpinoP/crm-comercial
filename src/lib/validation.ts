/** Esquemas Zod compartidos entre formularios (cliente) y acciones (servidor). */
import { z } from "zod";
import { parseEurosToCents, parsePercentToBp } from "./domain/money";
import { CUSTOMER_STATUSES, EVENT_STATUSES, EVENT_TYPES, FOLLOW_UP_TYPES } from "./types";
import { ORDER_STATUSES } from "./domain/revenue";
import { GOAL_METRICS } from "./domain/goals";

/** Texto opcional: "" → null */
export const optText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const reqText = (label: string, max = 160) =>
  z.string({ required_error: `${label} es obligatorio.` }).trim().min(1, `${label} es obligatorio.`).max(max, `Máximo ${max} caracteres.`);

export const optUuid = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .pipe(z.string().uuid("Identificador no válido.").nullable());

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida.");
export const optIsoDate = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .pipe(isoDate.nullable());

export const requestId = z.string().uuid();

/** Importe en euros introducido como texto → céntimos */
export const eurosToCents = (label: string, { allowZero = true } = {}) =>
  z.union([z.string(), z.number()]).transform((v, ctx) => {
    const c = parseEurosToCents(v);
    if (c == null || c < 0 || (!allowZero && c === 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label}: importe no válido.` });
      return z.NEVER;
    }
    return c;
  });

export const optEurosToCents = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (v == null || v === "") return null;
    const c = parseEurosToCents(v);
    if (c == null || c < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Importe no válido." });
      return z.NEVER;
    }
    return c;
  });

export const percentToBp = (label: string) =>
  z.union([z.string(), z.number()]).transform((v, ctx) => {
    const bp = v === "" ? 0 : parsePercentToBp(v);
    if (bp == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label}: porcentaje entre 0 y 100.` });
      return z.NEVER;
    }
    return bp;
  });

export const customerSchema = z.object({
  trade_name: reqText("El nombre comercial"),
  legal_name: optText(160),
  establishment_type_id: optUuid,
  contact_name: optText(120),
  phone: optText(40),
  email: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .pipe(z.string().email("Correo electrónico no válido.").nullable()),
  address: optText(200),
  city: optText(120),
  province: optText(80),
  postal_code: optText(10),
  zone_id: optUuid,
  status: z.enum(CUSTOMER_STATUSES),
  next_action: optText(300),
  next_follow_up_date: optIsoDate,
  competitor_brands: optText(300),
  products_of_interest: optText(300),
  estimated_potential_cents: optEurosToCents,
  estimated_purchase_frequency: optText(80),
  notes: optText(4000),
});
export type CustomerInput = z.input<typeof customerSchema>;

export const prospectingSchema = z
  .object({
    client_request_id: requestId,
    customer_id: optUuid,
    establishment_name: optText(160),
    city: optText(120),
    establishment_type_id: optUuid,
    contact_name: optText(120),
    result_id: optUuid,
    notes: optText(2000),
    next_action: optText(300),
    follow_up_date: optIsoDate,
    is_provisional: z.boolean().default(false),
    new_customer_status: z.enum(CUSTOMER_STATUSES).optional().nullable(),
  })
  .refine((v) => v.is_provisional || v.customer_id || v.establishment_name, {
    message: "Indica el establecimiento o regístralo como provisional.",
    path: ["establishment_name"],
  });
export type ProspectingInput = z.input<typeof prospectingSchema>;

export const activityUpdateSchema = z
  .object({
    id: z.string().uuid(),
    customer_id: optUuid,
    establishment_name: optText(160),
    city: optText(120),
    establishment_type_id: optUuid,
    contact_name: optText(120),
    result_id: optUuid,
    notes: optText(2000),
    next_action: optText(300),
    follow_up_date: optIsoDate,
    occurred_at: z.string().datetime({ offset: true }),
    create_customer: z.boolean().default(false),
  })
  .refine((v) => v.customer_id || v.establishment_name, {
    message: "Para completar la actividad indica el establecimiento.",
    path: ["establishment_name"],
  });

export const eventSchema = z
  .object({
    client_request_id: requestId.optional(),
    title: reqText("El título"),
    event_type: z.enum(EVENT_TYPES),
    customer_id: optUuid,
    date: isoDate,
    start_time: z.string().regex(/^\d{2}:\d{2}$/, "Hora no válida."),
    end_time: z
      .string()
      .optional()
      .nullable()
      .transform((v) => (v ? v : null))
      .pipe(z.string().regex(/^\d{2}:\d{2}$/, "Hora no válida.").nullable()),
    city: optText(120),
    address: optText(200),
    zone_id: optUuid,
    notes: optText(2000),
    reminder_minutes: z.coerce.number().int().min(0).max(10080).optional().nullable(),
  })
  .refine((v) => !v.end_time || v.end_time >= v.start_time, { message: "La hora de fin es anterior al inicio.", path: ["end_time"] });
export type EventInput = z.input<typeof eventSchema>;

export const eventStatusSchema = z.enum(EVENT_STATUSES);

export const followUpSchema = z.object({
  client_request_id: requestId.optional(),
  customer_id: z.string().uuid("Elige un cliente o prospecto."),
  follow_up_type: z.enum(FOLLOW_UP_TYPES),
  due_date: optIsoDate,
  reason: optText(300),
  notes: optText(2000),
});
export type FollowUpInput = z.input<typeof followUpSchema>;

export const orderLineSchema = z.object({
  product_id: optUuid,
  category_id: optUuid,
  description: reqText("La descripción", 200),
  quantity: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).replace(",", ".").trim())
    .refine((v) => /^\d+(\.\d{1,3})?$/.test(v) && Number(v) > 0, "Cantidad no válida (máx. 3 decimales)."),
  unit_price: eurosToCents("Precio"),
  discount: percentToBp("Descuento"),
  vat: percentToBp("IVA"),
});

export const orderSchema = z.object({
  id: optUuid,
  client_request_id: requestId.optional(),
  customer_id: z.string().uuid("Elige un cliente."),
  order_date: isoDate,
  order_number: optText(40),
  status: z.enum(ORDER_STATUSES),
  notes: optText(2000),
  delivery_date: optIsoDate,
  paid_date: optIsoDate,
  visit_id: optUuid,
  items: z.array(orderLineSchema).min(1, "Añade al menos una línea."),
});
export type OrderInput = z.input<typeof orderSchema>;

export const productSchema = z.object({
  id: optUuid,
  name: reqText("El nombre"),
  reference: optText(60),
  category_id: optUuid,
  price: eurosToCents("Precio"),
  vat: percentToBp("IVA"),
  active: z.boolean().default(true),
});

export const goalSchema = z.object({
  period_type: z.enum(["day", "week", "month"]),
  period_start: optIsoDate,
  metric: z.enum(GOAL_METRICS),
  target: z.union([z.string(), z.number()]),
});

export const zoneSchema = z.object({
  id: optUuid,
  name: reqText("El nombre"),
  description: optText(500),
  color: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .pipe(z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color no válido.").nullable()),
  daily_prospecting_target: z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v) => (v === "" || v == null ? null : Number(v)))
    .pipe(z.number().int("Debe ser un número entero.").min(0).nullable()),
  notes: optText(1000),
  populations: z.array(z.string().trim().min(1).max(120)).default([]),
});
