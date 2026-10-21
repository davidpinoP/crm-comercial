"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { useLookups } from "@/components/app/lookups";
import { useAction } from "@/components/app/use-action";
import { createCustomer, updateCustomer } from "@/lib/actions/customers";
import { customerSchema, type CustomerInput } from "@/lib/validation";
import { CUSTOMER_STATUS_LABEL } from "@/lib/labels";
import { CUSTOMER_STATUSES, type Customer } from "@/lib/types";
import { newRequestId } from "@/lib/utils";

const centsToInput = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));

export function CustomerForm({ customer, onDone }: { customer?: Customer; onDone?: (id: string) => void }) {
  const { types, zones } = useLookups();
  const { run, pending } = useAction();
  const router = useRouter();
  const [requestId] = useState(newRequestId);
  const [more, setMore] = useState(!!customer);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<CustomerInput>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      trade_name: customer?.trade_name ?? "",
      legal_name: customer?.legal_name ?? "",
      establishment_type_id: customer?.establishment_type_id ?? "",
      contact_name: customer?.contact_name ?? "",
      phone: customer?.phone ?? "",
      email: customer?.email ?? "",
      address: customer?.address ?? "",
      city: customer?.city ?? "",
      province: customer?.province ?? "",
      postal_code: customer?.postal_code ?? "",
      zone_id: customer?.zone_id ?? "",
      status: customer?.status ?? "prospect_uncontacted",
      next_action: customer?.next_action ?? "",
      next_follow_up_date: customer?.next_follow_up_date ?? "",
      competitor_brands: customer?.competitor_brands ?? "",
      products_of_interest: customer?.products_of_interest ?? "",
      estimated_potential_cents: centsToInput(customer?.estimated_potential_cents ?? null),
      estimated_purchase_frequency: customer?.estimated_purchase_frequency ?? "",
      notes: customer?.notes ?? "",
    },
  });

  // Validamos en el cliente y enviamos los valores sin transformar: el servidor vuelve a validar
  const submit = handleSubmit(async () => {
    const raw = getValues();
    if (customer) {
      const res = await run(updateCustomer(customer.id, raw));
      if (res.ok) onDone?.(customer.id);
    } else {
      const res = await run(createCustomer(raw, requestId));
      if (res.ok) {
        if (onDone) onDone(res.data.id);
        else router.push(`/clientes/${res.data.id}`);
      }
    }
  });

  const err = (k: keyof CustomerInput) => errors[k]?.message as string | undefined;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Nombre comercial" htmlFor="cf-name" error={err("trade_name")}>
        <Input id="cf-name" {...register("trade_name")} aria-invalid={!!errors.trade_name} autoFocus={!customer} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo de establecimiento" htmlFor="cf-type" optional>
          <NativeSelect id="cf-type" {...register("establishment_type_id")}>
            <option value="">Sin especificar</option>
            {types.map((t) => (
              <option key={t.id} value={t.id} disabled={!t.active}>
                {t.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Estado comercial" htmlFor="cf-status">
          <NativeSelect id="cf-status" {...register("status")}>
            {CUSTOMER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CUSTOMER_STATUS_LABEL[s]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Población" htmlFor="cf-city" optional>
          <Input id="cf-city" {...register("city")} autoComplete="address-level2" />
        </Field>
        <Field label="Responsable" htmlFor="cf-contact" optional>
          <Input id="cf-contact" {...register("contact_name")} />
        </Field>
        <Field label="Teléfono" htmlFor="cf-phone" optional>
          <Input id="cf-phone" type="tel" inputMode="tel" {...register("phone")} />
        </Field>
        <Field label="Correo electrónico" htmlFor="cf-email" optional error={err("email")}>
          <Input id="cf-email" type="email" inputMode="email" {...register("email")} aria-invalid={!!errors.email} />
        </Field>
      </div>

      {!more ? (
        <Button type="button" variant="ghost" className="self-start" onClick={() => setMore(true)}>
          Más datos (dirección, zona, potencial…)
        </Button>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Razón social" htmlFor="cf-legal" optional>
              <Input id="cf-legal" {...register("legal_name")} />
            </Field>
            <Field label="Zona comercial" htmlFor="cf-zone" optional>
              <NativeSelect id="cf-zone" {...register("zone_id")}>
                <option value="">Sin zona</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Dirección" htmlFor="cf-address" optional className="sm:col-span-2">
              <Input id="cf-address" {...register("address")} autoComplete="street-address" />
            </Field>
            <Field label="Provincia" htmlFor="cf-prov" optional>
              <Input id="cf-prov" {...register("province")} />
            </Field>
            <Field label="Código postal" htmlFor="cf-cp" optional>
              <Input id="cf-cp" inputMode="numeric" {...register("postal_code")} />
            </Field>
            <Field label="Próxima acción" htmlFor="cf-next" optional>
              <Input id="cf-next" {...register("next_action")} />
            </Field>
            <Field label="Próximo seguimiento" htmlFor="cf-nfu" optional>
              <Input id="cf-nfu" type="date" {...register("next_follow_up_date")} />
            </Field>
            <Field label="Marcas competidoras" htmlFor="cf-comp" optional>
              <Input id="cf-comp" {...register("competitor_brands")} />
            </Field>
            <Field label="Productos de interés" htmlFor="cf-pi" optional>
              <Input id="cf-pi" {...register("products_of_interest")} />
            </Field>
            <Field label="Potencial de compra estimado (€)" htmlFor="cf-pot" optional error={err("estimated_potential_cents")}>
              <Input id="cf-pot" inputMode="decimal" placeholder="0,00" {...register("estimated_potential_cents")} />
            </Field>
            <Field label="Frecuencia de compra estimada" htmlFor="cf-freq" optional>
              <Input id="cf-freq" placeholder="Mensual" {...register("estimated_purchase_frequency")} />
            </Field>
          </div>
          <Field label="Observaciones" htmlFor="cf-notes" optional>
            <Textarea id="cf-notes" rows={3} {...register("notes")} />
          </Field>
        </>
      )}

      <Button type="submit" variant="primary" size="lg" loading={pending}>
        {customer ? "Guardar cambios" : "Crear cliente"}
      </Button>
    </form>
  );
}
