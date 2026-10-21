"use client";
import { useState } from "react";
import Link from "next/link";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Badge, type Tone } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from "@/components/ui/dropdown";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Button } from "@/components/ui/button";
import { ActivityEditForm } from "./forms/activity-edit-form";
import { useLookups } from "./lookups";
import { useAction } from "./use-action";
import { deleteActivity } from "@/lib/actions/prospecting";
import { formatDate, madridDateKey, madridTime, relativeDayLabel } from "@/lib/domain/dates";
import type { ProspectingActivity, ProspectingResult } from "@/lib/types";

export type ActivityWithCustomerClient = ProspectingActivity & {
  customer: { id: string; trade_name: string; city: string | null; status?: string } | null;
};

export function resultTone(r: ProspectingResult | undefined): Tone {
  if (!r) return "neutral";
  if (r.code === "order_won" || r.code === "customer_won") return "positive";
  if (r.is_interest) return "accent";
  if (r.is_rejection) return "negative";
  if (r.is_effective_contact) return "progress";
  return "neutral";
}

export function ActivityList({ activities, grouped = true, showCustomer = true }: { activities: ActivityWithCustomerClient[]; grouped?: boolean; showCustomer?: boolean }) {
  const { results, today } = useLookups();
  const resultMap = new Map(results.map((r) => [r.id, r]));
  const [editing, setEditing] = useState<ActivityWithCustomerClient | null>(null);

  const groups = new Map<string, ActivityWithCustomerClient[]>();
  for (const a of activities) {
    const k = grouped ? madridDateKey(a.occurred_at) : "all";
    groups.set(k, [...(groups.get(k) ?? []), a]);
  }

  return (
    <>
      <div className="space-y-5">
        {[...groups.entries()].map(([day, items]) => (
          <section key={day}>
            {grouped && (
              <h3 className="mb-2 flex items-baseline gap-2 px-1 text-[13px] font-medium text-ink-muted">
                <span className="text-ink">{relativeDayLabel(day, today) === "Hoy" ? "Hoy" : formatDate(day)}</span>
                {relativeDayLabel(day, today) === "Ayer" && <span>Ayer</span>}
                <span className="num ml-auto">{items.length} {items.length === 1 ? "puerta" : "puertas"}</span>
              </h3>
            )}
            <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-paper">
              {items.map((a) => (
                <ActivityRow key={a.id} a={a} result={a.result_id ? resultMap.get(a.result_id) : undefined} onEdit={() => setEditing(a)} showCustomer={showCustomer} showDate={!grouped} />
              ))}
            </ul>
          </section>
        ))}
      </div>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent title={editing.is_provisional ? "Completar puerta fría" : "Editar actividad"} size="lg">
            <ActivityEditForm activity={editing} onDone={() => setEditing(null)} />
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

function ActivityRow({
  a,
  result,
  onEdit,
  showCustomer,
  showDate,
}: {
  a: ActivityWithCustomerClient;
  result?: ProspectingResult;
  onEdit: () => void;
  showCustomer: boolean;
  showDate: boolean;
}) {
  const { run } = useAction();
  const name = a.customer?.trade_name ?? a.establishment_name;
  return (
    <li className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
      <span className="num w-11 shrink-0 text-[13px] text-ink-muted">{madridTime(a.occurred_at)}</span>
      <div className="min-w-0 flex-1">
        {showCustomer && (
          <p className="truncate text-sm font-medium">
            {a.is_provisional && !name ? (
              <span className="text-ink-muted">Establecimiento sin identificar</span>
            ) : a.customer ? (
              <Link href={`/clientes/${a.customer.id}`} className="hover:underline">
                {name}
              </Link>
            ) : (
              name
            )}
          </p>
        )}
        <p className="truncate text-[13px] text-ink-muted">
          {[showDate ? formatDate(a.occurred_at) : null, a.city ?? a.customer?.city, a.contact_name, a.notes].filter(Boolean).join(" · ") || "Sin más datos"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {a.is_provisional ? (
          <Button size="sm" variant="secondary" onClick={onEdit}>
            Completar
          </Button>
        ) : result ? (
          <Badge tone={resultTone(result)} className="max-w-28 truncate sm:max-w-none">
            {result.name}
          </Badge>
        ) : (
          <Badge className="hidden sm:inline-flex">Sin resultado</Badge>
        )}
        <Dropdown>
          <DropdownTrigger asChild>
            <button type="button" className="rounded-md p-1.5 text-ink-muted hover:bg-sunken hover:text-ink" aria-label="Opciones de la actividad">
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownItem onSelect={onEdit}>
              <Pencil />
              {a.is_provisional ? "Completar" : "Editar"}
            </DropdownItem>
            <ConfirmDialog
              trigger={
                <DropdownItem danger onSelect={(e) => e.preventDefault()}>
                  <Trash2 />
                  Eliminar
                </DropdownItem>
              }
              title="¿Eliminar esta actividad?"
              description="Dejará de contar en los contadores y estadísticas. Se conserva en el historial interno y se puede recuperar."
              onConfirm={async () => {
                await run(deleteActivity(a.id));
              }}
            />
          </DropdownContent>
        </Dropdown>
      </div>
      {!a.is_provisional && result && <span className="sr-only">Resultado: {result.name}</span>}
    </li>
  );
}
