import "server-only";
import type { AppContext } from "./context";
import type { SalesGoal } from "@/lib/types";
import type { GoalMetric } from "@/lib/domain/goals";
import type { ISODate } from "@/lib/domain/dates";

export async function loadGoals(ctx: AppContext): Promise<SalesGoal[]> {
  const { data, error } = await ctx.supabase.from("sales_goals").select("*");
  if (error) throw new Error(`No se han podido cargar los objetivos: ${error.message}`);
  return (data as SalesGoal[]).map((g) => ({ ...g, target_value: Number(g.target_value) }));
}

/** Objetivo específico del periodo o, si no existe, el objetivo por defecto de ese tipo de periodo */
export function resolveGoal(goals: SalesGoal[], type: SalesGoal["period_type"], start: ISODate, metric: GoalMetric): SalesGoal | null {
  return (
    goals.find((g) => g.period_type === type && g.metric === metric && g.period_start === start) ??
    goals.find((g) => g.period_type === type && g.metric === metric && g.period_start == null) ??
    null
  );
}
