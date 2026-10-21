"use client";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <Card className="mx-auto mt-10 max-w-md p-6 text-center">
      <AlertTriangle className="mx-auto size-6 text-warning" />
      <h1 className="mt-3 text-[17px] font-semibold">No se ha podido cargar esta página</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {error.message?.startsWith("No se ha") ? error.message : "Comprueba la conexión con la base de datos e inténtalo de nuevo."}
      </p>
      <Button className="mt-5" variant="secondary" onClick={reset}>
        Reintentar
      </Button>
    </Card>
  );
}
