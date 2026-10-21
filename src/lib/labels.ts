import type { CustomerStatus, EventStatus, EventType, FollowUpType } from "./types";
import type { OrderStatus } from "./domain/revenue";
import type { GoalMetric } from "./domain/goals";

export const CUSTOMER_STATUS_LABEL: Record<CustomerStatus, string> = {
  prospect_uncontacted: "Prospecto sin contactar",
  prospect_contacted: "Prospecto contactado",
  interested: "Interesado",
  follow_up_pending: "Seguimiento pendiente",
  visit_scheduled: "Visita concertada",
  customer_new: "Cliente nuevo",
  customer_active: "Cliente activo",
  customer_inactive: "Cliente inactivo",
  customer_lost: "Cliente perdido",
};

/** Tono visual del estado: prospecto, en curso, cliente, inactivo */
export const CUSTOMER_STATUS_TONE: Record<CustomerStatus, "neutral" | "progress" | "positive" | "warning" | "negative"> = {
  prospect_uncontacted: "neutral",
  prospect_contacted: "neutral",
  interested: "progress",
  follow_up_pending: "progress",
  visit_scheduled: "progress",
  customer_new: "positive",
  customer_active: "positive",
  customer_inactive: "warning",
  customer_lost: "negative",
};

export const isCustomerStatus = (s: CustomerStatus) => s.startsWith("customer_");

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  cold_call: "Puerta fría",
  customer_visit: "Visita a cliente actual",
  prospect_visit: "Visita a prospecto",
  phone_follow_up: "Seguimiento telefónico",
  meeting: "Reunión comercial",
  restock: "Reposición de producto",
  route: "Ruta comercial",
  other: "Otro",
};

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  scheduled: "Programado",
  done: "Realizado",
  cancelled: "Cancelado",
  rescheduled: "Reprogramado",
  not_done: "No realizado",
};

export const FOLLOW_UP_TYPE_LABEL: Record<FollowUpType, string> = {
  call: "Llamada",
  visit: "Visita",
  email: "Correo electrónico",
  catalog_presentation: "Presentación de catálogo",
  restock: "Reposición",
  win_back: "Recuperación de cliente",
  other: "Otro",
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  draft: "Borrador",
  confirmed: "Confirmado",
  delivered: "Entregado",
  invoiced: "Facturado",
  paid: "Cobrado",
  cancelled: "Cancelado",
  partially_returned: "Devuelto parcialmente",
  fully_returned: "Devuelto completamente",
};

export const ORDER_STATUS_TONE: Record<OrderStatus, "neutral" | "progress" | "positive" | "warning" | "negative"> = {
  draft: "neutral",
  confirmed: "progress",
  delivered: "progress",
  invoiced: "positive",
  paid: "positive",
  cancelled: "negative",
  partially_returned: "warning",
  fully_returned: "negative",
};

export const GOAL_METRIC_LABEL: Record<GoalMetric, string> = {
  cold_calls: "Puertas frías",
  effective_contacts: "Contactos efectivos",
  visits: "Visitas realizadas",
  follow_ups_done: "Seguimientos completados",
  new_customers: "Nuevos clientes",
  orders: "Pedidos",
  revenue: "Facturación computable",
  commission: "Comisión",
};

export const WEEKDAY_LABEL = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export const WEEKDAY_SHORT = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export const PERIOD_TYPE_LABEL = { day: "Diario", week: "Semanal", month: "Mensual" } as const;
