"use server";
import { getContext } from "@/lib/data/context";
import { zonesForDays } from "@/lib/data/zones";
import { isoDate } from "@/lib/validation";
import { addDaysISO, daysBetweenInclusive, startOfMadridDay } from "@/lib/domain/dates";
import type { CalendarEvent, FollowUp } from "@/lib/types";

export interface CalendarPayload {
  events: (CalendarEvent & { customer: { id: string; trade_name: string; city: string | null; status: string } | null })[];
  followUps: (FollowUp & { customer: { id: string; trade_name: string } | null })[];
  zones: { date: string; zone: { id: string; name: string; color: string | null; target: number | null } | null }[];
}

/** Datos del calendario para el rango visible (fechas en Madrid, fin incluido) */
export async function getCalendarRange(from: string, to: string): Promise<CalendarPayload> {
  const f = isoDate.parse(from);
  const t = isoDate.parse(to);
  if (daysBetweenInclusive(f, t) > 62) throw new Error("Rango demasiado amplio.");
  const ctx = await getContext();
  const [ev, fu, zones] = await Promise.all([
    ctx.supabase
      .from("calendar_events")
      .select("*, customer:customers(id, trade_name, city, status)")
      .is("deleted_at", null)
      .gte("starts_at", startOfMadridDay(f).toISOString())
      .lt("starts_at", startOfMadridDay(addDaysISO(t, 1)).toISOString())
      .order("starts_at"),
    ctx.supabase
      .from("follow_ups")
      .select("*, customer:customers(id, trade_name)")
      .eq("status", "pending")
      .gte("due_date", f)
      .lte("due_date", t),
    zonesForDays(ctx, f, t),
  ]);
  if (ev.error) throw new Error(ev.error.message);
  if (fu.error) throw new Error(fu.error.message);
  return {
    events: ev.data as CalendarPayload["events"],
    followUps: fu.data as CalendarPayload["followUps"],
    zones: [...zones.entries()].map(([date, z]) => ({
      date,
      zone: z ? { id: z.id, name: z.name, color: z.color, target: z.daily_prospecting_target } : null,
    })),
  };
}
