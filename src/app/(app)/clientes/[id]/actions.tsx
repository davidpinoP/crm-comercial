"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, CalendarPlus, ClipboardList, Footprints, MoreHorizontal, Pencil, ShoppingBag, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from "@/components/ui/dropdown";
import { ConfirmDialog } from "@/components/ui/confirm";
import { CustomerForm } from "@/components/app/forms/customer-form";
import { useQuickActions } from "@/components/app/quick-actions";
import { useAction } from "@/components/app/use-action";
import { archiveCustomer } from "@/lib/actions/customers";
import type { PickedCustomer } from "@/components/app/customer-picker";
import type { Customer } from "@/lib/types";

export function CustomerActions({ customer, picked }: { customer: Customer; picked: PickedCustomer }) {
  const qa = useQuickActions();
  const router = useRouter();
  const { run } = useAction();
  const [editing, setEditing] = useState(false);
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:justify-end">
        <Button variant="dark" onClick={() => qa.open({ kind: "visit", customer: picked })}>
          <Footprints />
          Registrar visita
        </Button>
        <Button asChild variant="primary">
          <Link href={`/ventas/nuevo?cliente=${customer.id}`}>
            <ShoppingBag />
            Crear pedido
          </Link>
        </Button>
        <Button onClick={() => qa.open({ kind: "followup", customer: picked })}>
          <ClipboardList />
          Seguimiento
        </Button>
        <Button onClick={() => qa.open({ kind: "event", customer: picked, type: customer.status.startsWith("customer_") ? "customer_visit" : "prospect_visit" })}>
          <CalendarPlus />
          Programar cita
        </Button>
        <Button onClick={() => setEditing(true)}>
          <Pencil />
          Editar
        </Button>
        <Dropdown>
          <DropdownTrigger asChild>
            <Button aria-label="Más acciones">
              <MoreHorizontal />
              <span className="sm:hidden">Más</span>
            </Button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownItem onSelect={() => qa.open({ kind: "prospecting", customer: picked, mode: "full" })}>
              <Zap />
              Registrar prospección
            </DropdownItem>
            {customer.archived_at ? (
              <DropdownItem onSelect={() => run(archiveCustomer(customer.id, false))}>
                <ArchiveRestore />
                Restaurar
              </DropdownItem>
            ) : (
              <ConfirmDialog
                trigger={
                  <DropdownItem danger onSelect={(e) => e.preventDefault()}>
                    <Archive />
                    Archivar
                  </DropdownItem>
                }
                title="¿Archivar este cliente?"
                description="Dejará de aparecer en listados y búsquedas. Se conservan su historial, pedidos y estadísticas, y puedes restaurarlo cuando quieras."
                confirmLabel="Archivar"
                onConfirm={async () => {
                  const res = await run(archiveCustomer(customer.id, true));
                  if (res.ok) router.push("/clientes");
                }}
              />
            )}
          </DropdownContent>
        </Dropdown>
      </div>
      <Dialog open={editing} onOpenChange={setEditing}>
        {editing && (
          <DialogContent title="Editar cliente" size="lg">
            <CustomerForm customer={customer} onDone={() => setEditing(false)} />
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
