"use client";
import { useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { useAction } from "@/components/app/use-action";
import { deleteGoal, saveGoal, setWorkday } from "@/lib/actions/settings";
import { PERIOD_TYPE_LABEL, WEEKDAY_SHORT } from "@/lib/labels";
import type { SalesGoal } from "@/lib/types";
import { cn } from "@/lib/utils";

type PeriodType = "day" | "week" | "month";

export function GoalEditor({
  goals,
  periodStarts,
  metrics,
}: {
  goals: SalesGoal[];
  periodStarts: Record<PeriodType, string>;
  metrics: { key: SalesGoal["metric"]; label: string; monetary: boolean }[];
}) {
  const [type, setType] = useState<PeriodType>("month");
  const [scope, setScope] = useState<"default" | "current">("default");
  const start = scope === "current" ? periodStarts[type] : null;
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <NativeSelect className="h-9 w-auto" value={type} onChange={(e) => setType(e.target.value as PeriodType)} aria-label="Tipo de periodo">
          {(["day", "week", "month"] as const).map((t) => (
            <option key={t} value={t}>
              {PERIOD_TYPE_LABEL[t]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect className="h-9 w-auto" value={scope} onChange={(e) => setScope(e.target.value as "default" | "current")} aria-label="Ámbito">
          <option value="default">Por defecto (todos los periodos)</option>
          <option value="current">Solo el periodo actual</option>
        </NativeSelect>
      </div>
      <ul className="divide-y divide-line">
        {metrics.map((m) => {
          const g = goals.find((x) => x.period_type === type && x.metric === m.key && (x.period_start ?? null) === start);
          return <GoalRow key={`${type}-${scope}-${m.key}-${g?.id ?? "new"}`} metric={m} type={type} start={start} goal={g} />;
        })}
      </ul>
    </div>
  );
}

function GoalRow({ metric, type, start, goal }: { metric: { key: SalesGoal["metric"]; label: string; monetary: boolean }; type: PeriodType; start: string | null; goal?: SalesGoal }) {
  const { run, pending } = useAction();
  const initial = goal ? (metric.monetary ? (goal.target_value / 100).toFixed(2).replace(".", ",") : String(goal.target_value)) : "";
  const [value, setValue] = useState(initial);
  const dirty = value !== initial;
  return (
    <li className="flex items-center gap-3 py-2.5">
      <label htmlFor={`g-${metric.key}`} className="min-w-0 flex-1 text-sm">
        {metric.label}
        {metric.key === "commission" && type !== "month" && <span className="block text-[12px] text-ink-faint">La comisión se calcula por mes natural</span>}
      </label>
      <Input
        id={`g-${metric.key}`}
        inputMode="decimal"
        className="h-9 w-32 text-right"
        placeholder={metric.monetary ? "0,00 €" : "0"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <Button size="sm" variant={dirty ? "dark" : "secondary"} disabled={!dirty || !value} loading={pending} onClick={() => run(saveGoal({ period_type: type, period_start: start, metric: metric.key, target: value }))}>
        Guardar
      </Button>
      {goal ? (
        <button type="button" className="rounded-md p-1.5 text-ink-muted hover:bg-sunken hover:text-negative" aria-label="Eliminar objetivo" onClick={() => run(deleteGoal(goal.id))}>
          <Trash2 className="size-4" />
        </button>
      ) : (
        <span className="w-7" />
      )}
    </li>
  );
}

const KIND_LABEL: Record<string, string> = { default: "Por defecto", work: "Trabajo", vacation: "Vacaciones", holiday: "Festivo", off: "Libre" };
const KIND_STYLE: Record<string, string> = {
  work: "bg-positive-soft text-positive",
  vacation: "bg-progress-soft text-progress",
  holiday: "bg-warning-soft text-warning",
  off: "bg-sunken text-ink-faint",
};

export function WorkCalendarEditor({
  month,
  prevMonth,
  nextMonth,
  label,
  days,
  today,
  defaultHours,
}: {
  month: string;
  prevMonth: string;
  nextMonth: string;
  label: string;
  days: { date: string; kind: string; hours: number | null; isDefaultWork: boolean }[];
  today: string;
  defaultHours: number;
}) {
  const [editing, setEditing] = useState<(typeof days)[number] | null>(null);
  const firstWd = new Date(`${days[0].date}T12:00:00Z`).getUTCDay() || 7;
  void month;
  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <Button asChild size="sm" variant="ghost">
          <Link href={`?mes=${prevMonth}#calendario-laboral`} scroll={false}>
            Anterior
          </Link>
        </Button>
        <p className="font-medium">{label}</p>
        <Button asChild size="sm" variant="ghost">
          <Link href={`?mes=${nextMonth}#calendario-laboral`} scroll={false}>
            Siguiente
          </Link>
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[12px] text-ink-muted">
        {WEEKDAY_SHORT.slice(1).map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
        {Array.from({ length: firstWd - 1 }, (_, i) => (
          <div key={`e${i}`} />
        ))}
        {days.map((d) => {
          const effective = d.kind === "default" ? (d.isDefaultWork ? "work" : "off") : d.kind;
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => setEditing(d)}
              className={cn(
                "flex aspect-square flex-col items-center justify-center rounded-lg text-[13px] transition-colors hover:ring-1 hover:ring-line-strong sm:aspect-auto sm:h-14",
                KIND_STYLE[effective],
                d.kind !== "default" && "font-semibold",
                d.date === today && "ring-1 ring-accent",
              )}
              aria-label={`${d.date}: ${KIND_LABEL[effective]}${d.hours != null ? `, ${d.hours} horas` : ""}`}
            >
              <span className="num">{Number(d.date.slice(8))}</span>
              {d.hours != null && <span className="num hidden text-[10px] sm:block">{String(d.hours).replace(".", ",")} h</span>}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[12px] text-ink-muted">
        {(["work", "vacation", "holiday", "off"] as const).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={cn("size-3 rounded", KIND_STYLE[k])} />
            {KIND_LABEL[k]}
          </span>
        ))}
        <span>Los días en negrita tienen una excepción guardada. Jornada por defecto: {String(defaultHours).replace(".", ",")} h.</span>
      </div>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent title={`Día ${editing.date.split("-").reverse().join("/")}`} size="sm">
            <DayForm day={editing} onDone={() => setEditing(null)} />
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

function DayForm({ day, onDone }: { day: { date: string; kind: string; hours: number | null }; onDone: () => void }) {
  const { run, pending } = useAction();
  const [kind, setKind] = useState(day.kind);
  const [hours, setHours] = useState(day.hours == null ? "" : String(day.hours).replace(".", ","));
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await run(setWorkday({ date: day.date, kind, hours_worked: kind === "work" ? hours : null }));
        if (res.ok) onDone();
      }}
    >
      <Field label="Tipo de día" htmlFor="wd-kind">
        <NativeSelect id="wd-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          {Object.entries(KIND_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {kind === "work" && (
        <Field label="Horas trabajadas" htmlFor="wd-hours" optional hint="Si las registras, se calculan las puertas frías por hora.">
          <Input id="wd-hours" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
        </Field>
      )}
      <Button type="submit" variant="primary" loading={pending}>
        Guardar
      </Button>
    </form>
  );
}
