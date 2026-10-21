import type { Metadata } from "next";
import { AuthForm, AuthLayout } from "@/components/app/auth-form";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function RegisterPage() {
  return (
    <AuthLayout title="Crea tu cuenta">
      <AuthForm mode="register" />
    </AuthLayout>
  );
}
