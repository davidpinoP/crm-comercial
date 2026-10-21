"use client";
import { DoorOpen, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuickActions } from "./quick-actions";

/** Botones principales de prospección: registro completo y +1 puerta fría */
export function ProspectingActions({ size = "xl" }: { size?: "lg" | "xl" }) {
  const qa = useQuickActions();
  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
      <Button variant="primary" size={size} className="w-full sm:w-auto" onClick={() => qa.open({ kind: "prospecting", mode: "quick" })}>
        <Zap />
        Nueva prospección
      </Button>
      <Button variant="secondary" size={size} className="w-full sm:w-auto" onClick={() => qa.tallyColdCall()} loading={qa.tallyPending}>
        <DoorOpen />
        +1 puerta fría
      </Button>
    </div>
  );
}
