"use client";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { useLookups } from "@/components/app/lookups";
import { useQuickActions } from "@/components/app/quick-actions";
import { useAction } from "@/components/app/use-action";
import { setDateZone } from "@/lib/actions/settings";

export function NewEventButton() {
  const qa = useQuickActions();
  return (
    <Button variant="dark" size="sm" onClick={() => qa.open({ kind: "event" })}>
      <CalendarPlus />
      Programar
    </Button>
  );
}

export function DayZoneSelect({ date, zoneId }: { date: string; zoneId: string | null }) {
  const { zones } = useLookups();
  const { run, pending } = useAction();
  return (
    <NativeSelect
      aria-label={`Zona del ${date}`}
      className="h-9"
      disabled={pending}
      value={zoneId ?? ""}
      onChange={(e) => run(setDateZone(date, e.target.value || null, "set"))}
    >
      <option value="">Sin zona asignada</option>
      {zones.map((z) => (
        <option key={z.id} value={z.id}>
          {z.name}
        </option>
      ))}
    </NativeSelect>
  );
}
