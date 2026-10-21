import type { Metadata } from "next";
import Link from "next/link";
import { Copy, Download, Users } from "lucide-react";
import { getContext } from "@/lib/data/context";
import { lastContact, listCustomers } from "@/lib/data/customers";
import { formatDate, relativeDayLabel, todayISO } from "@/lib/domain/dates";
import { PageHeader } from "@/components/app/page-header";
import { CustomerStatusSelect } from "@/components/app/customer-status";
import { NewCustomerButton } from "./new-button";
import { CustomerFilters } from "./filters";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import type { CustomerStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Clientes" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const page = Math.max(1, Number(sp.pagina) || 1);
  const { rows, total } = await listCustomers(ctx, {
    q: sp.q,
    status: sp.estado,
    type: sp.tipo,
    zone: sp.zona,
    archived: sp.vista === "archivados",
    reactivation: sp.vista === "reactivar",
    page,
  });
  const typeName = new Map(ctx.types.map((t) => [t.id, t.name]));
  const today = todayISO();
  const pages = Math.ceil(total / 50);
  const qs = (p: number) => {
    const u = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    u.set("pagina", String(p));
    return `?${u}`;
  };

  return (
    <>
      <PageHeader
        title="Clientes y prospectos"
        description={`${total} ${total === 1 ? "establecimiento" : "establecimientos"}${sp.vista === "reactivar" ? ` sin pedidos en más de ${ctx.settings.inactivity_days} días` : ""}`}
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/clientes/duplicados">
                <Copy />
                Duplicados
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <a href="/api/exportar/clientes">
                <Download />
                CSV
              </a>
            </Button>
            <NewCustomerButton />
          </>
        }
      />
      <CustomerFilters />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users />}
            title={Object.values(sp).some(Boolean) ? "Ningún establecimiento coincide con los filtros" : "Aún no tienes clientes"}
            description="Los establecimientos se crean al registrar una prospección o desde «Nuevo cliente»."
          />
        </Card>
      ) : (
        <>
          {/* Móvil: tarjetas */}
          <ul className="space-y-2 md:hidden">
            {rows.map((c) => {
              const lc = lastContact(c);
              return (
                <li key={c.id}>
                  <Card className="p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/clientes/${c.id}`} className="min-w-0">
                        <p className="truncate font-medium">{c.trade_name}</p>
                        <p className="truncate text-[13px] text-ink-muted">
                          {[c.city, c.establishment_type_id ? typeName.get(c.establishment_type_id) : null].filter(Boolean).join(" · ") || "Sin datos"}
                        </p>
                      </Link>
                      <CustomerStatusSelect id={c.id} status={c.status as CustomerStatus} className="shrink-0" />
                    </div>
                    <p className="mt-2 text-[13px] text-ink-muted">
                      Último contacto: {lc ? relativeDayLabel(lc, today) : "nunca"}
                      {c.next_follow_up_date && <> · Seguimiento {formatDate(c.next_follow_up_date)}</>}
                    </p>
                  </Card>
                </li>
              );
            })}
          </ul>

          {/* Escritorio: tabla */}
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-ink-muted">
                  <th className="px-4 py-3 font-medium">Establecimiento</th>
                  <th className="px-3 py-3 font-medium">Población</th>
                  <th className="px-3 py-3 font-medium">Estado</th>
                  <th className="px-3 py-3 font-medium">Último contacto</th>
                  <th className="px-3 py-3 font-medium">Último pedido</th>
                  <th className="px-4 py-3 font-medium">Próximo seguimiento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((c) => {
                  const lc = lastContact(c);
                  return (
                    <tr key={c.id} className="hover:bg-canvas/60">
                      <td className="max-w-72 px-4 py-2.5">
                        <Link href={`/clientes/${c.id}`} className="block truncate font-medium hover:underline">
                          {c.trade_name}
                        </Link>
                        <span className="block truncate text-[12px] text-ink-muted">
                          {[c.establishment_type_id ? typeName.get(c.establishment_type_id) : null, c.contact_name, c.phone].filter(Boolean).join(" · ")}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-ink-muted">{c.city ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        <CustomerStatusSelect id={c.id} status={c.status as CustomerStatus} />
                      </td>
                      <td className="num px-3 py-2.5 text-ink-muted">{lc ? formatDate(lc) : "—"}</td>
                      <td className="num px-3 py-2.5 text-ink-muted">{c.last_order_date ? formatDate(c.last_order_date) : "—"}</td>
                      <td className={`num px-4 py-2.5 ${c.next_follow_up_date && c.next_follow_up_date < today ? "font-medium text-negative" : "text-ink-muted"}`}>
                        {c.next_follow_up_date ? formatDate(c.next_follow_up_date) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {pages > 1 && (
            <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Paginación">
              <span className="text-ink-muted">
                Página {page} de {pages}
              </span>
              <div className="flex gap-2">
                {page > 1 && (
                  <Button asChild size="sm">
                    <Link href={qs(page - 1)}>Anterior</Link>
                  </Button>
                )}
                {page < pages && (
                  <Button asChild size="sm">
                    <Link href={qs(page + 1)}>Siguiente</Link>
                  </Button>
                )}
              </div>
            </nav>
          )}
        </>
      )}
    </>
  );
}
