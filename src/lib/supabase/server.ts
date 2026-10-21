import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./config";

/** Cliente de servidor con la sesión del usuario: todas las consultas pasan por RLS. */
export async function createClient() {
  const env = getSupabaseEnv();
  if (!env) throw new Error("Supabase no está configurado. Revisa las variables de entorno.");
  const cookieStore = await cookies();
  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Llamado desde un Server Component: el middleware refresca la sesión.
        }
      },
    },
  });
}

export type SupabaseServer = Awaited<ReturnType<typeof createClient>>;
