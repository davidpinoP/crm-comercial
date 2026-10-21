import "server-only";
import { ZodError } from "zod";
import type { ActionResult } from "@/lib/types";

interface PgLikeError {
  code?: string;
  message?: string;
  details?: string;
}

/** Traduce errores de Postgres/PostgREST a mensajes comprensibles. Nunca oculta un fallo. */
export function describeDbError(err: PgLikeError | null | undefined): string {
  if (!err) return "Error desconocido.";
  switch (err.code) {
    case "23505":
      return "Ya existe un registro con esos datos (por ejemplo, el mismo número de pedido o referencia).";
    case "23503":
      return "El registro está vinculado a otros datos y no se puede completar la operación.";
    case "23514":
      return "Algún valor no es válido. Revisa los importes y campos obligatorios.";
    case "42501":
      return err.message?.startsWith("Referencia") ? err.message : "No tienes permiso para realizar esta operación.";
    case "P0002":
    case "22023":
    case "P0001":
      return err.message ?? "Operación no válida.";
    case "PGRST116":
      return "No se ha encontrado el registro.";
    default:
      return "No se ha podido guardar. Comprueba la conexión e inténtalo de nuevo.";
  }
}

export function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

export function zodMessage(e: ZodError): string {
  const first = e.issues[0];
  return first?.message ?? "Revisa los datos del formulario.";
}

/** Ejecuta una acción capturando validaciones y errores inesperados */
export async function action<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ZodError) return fail(zodMessage(e));
    // redirect()/notFound() de Next deben propagarse
    if (e && typeof e === "object" && "digest" in e) throw e;
    console.error("[accion]", e);
    return fail("Ha ocurrido un error inesperado. No se ha guardado ningún cambio.");
  }
}
