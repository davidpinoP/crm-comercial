import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Identificador para idempotencia de formularios (uno por apertura de formulario) */
export function newRequestId(): string {
  return crypto.randomUUID();
}

/** «1 pedido», «3 pedidos» */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n.toLocaleString("es-ES")} ${n === 1 ? singular : pluralForm}`;
}
