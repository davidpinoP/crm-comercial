"use client";
import { Badge } from "@/components/ui/badge";
import { CUSTOMER_STATUS_LABEL, CUSTOMER_STATUS_TONE } from "@/lib/labels";
import { CUSTOMER_STATUSES, type CustomerStatus } from "@/lib/types";
import { setCustomerStatus } from "@/lib/actions/customers";
import { useAction } from "./use-action";
import { cn } from "@/lib/utils";

export function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  return <Badge tone={CUSTOMER_STATUS_TONE[status]}>{CUSTOMER_STATUS_LABEL[status]}</Badge>;
}

const toneText = { neutral: "text-ink-muted", progress: "text-progress", positive: "text-positive", warning: "text-warning", negative: "text-negative" };
const toneBg = { neutral: "bg-sunken", progress: "bg-progress-soft", positive: "bg-positive-soft", warning: "bg-warning-soft", negative: "bg-negative-soft" };

/** Cambio de estado directamente desde listados y fichas (queda en el historial) */
export function CustomerStatusSelect({ id, status, className }: { id: string; status: CustomerStatus; className?: string }) {
  const { run, pending } = useAction();
  const tone = CUSTOMER_STATUS_TONE[status];
  return (
    <select
      aria-label="Estado comercial"
      value={status}
      disabled={pending}
      onChange={(e) => run(setCustomerStatus(id, e.target.value))}
      className={cn(
        "h-7 max-w-full cursor-pointer appearance-none rounded-full border-0 px-2.5 text-[12px] font-medium focus:outline-2 disabled:opacity-60",
        toneBg[tone],
        toneText[tone],
        className,
      )}
    >
      {CUSTOMER_STATUSES.map((s) => (
        <option key={s} value={s}>
          {CUSTOMER_STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}
