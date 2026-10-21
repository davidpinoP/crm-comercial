"use client";
import { ClipboardList, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuickActions } from "@/components/app/quick-actions";
import type { PickedCustomer } from "@/components/app/customer-picker";

export function NewFollowUpButton() {
  const qa = useQuickActions();
  return (
    <Button variant="dark" size="sm" onClick={() => qa.open({ kind: "followup" })}>
      <ClipboardList />
      Nuevo seguimiento
    </Button>
  );
}

export function ReactivateButton({ customer }: { customer: PickedCustomer }) {
  const qa = useQuickActions();
  return (
    <Button size="icon-sm" variant="secondary" title="Programar seguimiento de recuperación" aria-label={`Programar seguimiento para ${customer.trade_name}`} onClick={() => qa.open({ kind: "followup", customer })}>
      <PhoneCall />
    </Button>
  );
}
