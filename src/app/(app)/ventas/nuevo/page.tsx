import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getContext } from "@/lib/data/context";
import { PageHeader } from "@/components/app/page-header";
import { OrderForm } from "@/components/app/forms/order-form";
import type { Product } from "@/lib/types";

export const metadata: Metadata = { title: "Nuevo pedido" };

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const sp = await searchParams;
  const ctx = await getContext();
  const [prods, cust] = await Promise.all([
    ctx.supabase.from("products").select("*").order("name"),
    sp.cliente && /^[0-9a-f-]{36}$/i.test(sp.cliente)
      ? ctx.supabase.from("customers").select("id, trade_name, city, status").eq("id", sp.cliente).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (prods.error) throw new Error(`No se ha podido cargar el catálogo: ${prods.error.message}`);
  return (
    <>
      <Link href="/ventas" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" />
        Ventas
      </Link>
      <PageHeader
        title="Nuevo pedido"
        description={(prods.data as Product[]).length === 0 ? "Aún no hay productos en el catálogo: puedes usar líneas libres o darlos de alta en Configuración." : "Los importes se recalculan y guardan con el precio e IVA de este momento."}
      />
      <OrderForm products={prods.data as Product[]} initialCustomer={cust.data as never} />
    </>
  );
}
