"use client";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ProspectingForm } from "./forms/prospecting-form";
import { CustomerForm } from "./forms/customer-form";
import { EventForm, FollowUpForm, VisitForm } from "./forms/event-forms";
import type { PickedCustomer } from "./customer-picker";
import { deleteActivity, registerProspecting } from "@/lib/actions/prospecting";
import type { EventType } from "@/lib/types";
import { newRequestId } from "@/lib/utils";

type Request =
  | { kind: "prospecting"; customer?: PickedCustomer | null; mode?: "full" | "quick" }
  | { kind: "customer" }
  | { kind: "event"; customer?: PickedCustomer | null; date?: string; type?: EventType }
  | { kind: "followup"; customer?: PickedCustomer | null }
  | { kind: "visit"; customer?: PickedCustomer | null };

interface QuickActions {
  open: (r: Request) => void;
  /** Suma una puerta fría provisional (sin datos) con un toque */
  tallyColdCall: () => Promise<void>;
  tallyPending: boolean;
}

const Ctx = createContext<QuickActions | null>(null);

const TITLES: Record<Request["kind"], { title: string; description?: string }> = {
  prospecting: { title: "Nueva prospección", description: "Registra la puerta fría en pocos segundos." },
  customer: { title: "Nuevo cliente o prospecto" },
  event: { title: "Programar en el calendario" },
  followup: { title: "Nuevo seguimiento" },
  visit: { title: "Registrar visita realizada" },
};

export function QuickActionsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [req, setReq] = useState<Request | null>(null);
  const [tallyPending, setTallyPending] = useState(false);
  const busy = useRef(false);

  const close = useCallback(() => setReq(null), []);

  const tallyColdCall = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setTallyPending(true);
    try {
      const res = await registerProspecting({ client_request_id: newRequestId(), is_provisional: true });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
      toast.success("+1 puerta fría", {
        description: "Pendiente de completar en Prospección.",
        action: {
          label: "Deshacer",
          onClick: async () => {
            const undo = await deleteActivity(res.data.id);
            if (undo.ok) {
              toast("Puerta fría anulada.");
              router.refresh();
            } else toast.error(undo.error);
          },
        },
      });
    } catch {
      toast.error("Sin conexión: la puerta fría no se ha guardado.");
    } finally {
      busy.current = false;
      setTallyPending(false);
    }
  }, [router]);

  const value = useMemo(() => ({ open: setReq, tallyColdCall, tallyPending }), [tallyColdCall, tallyPending]);
  const t = req ? TITLES[req.kind] : TITLES.prospecting;

  return (
    <Ctx.Provider value={value}>
      {children}
      <Dialog open={!!req} onOpenChange={(o) => !o && close()}>
        {req && (
          <DialogContent title={t.title} description={t.description} size={req.kind === "customer" || req.kind === "event" ? "lg" : "md"}>
            {req.kind === "prospecting" && <ProspectingForm initialCustomer={req.customer} mode={req.mode} onDone={close} />}
            {req.kind === "customer" && <CustomerForm onDone={(id) => (close(), router.push(`/clientes/${id}`))} />}
            {req.kind === "event" && <EventForm initialCustomer={req.customer} initialDate={req.date} initialType={req.type} onDone={close} />}
            {req.kind === "followup" && <FollowUpForm initialCustomer={req.customer} onDone={close} />}
            {req.kind === "visit" && <VisitForm initialCustomer={req.customer} onDone={close} />}
          </DialogContent>
        )}
      </Dialog>
    </Ctx.Provider>
  );
}

export function useQuickActions(): QuickActions {
  const v = useContext(Ctx);
  if (!v) throw new Error("useQuickActions fuera de QuickActionsProvider");
  return v;
}
