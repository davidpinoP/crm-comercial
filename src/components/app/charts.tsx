"use client";
/**
 * Gráficos: marcas finas, una sola escala, ejes discretos, tooltip en todas las vistas.
 * Paleta categórica validada (CVD) en globals.css: --chart-1…4, siempre en ese orden.
 */
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";
import { formatEURCompact, formatEUR } from "@/lib/domain/money";
import { formatNumber } from "@/lib/domain/metrics";

type Fmt = "number" | "eur" | "pct";
const fmtValue = (v: number, f: Fmt) => (f === "eur" ? formatEUR(v) : f === "pct" ? `${formatNumber(v, 1)} %` : formatNumber(v, 1));
const fmtAxis = (v: number, f: Fmt) => (f === "eur" ? formatEURCompact(v) : f === "pct" ? `${formatNumber(v, 0)} %` : formatNumber(v, 0));

const axis = { stroke: "var(--ink-faint)", fontSize: 11, tickLine: false, axisLine: false } as const;

function TooltipBox({ active, payload, label, format }: { active?: boolean; payload?: { name: string; value: number | null; color: string }[]; label?: string; format: Fmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-paper px-3 py-2 text-[12px] shadow-pop">
      <p className="mb-1 font-medium text-ink">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-ink-muted">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          {payload.length > 1 && <span>{p.name}:</span>}
          <span className="num font-medium text-ink">{p.value == null ? "Datos insuficientes" : fmtValue(p.value, format)}</span>
        </p>
      ))}
    </div>
  );
}

export interface Series {
  key: string;
  name: string;
}

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

export function BarSeriesChart({
  data,
  xKey,
  series,
  format = "number",
  height = 220,
  target,
}: {
  data: Record<string, string | number | null>[];
  xKey: string;
  series: Series[];
  format?: Fmt;
  height?: number;
  target?: number | null;
}) {
  return (
    <div style={{ height }} role="img" aria-label={series.map((s) => s.name).join(", ")}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={2} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey={xKey} {...axis} interval="preserveStartEnd" minTickGap={8} />
          <YAxis {...axis} width={format === "eur" ? 56 : 32} tickFormatter={(v) => fmtAxis(v, format)} allowDecimals={false} />
          <Tooltip cursor={{ fill: "var(--sunken)" }} content={<TooltipBox format={format} />} />
          {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--ink-muted)" }} />}
          {target != null && target > 0 && <ReferenceLine y={target} stroke="var(--ink-muted)" strokeDasharray="4 4" label={{ value: "Objetivo", position: "insideTopRight", fontSize: 11, fill: "var(--ink-muted)" }} />}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={COLORS[i]} radius={[4, 4, 0, 0]} maxBarSize={28} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LineSeriesChart({
  data,
  xKey,
  series,
  format = "number",
  height = 220,
}: {
  data: Record<string, string | number | null>[];
  xKey: string;
  series: Series[];
  format?: Fmt;
  height?: number;
}) {
  return (
    <div style={{ height }} role="img" aria-label={series.map((s) => s.name).join(", ")}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey={xKey} {...axis} interval="preserveStartEnd" minTickGap={8} />
          <YAxis {...axis} width={format === "eur" ? 56 : 36} tickFormatter={(v) => fmtAxis(v, format)} />
          <Tooltip cursor={{ stroke: "var(--line-strong)" }} content={<TooltipBox format={format} />} />
          {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--ink-muted)" }} />}
          {series.map((s, i) => (
            <Line
              key={s.key}
              dataKey={s.key}
              name={s.name}
              stroke={COLORS[i]}
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 0, fill: COLORS[i] }}
              activeDot={{ r: 5, stroke: "var(--paper)", strokeWidth: 2 }}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
