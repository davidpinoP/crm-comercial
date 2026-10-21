"use client";
import { useMemo, useState } from "react";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { CustomerPicker, type PickedCustomer } from "@/components/app/customer-picker";
import { useLookups } from "@/components/app/lookups";
import { useAction } from "@/components/app/use-action";
import { registerProspecting } from "@/lib/actions/prospecting";
import { CUSTOMER_STATUS_LABEL } from "@/lib/labels";
import type { CustomerStatus } from "@/lib/types";
import { cn, newRequestId } from "@/lib/utils";

/** Estado comercial sugerido según el resultado (el usuario decide si aplicarlo) */
const SUGGESTED_STATUS: Record<string, CustomerStatus> = {
  effective_contact: "prospect_contacted",
  not_interested: "prospect_contacted",
  manager_absent: "prospect_contacted",
  interested: "interested",
  follow_up_pending: "follow_up_pending",
  second_visit: "visit_scheduled",
  customer_won: "customer_new",
  order_won: "customer_new",
};
const STATUS_RANK: CustomerStatus[] = [
  "prospect_uncontacted",
  "prospect_contacted",
  "interested",
  "follow_up_pending",
  "visit_scheduled",
  "customer_new",
];

export function ProspectingForm({
  initialCustomer = null,
  mode: initialMode = "quick",
  onDone,
}: {
  initialCustomer?: PickedCustomer | null;
  mode?: "full" | "quick";
  onDone?: (id: string) => void;
}) {
  const { types, results, today } = useLookups();
  const activeResults = results.filter((r) => r.active);
  const { run, pending } = useAction();
  const [requestId, setRequestId] = useState(newRequestId);
  const [mode, setMode] = useState(initialMode);
  const [customer, setCustomer] = useState<PickedCustomer | null>(initialCustomer);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [typeId, setTypeId] = useState("");
  const [contact, setContact] = useState("");
  const [resultId, setResultId] = useState("");
  const [notes, setNotes] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [applyStatus, setApplyStatus] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const result = activeResults.find((r) => r.id === resultId);
  const suggested = result ? SUGGESTED_STATUS[result.code] : undefined;
  const statusChange = useMemo(() => {
    if (!suggested) return null;
    if (!customer) return suggested;
    const cur = customer.status as CustomerStatus | undefined;
    // Sólo sugerimos avanzar, nunca retroceder (p. ej. un cliente activo no vuelve a «interesado»)
    if (cur && (cur.startsWith("customer_") || STATUS_RANK.indexOf(cur) >= STATUS_RANK.indexOf(suggested))) return null;
    return suggested;
  }, [customer, suggested]);

  const reset = () => {
    setRequestId(newRequestId());
    setCustomer(initialCustomer);
    setName("");
    setCity("");
    setTypeId("");
    setContact("");
    setResultId("");
    setNotes("");
    setNextAction("");
    setFollowUp("");
    setError(null);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!customer && !name.trim()) {
      setError("Escribe el nombre del establecimiento o elige uno existente.");
      return;
    }
    setError(null);
    const res = await run(
      registerProspecting({
        client_request_id: requestId,
        customer_id: customer?.id ?? null,
        establishment_name: customer ? null : name,
        city: city || null,
        establishment_type_id: typeId || null,
        contact_name: contact || null,
        result_id: resultId || null,
        notes,
        next_action: nextAction,
        follow_up_date: followUp || null,
        is_provisional: false,
        new_customer_status: statusChange && (applyStatus || !customer) ? statusChange : null,
      }),
    );
    if (res.ok) {
      reset();
      onDone?.(res.data.id);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="flex rounded-[var(--radius-field)] bg-sunken p-1 text-sm" role="tablist" aria-label="Modo de registro">
        {(["quick", "full"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              "flex-1 rounded-md py-1.5 font-medium text-ink-muted transition-colors",
              mode === m && "bg-paper text-ink shadow-card",
            )}
          >
            {m === "quick" ? "Rápido" : "Completo"}
          </button>
        ))}
      </div>

      <Field label="Establecimiento" htmlFor="pf-est" error={error ?? undefined}>
        <CustomerPicker
          id="pf-est"
          value={customer}
          onChange={setCustomer}
          text={name}
          onTextChange={setName}
          allowNew
          autoFocus={!initialCustomer}
          invalid={!!error}
          placeholder="Nombre del establecimiento"
        />
      </Field>

      {!customer && (
        <Field label="Población" htmlFor="pf-city" optional>
          <Input id="pf-city" value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
        </Field>
      )}

      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium">
          Resultado {mode === "quick" && <span className="font-normal text-ink-faint">(opcional)</span>}
        </legend>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {activeResults.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={resultId === r.id}
              onClick={() => setResultId(resultId === r.id ? "" : r.id)}
              className={cn(
                "min-h-11 rounded-[var(--radius-field)] border border-line-strong px-2.5 py-2 text-left text-[13px] leading-tight font-medium transition-colors hover:bg-sunken",
                resultId === r.id && "border-ink bg-ink text-paper hover:bg-ink",
              )}
            >
              {r.name}
            </button>
          ))}
        </div>
      </fieldset>

      {statusChange && (
        <label className="flex items-start gap-2 rounded-[var(--radius-field)] bg-sunken px-3 py-2.5 text-sm">
          {customer ? (
            <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={applyStatus} onChange={(e) => setApplyStatus(e.target.checked)} />
          ) : null}
          <span>
            {customer ? "Actualizar el estado del cliente a " : "Se creará como "}
            <strong>{CUSTOMER_STATUS_LABEL[statusChange]}</strong>
          </span>
        </label>
      )}

      {mode === "full" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {!customer && (
              <Field label="Tipo de establecimiento" htmlFor="pf-type" optional>
                <NativeSelect id="pf-type" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                  <option value="">Sin especificar</option>
                  {types
                    .filter((t) => t.active)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </NativeSelect>
              </Field>
            )}
            <Field label="Persona de contacto" htmlFor="pf-contact" optional>
              <Input id="pf-contact" value={contact} onChange={(e) => setContact(e.target.value)} />
            </Field>
          </div>
          <Field label="Observaciones" htmlFor="pf-notes" optional>
            <Textarea id="pf-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Próxima acción" htmlFor="pf-next" optional>
              <Input id="pf-next" value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="Llevar muestras de cera" />
            </Field>
            <Field label="Fecha de seguimiento" htmlFor="pf-fu" optional hint={followUp ? "Se creará un seguimiento." : undefined}>
              <Input id="pf-fu" type="date" min={today} value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
            </Field>
          </div>
        </>
      )}

      <p className="text-[13px] text-ink-muted">La fecha y hora se registran automáticamente (hora de Madrid).</p>

      <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
        <Zap />
        Guardar prospección
      </Button>
    </form>
  );
}
