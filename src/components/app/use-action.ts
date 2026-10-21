"use client";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/types";

/**
 * Ejecuta una acción de servidor mostrando carga, éxito o error.
 * Nunca muestra un cambio como guardado si la acción falla.
 */
export function useAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const run = useCallback(
    async <T,>(p: Promise<ActionResult<T>>, opts: { success?: string; refresh?: boolean } = {}): Promise<ActionResult<T>> => {
      setPending(true);
      try {
        const res = await p;
        if (res.ok) {
          const msg = opts.success ?? res.message;
          if (msg) toast.success(msg);
          if (opts.refresh !== false) router.refresh();
        } else {
          toast.error(res.error);
        }
        return res;
      } catch {
        const error = "No hay conexión con el servidor. El cambio no se ha guardado.";
        toast.error(error);
        return { ok: false, error };
      } finally {
        setPending(false);
      }
    },
    [router],
  );
  return { run, pending };
}
