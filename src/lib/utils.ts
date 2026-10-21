import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Identificador para idempotencia de formularios (uno por apertura de formulario) */
export function newRequestId(): string {
  return crypto.randomUUID();
}
