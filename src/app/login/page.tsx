import type { Metadata } from "next";
import { AuthForm, AuthLayout } from "@/components/app/auth-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <AuthLayout title="Inicia sesión">
      <AuthForm mode="login" next={sp.next} linkError={sp.error === "enlace"} />
    </AuthLayout>
  );
}
