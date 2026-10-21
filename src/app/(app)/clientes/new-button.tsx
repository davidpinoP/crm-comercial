"use client";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuickActions } from "@/components/app/quick-actions";

export function NewCustomerButton() {
  const qa = useQuickActions();
  return (
    <Button variant="dark" size="sm" onClick={() => qa.open({ kind: "customer" })}>
      <UserPlus />
      Nuevo cliente
    </Button>
  );
}
