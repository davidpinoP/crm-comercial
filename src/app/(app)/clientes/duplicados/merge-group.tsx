"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm";
import { useAction } from "@/components/app/use-action";
import { mergeCustomers } from "@/lib/actions/customers";
import { CUSTOMER_STATUS_LABEL } from "@/lib/labels";
import { formatDate } from "@/lib/domain/dates";
import type { CustomerStatus } from "@/lib/types";

interface Row {
  id: string;
  trade_name: string;
  city: string | null;
  phone: string | null;
  created_at: string;
  status: CustomerStatus;
}

export function MergeGroup({ customers }: { customers: Row[] }) {
  const { run } = useAction();
  const [keep, setKeep] = useState(customers[0].id);
  const others = customers.filter((c) => c.id !== keep);
  const keepName = customers.find((c) => c.id === keep)?.trade_name;
  return (
    <Card className="p-4">
      <fieldset>
        <legend className="mb-2 text-sm text-ink-muted">Elige el registro que se conserva</legend>
        <ul className="space-y-1.5">
          {customers.map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-sunken">
                <input type="radio" name={`keep-${customers[0].id}`} checked={keep === c.id} onChange={() => setKeep(c.id)} className="size-4 accent-[var(--accent)]" />
                <span className="min-w-0 flex-1">
                  <Link href={`/clientes/${c.id}`} className="font-medium hover:underline">
                    {c.trade_name}
                  </Link>
                  <span className="block text-[13px] text-ink-muted">
                    {[c.city, c.phone, CUSTOMER_STATUS_LABEL[c.status], `creado ${formatDate(c.created_at)}`].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {others.map((o) => (
          <ConfirmDialog
            key={o.id}
            trigger={<Button size="sm">Fusionar «{o.trade_name}» en el elegido</Button>}
            title="¿Fusionar estos registros?"
            description={`Las actividades, visitas, seguimientos y pedidos de «${o.trade_name}» pasarán a «${keepName}». El duplicado quedará archivado. Esta operación no se deshace automáticamente.`}
            confirmLabel="Fusionar"
            destructive={false}
            onConfirm={async () => {
              await run(mergeCustomers(keep, o.id));
            }}
          />
        ))}
      </div>
    </Card>
  );
}
