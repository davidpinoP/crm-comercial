import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CopyCheck } from "lucide-react";
import { getContext } from "@/lib/data/context";
import { findDuplicateGroups } from "@/lib/data/customers";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MergeGroup } from "./merge-group";

export const metadata: Metadata = { title: "Posibles duplicados" };

export default async function DuplicatesPage() {
  const ctx = await getContext();
  const groups = await findDuplicateGroups(ctx);
  return (
    <>
      <Link href="/clientes" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" />
        Clientes
      </Link>
      <PageHeader
        title="Posibles duplicados"
        description="Establecimientos con nombre parecido en la misma población o con el mismo teléfono. Revisa antes de fusionar: la fusión conserva todas las actividades, visitas y pedidos."
      />
      {groups.length === 0 ? (
        <Card>
          <EmptyState icon={<CopyCheck />} title="No se han detectado duplicados" />
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <MergeGroup key={g.map((c) => c.id).join()} customers={g.map((c) => ({ id: c.id, trade_name: c.trade_name, city: c.city, phone: c.phone, created_at: c.created_at, status: c.status }))} />
          ))}
        </div>
      )}
    </>
  );
}
