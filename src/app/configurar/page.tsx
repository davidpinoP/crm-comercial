import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Configurar la base de datos" };
export const dynamic = "force-dynamic";

const STEPS = [
  ["Crea un proyecto en Supabase", "En supabase.com → New project. Elige la región de Europa (Frankfurt o París)."],
  ["Aplica las migraciones", "Con la CLI: «npx supabase link --project-ref TU_PROYECTO» y «npx supabase db push». O pega los archivos de supabase/migrations, en orden, en el SQL Editor."],
  ["Copia las claves", "En Project Settings → API copia la URL del proyecto y la clave «anon public»."],
  ["Crea el archivo .env.local", "Copia .env.example como .env.local y rellena NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY."],
  ["Reinicia la aplicación", "Detén «npm run dev» y vuelve a lanzarlo para que lea las nuevas variables."],
];

export default function SetupPage() {
  if (isSupabaseConfigured()) redirect("/");
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:py-20">
      <p className="text-sm font-medium text-accent">Falta un paso</p>
      <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.02em]">Conecta la base de datos</h1>
      <p className="mt-3 text-ink-muted">
        La aplicación guarda todos los datos comerciales en Supabase (PostgreSQL). Hasta que la conectes no se puede iniciar sesión
        ni guardar información: no se simula ningún guardado.
      </p>
      <ol className="mt-8 space-y-5">
        {STEPS.map(([title, text], i) => (
          <li key={title} className="flex gap-4">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-[13px] font-semibold text-paper">{i + 1}</span>
            <div>
              <p className="font-medium">{title}</p>
              <p className="mt-0.5 text-sm text-ink-muted">{text}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-10 rounded-xl border border-line bg-paper p-4 text-sm text-ink-muted">
        Las instrucciones completas están en el README del repositorio, sección «Configurar Supabase».
      </p>
    </main>
  );
}
