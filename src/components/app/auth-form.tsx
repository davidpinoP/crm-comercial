"use client";
import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signIn, signUp } from "@/lib/actions/auth";
import type { ActionResult } from "@/lib/types";

export function AuthForm({ mode, next, linkError }: { mode: "login" | "register"; next?: string; linkError?: boolean }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(mode === "login" ? signIn : signUp, null);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Correo electrónico" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <Field label="Contraseña" htmlFor="password" hint={mode === "register" ? "Mínimo 8 caracteres." : undefined}>
        <Input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} />
      </Field>
      {linkError && !state && <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">El enlace no es válido o ha caducado. Inicia sesión de nuevo.</p>}
      {state && !state.ok && (
        <p className="rounded-lg bg-negative-soft px-3 py-2 text-sm text-negative" role="alert">
          {state.error}
        </p>
      )}
      {state?.ok && state.message && <p className="rounded-lg bg-positive-soft px-3 py-2 text-sm text-positive">{state.message}</p>}
      <Button type="submit" variant="primary" size="lg" loading={pending}>
        {mode === "login" ? "Entrar" : "Crear cuenta"}
      </Button>
      <p className="text-center text-sm text-ink-muted">
        {mode === "login" ? (
          <>
            ¿Primera vez? <Link className="font-medium text-ink underline underline-offset-4" href="/registro">Crea tu cuenta</Link>
          </>
        ) : (
          <>
            ¿Ya tienes cuenta? <Link className="font-medium text-ink underline underline-offset-4" href="/login">Inicia sesión</Link>
          </>
        )}
      </p>
    </form>
  );
}

export function AuthLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-accent text-accent-ink" aria-hidden>
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 5v14M10 5v14M14 5v14M18 5v14M4 16 20 8" />
            </svg>
          </span>
          <span className="text-[17px] font-semibold tracking-[-0.01em]">CRM Comercial</span>
        </div>
        <h1 className="mb-6 text-[26px] font-semibold tracking-[-0.02em]">{title}</h1>
        {children}
      </div>
    </main>
  );
}
