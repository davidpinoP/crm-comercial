/** Tipos de filas de la base de datos (ver supabase/migrations). Importes en céntimos. */
import type { ISODate } from "./domain/dates";
import type { OrderStatus } from "./domain/revenue";

export const CUSTOMER_STATUSES = [
  "prospect_uncontacted",
  "prospect_contacted",
  "interested",
  "follow_up_pending",
  "visit_scheduled",
  "customer_new",
  "customer_active",
  "customer_inactive",
  "customer_lost",
] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const EVENT_TYPES = [
  "cold_call",
  "customer_visit",
  "prospect_visit",
  "phone_follow_up",
  "meeting",
  "restock",
  "route",
  "other",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_STATUSES = ["scheduled", "done", "cancelled", "rescheduled", "not_done"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const FOLLOW_UP_TYPES = ["call", "visit", "email", "catalog_presentation", "restock", "win_back", "other"] as const;
export type FollowUpType = (typeof FOLLOW_UP_TYPES)[number];

export interface AppSettings {
  user_id: string;
  inactivity_days: number;
  cohort_maturity_days: number;
  countable_order_statuses: OrderStatus[];
  working_weekdays: number[];
  default_work_hours: number;
  work_start_time: string;
  work_end_time: string;
  close_rate_include_followups: boolean;
  theme: "system" | "light" | "dark";
}

export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  company: string | null;
}

export interface EstablishmentType {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
}

export interface ProspectingResult {
  id: string;
  code: string;
  name: string;
  is_effective_contact: boolean;
  is_interest: boolean;
  is_rejection: boolean;
  sort_order: number;
  active: boolean;
}

export interface ProductCategory {
  id: string;
  name: string;
  sort_order: number;
}

export interface Zone {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  daily_prospecting_target: number | null;
  notes: string | null;
  is_demo: boolean;
  archived_at: string | null;
  zone_populations?: { id: string; population: string }[];
}

export interface Customer {
  id: string;
  trade_name: string;
  legal_name: string | null;
  establishment_type_id: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  zone_id: string | null;
  status: CustomerStatus;
  first_contact_date: ISODate | null;
  customer_since_date: ISODate | null;
  next_action: string | null;
  next_follow_up_date: ISODate | null;
  competitor_brands: string | null;
  products_of_interest: string | null;
  estimated_potential_cents: number | null;
  estimated_purchase_frequency: string | null;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  merged_into_id: string | null;
  is_demo: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProspectingActivity {
  id: string;
  occurred_at: string;
  customer_id: string | null;
  establishment_name: string | null;
  city: string | null;
  establishment_type_id: string | null;
  contact_name: string | null;
  result_id: string | null;
  notes: string | null;
  next_action: string | null;
  follow_up_date: ISODate | null;
  is_provisional: boolean;
  is_demo: boolean;
  deleted_at: string | null;
  created_at: string;
}

export interface Visit {
  id: string;
  customer_id: string;
  occurred_at: string;
  visit_kind: "prospect" | "customer";
  is_commercial: boolean;
  calendar_event_id: string | null;
  prospecting_activity_id: string | null;
  outcome_result_id: string | null;
  notes: string | null;
  is_demo: boolean;
  deleted_at: string | null;
}

export interface CalendarEvent {
  id: string;
  title: string;
  event_type: EventType;
  customer_id: string | null;
  starts_at: string;
  ends_at: string | null;
  city: string | null;
  address: string | null;
  zone_id: string | null;
  notes: string | null;
  status: EventStatus;
  reminder_minutes: number | null;
  rescheduled_to_id: string | null;
  is_demo: boolean;
  deleted_at: string | null;
}

export interface FollowUp {
  id: string;
  customer_id: string;
  follow_up_type: FollowUpType;
  due_date: ISODate | null;
  reason: string | null;
  notes: string | null;
  status: "pending" | "done" | "cancelled";
  completed_at: string | null;
  result: string | null;
  next_action: string | null;
  source_activity_id: string | null;
  previous_follow_up_id: string | null;
  is_demo: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  reference: string | null;
  category_id: string | null;
  price_cents: number;
  vat_rate_bp: number;
  active: boolean;
  is_demo: boolean;
}

export interface Order {
  id: string;
  customer_id: string;
  order_date: ISODate;
  order_number: string | null;
  status: OrderStatus;
  notes: string | null;
  delivery_date: ISODate | null;
  paid_date: ISODate | null;
  visit_id: string | null;
  is_demo: boolean;
  deleted_at: string | null;
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  description: string;
  category_id: string | null;
  quantity: number;
  unit_price_cents: number;
  discount_bp: number;
  vat_rate_bp: number;
  base_cents: number;
  vat_cents: number;
  total_cents: number;
  position: number;
}

export interface OrderReturn {
  id: string;
  order_id: string;
  return_date: ISODate;
  reason: string | null;
  base_cents: number;
  vat_cents: number;
  total_cents: number;
}

export interface CommissionSettings {
  method: "flat" | "marginal";
  method_confirmed: boolean;
  base_type: "net" | "gross";
}

export interface CommissionTierRow {
  id: string;
  lower_cents: number;
  lower_inclusive: boolean;
  rate_bp: number;
}

export interface CommissionCalculation {
  id: string;
  period_month: ISODate;
  gross_sales_cents: number;
  returns_cents: number;
  base_cents: number;
  method: "flat" | "marginal";
  base_type: "net" | "gross";
  tier_label: string;
  rate_bp: number;
  amount_cents: number;
  order_ids: string[];
  tiers_snapshot: unknown;
  is_provisional: boolean;
  calculated_at: string;
  settled_at: string | null;
  settled_amount_cents: number | null;
  settlement_note: string | null;
}

export interface SalesGoal {
  id: string;
  period_type: "day" | "week" | "month";
  period_start: ISODate | null;
  metric: import("./domain/goals").GoalMetric;
  target_value: number;
}

export interface WorkdayRow {
  date: ISODate;
  kind: "work" | "vacation" | "holiday" | "off";
  hours_worked: number | null;
  note: string | null;
}

/** Resultado uniforme de las acciones de servidor */
export type ActionResult<T = undefined> = { ok: true; data: T; message?: string } | { ok: false; error: string };
