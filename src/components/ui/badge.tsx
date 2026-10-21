import * as React from "react";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "progress" | "positive" | "warning" | "negative" | "accent";

const tones: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-muted",
  progress: "bg-progress-soft text-progress",
  positive: "bg-positive-soft text-positive",
  warning: "bg-warning-soft text-warning",
  negative: "bg-negative-soft text-negative",
  accent: "bg-accent-soft text-accent",
};

export function Badge({ tone = "neutral", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap", tones[tone], className)}
      {...props}
    />
  );
}
