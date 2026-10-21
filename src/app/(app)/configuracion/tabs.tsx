"use client";
import { useEffect, useState } from "react";
import { Database, Pencil, Plus, Trash2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm";
import { useAction } from "@/components/app/use-action";
import {
  archiveZone,
  deleteDemoData,
  deleteLookup,
  generateDemoData,
  saveCommissionSettings,
  saveLookup,
  saveResult,
  saveZone,
  setWeekdayZone,
  updateProfile,
  updateSettings,
} from "@/lib/actions/settings";
import { saveProduct } from "@/lib/actions/orders";
import { computeCommission, type CommissionTier } from "@/lib/domain/commissions";
import { formatEUR, formatPercentBp, parseEurosToCents } from "@/lib/domain/money";
import { ORDER_STATUSES } from "@/lib/domain/revenue";
import { ORDER_STATUS_LABEL, WEEKDAY_LABEL } from "@/lib/labels";
import type { AppSettings, CommissionSettings, EstablishmentType, Product, ProductCategory, Profile, ProspectingResult, Zone } from "@/lib/types";

interface Props {
  initialTab: string;
  email: string;
  profile: Profile | null;
  settings: AppSettings;
  types: EstablishmentType[];
  results: ProspectingResult[];
  categories: ProductCategory[];
  zones: Zone[];
  weekly: Record<number, string>;
  products: Product[];
  commission: CommissionSettings;
  tiers: CommissionTier[];
  hasDemo: boolean;
}

const TABS = [
  ["perfil", "Perfil"],
  ["trabajo", "Trabajo"],
  ["zonas", "Zonas"],
  ["tipos", "Establecimientos"],
  ["resultados", "Resultados"],
  ["catalogo", "Catálogo"],
  ["comisiones", "Comisiones"],
  ["pedidos", "Pedidos computables"],
  ["datos", "Datos"],
] as const;

export function SettingsTabs(p: Props) {
  const [tab, setTab] = useState(TABS.some(([k]) => k === p.initialTab) ? p.initialTab : "perfil");
  useEffect(() => {
    const u = new URL(window.location.href);
    u.searchParams.set("tab", tab);
    window.history.replaceState(null, "", u);
  }, [tab]);
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        {TABS.map(([k, l]) => (
          <TabsTrigger key={k} value={k}>
            {l}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="perfil">
        <ProfileSection email={p.email} profile={p.profile} theme={p.settings.theme} />
      </TabsContent>
      <TabsContent value="trabajo">
        <WorkSection settings={p.settings} />
      </TabsContent>
      <TabsContent value="zonas">
        <ZonesSection zones={p.zones} weekly={p.weekly} />
      </TabsContent>
      <TabsContent value="tipos">
        <LookupSection kind="types" title="Tipos de establecimiento" items={p.types} />
      </TabsContent>
      <TabsContent value="resultados">
        <ResultsSection results={p.results} />
      </TabsContent>
      <TabsContent value="catalogo">
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ProductsSection products={p.products} categories={p.categories} />
          </div>
          <LookupSection kind="categories" title="Categorías" items={p.categories} />
        </div>
      </TabsContent>
      <TabsContent value="comisiones">
        <CommissionSection commission={p.commission} tiers={p.tiers} />
      </TabsContent>
      <TabsContent value="pedidos">
        <CountableSection settings={p.settings} />
      </TabsContent>
      <TabsContent value="datos">
        <DataSection hasDemo={p.hasDemo} />
      </TabsContent>
    </Tabs>
  );
}

// -----------------------------------------------------------------------------
function ProfileSection({ email, profile, theme }: { email: string; profile: Profile | null; theme: AppSettings["theme"] }) {
  const { run, pending } = useAction();
  const [name, setName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [company, setCompany] = useState(profile?.company ?? "");
  const [t, setT] = useState(theme);
  const applyTheme = (v: AppSettings["theme"]) => {
    setT(v);
    try {
      if (v === "system") {
        localStorage.removeItem("crm-theme");
        delete document.documentElement.dataset.theme;
      } else {
        localStorage.setItem("crm-theme", v);
        document.documentElement.dataset.theme = v;
      }
    } catch {
      /* preferencia visual: si falla el almacenamiento local no pasa nada */
    }
    void run(updateSettings({ theme: v }), { refresh: false });
  };
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Datos personales" description={email} />
        <CardBody>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(updateProfile({ full_name: name, phone, company }));
            }}
          >
            <Field label="Nombre" htmlFor="pr-name" optional>
              <Input id="pr-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </Field>
            <Field label="Teléfono" htmlFor="pr-phone" optional>
              <Input id="pr-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Empresa" htmlFor="pr-company" optional>
              <Input id="pr-company" value={company} onChange={(e) => setCompany(e.target.value)} />
            </Field>
            <Button type="submit" variant="dark" loading={pending} className="self-start">
              Guardar
            </Button>
          </form>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Preferencias de visualización" />
        <CardBody>
          <Field label="Tema" htmlFor="pr-theme">
            <NativeSelect id="pr-theme" value={t} onChange={(e) => applyTheme(e.target.value as AppSettings["theme"])}>
              <option value="system">Según el dispositivo</option>
              <option value="light">Claro</option>
              <option value="dark">Oscuro</option>
            </NativeSelect>
          </Field>
        </CardBody>
      </Card>
    </div>
  );
}

// -----------------------------------------------------------------------------
function WorkSection({ settings }: { settings: AppSettings }) {
  const { run, pending } = useAction();
  const [days, setDays] = useState<number[]>(settings.working_weekdays);
  const [start, setStart] = useState(settings.work_start_time.slice(0, 5));
  const [end, setEnd] = useState(settings.work_end_time.slice(0, 5));
  const [hours, setHours] = useState(String(settings.default_work_hours).replace(".", ","));
  const [inactivity, setInactivity] = useState(String(settings.inactivity_days));
  const [maturity, setMaturity] = useState(String(settings.cohort_maturity_days));
  return (
    <Card>
      <CardHeader title="Horario y calendario laboral" description="Se usa para calcular días laborables restantes, ritmo necesario y tiempo disponible." />
      <CardBody>
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              updateSettings({
                working_weekdays: days,
                work_start_time: start,
                work_end_time: end,
                default_work_hours: hours.replace(",", "."),
                inactivity_days: inactivity,
                cohort_maturity_days: maturity,
              }),
            );
          }}
        >
          <fieldset>
            <legend className="mb-2 text-[13px] font-medium">Días de trabajo habituales</legend>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <label key={d} className="flex items-center gap-2 rounded-[var(--radius-field)] border border-line-strong px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--accent)]"
                    checked={days.includes(d)}
                    onChange={(e) => setDays((ds) => (e.target.checked ? [...ds, d].sort() : ds.filter((x) => x !== d)))}
                  />
                  {WEEKDAY_LABEL[d]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Inicio de jornada" htmlFor="wk-start">
              <Input id="wk-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Fin de jornada" htmlFor="wk-end">
              <Input id="wk-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </Field>
            <Field label="Horas por día" htmlFor="wk-hours">
              <Input id="wk-hours" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
            </Field>
            <Field label="Días sin pedidos para reactivación" htmlFor="wk-inact" hint="Marca al cliente como candidato; no cambia su estado.">
              <Input id="wk-inact" inputMode="numeric" value={inactivity} onChange={(e) => setInactivity(e.target.value)} />
            </Field>
            <Field label="Maduración de prospectos (días)" htmlFor="wk-mat" hint="Para la conversión por cohortes.">
              <Input id="wk-mat" inputMode="numeric" value={maturity} onChange={(e) => setMaturity(e.target.value)} />
            </Field>
          </div>
          <p className="text-[13px] text-ink-muted">Las vacaciones y festivos se marcan en Objetivos → Calendario laboral.</p>
          <Button type="submit" variant="dark" loading={pending} className="self-start">
            Guardar
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

// -----------------------------------------------------------------------------
function ZonesSection({ zones, weekly }: { zones: Zone[]; weekly: Record<number, string> }) {
  const { run } = useAction();
  const [editing, setEditing] = useState<Zone | "new" | null>(null);
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader
          title="Zonas comerciales"
          action={
            <Button size="sm" variant="dark" onClick={() => setEditing("new")}>
              <Plus />
              Nueva zona
            </Button>
          }
        />
        <CardBody className="pt-3">
          {zones.length === 0 ? (
            <p className="text-sm text-ink-muted">Crea zonas para agrupar poblaciones y planificar qué zona trabajas cada día.</p>
          ) : (
            <ul className="divide-y divide-line">
              {zones.map((z) => (
                <li key={z.id} className="flex items-start gap-3 py-3">
                  <span className="mt-1 size-3 shrink-0 rounded-full" style={{ background: z.color ?? "var(--ink-faint)" }} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{z.name}</p>
                    <p className="text-[13px] text-ink-muted">
                      {(z.zone_populations ?? []).map((p) => p.population).join(", ") || "Sin poblaciones"}
                      {z.daily_prospecting_target != null && ` · objetivo ${z.daily_prospecting_target} puertas/día`}
                    </p>
                  </div>
                  <Button size="icon-sm" variant="ghost" aria-label={`Editar ${z.name}`} onClick={() => setEditing(z)}>
                    <Pencil />
                  </Button>
                  <ConfirmDialog
                    trigger={
                      <Button size="icon-sm" variant="ghost" aria-label={`Archivar ${z.name}`}>
                        <Trash2 />
                      </Button>
                    }
                    title={`¿Archivar la zona «${z.name}»?`}
                    description="Los clientes y eventos conservan la referencia histórica, pero la zona dejará de aparecer en selectores y asignaciones."
                    confirmLabel="Archivar"
                    onConfirm={async () => {
                      await run(archiveZone(z.id));
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Zona por día de la semana" description="Puedes cambiarla para fechas concretas en Calendario → Planificación." />
        <CardBody className="space-y-2.5 pt-3">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <label key={d} className="flex items-center justify-between gap-3 text-sm">
              <span className="w-24 shrink-0">{WEEKDAY_LABEL[d]}</span>
              <NativeSelect className="h-9" value={weekly[d] ?? ""} onChange={(e) => run(setWeekdayZone(d, e.target.value || null))}>
                <option value="">Sin zona</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
          ))}
        </CardBody>
      </Card>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent title={editing === "new" ? "Nueva zona" : "Editar zona"}>
            <ZoneForm zone={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function ZoneForm({ zone, onDone }: { zone: Zone | null; onDone: () => void }) {
  const { run, pending } = useAction();
  const [name, setName] = useState(zone?.name ?? "");
  const [description, setDescription] = useState(zone?.description ?? "");
  const [color, setColor] = useState(zone?.color ?? "#a3386a");
  const [target, setTarget] = useState(zone?.daily_prospecting_target?.toString() ?? "");
  const [pops, setPops] = useState((zone?.zone_populations ?? []).map((p) => p.population).join("\n"));
  const [notes, setNotes] = useState(zone?.notes ?? "");
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await run(
          saveZone({
            id: zone?.id ?? null,
            name,
            description,
            color,
            daily_prospecting_target: target,
            notes,
            populations: pops.split(/[\n,;]/).map((s) => s.trim()).filter(Boolean),
          }),
        );
        if (res.ok) onDone();
      }}
    >
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field label="Nombre" htmlFor="zf-name">
          <Input id="zf-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Color" htmlFor="zf-color" optional>
          <input id="zf-color" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-14 cursor-pointer rounded-[var(--radius-field)] border border-line-strong bg-paper p-1" />
        </Field>
      </div>
      <Field label="Poblaciones incluidas" htmlFor="zf-pops" optional hint="Una por línea o separadas por comas.">
        <Textarea id="zf-pops" rows={3} value={pops} onChange={(e) => setPops(e.target.value)} />
      </Field>
      <Field label="Objetivo diario de prospección" htmlFor="zf-target" optional>
        <Input id="zf-target" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Puertas frías por día" />
      </Field>
      <Field label="Descripción" htmlFor="zf-desc" optional>
        <Input id="zf-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Notas" htmlFor="zf-notes" optional>
        <Textarea id="zf-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Button type="submit" variant="primary" loading={pending}>
        Guardar zona
      </Button>
    </form>
  );
}

// -----------------------------------------------------------------------------
function LookupSection({ kind, title, items }: { kind: "types" | "categories"; title: string; items: (EstablishmentType | ProductCategory)[] }) {
  const { run, pending } = useAction();
  const [name, setName] = useState("");
  return (
    <Card>
      <CardHeader title={title} />
      <CardBody className="pt-3">
        <ul className="divide-y divide-line">
          {items.map((it) => (
            <LookupRow key={it.id} kind={kind} item={it} />
          ))}
        </ul>
        <form
          className="mt-3 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const res = await run(saveLookup(kind, { name, sort_order: items.length + 1 }));
            if (res.ok) setName("");
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Añadir…" aria-label={`Nuevo elemento de ${title}`} className="h-9" />
          <Button type="submit" size="sm" disabled={!name.trim()} loading={pending}>
            Añadir
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

function LookupRow({ kind, item }: { kind: "types" | "categories"; item: EstablishmentType | ProductCategory }) {
  const { run } = useAction();
  const [name, setName] = useState(item.name);
  const active = "active" in item ? item.active : true;
  return (
    <li className="flex items-center gap-2 py-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== item.name && run(saveLookup(kind, { id: item.id, name }))}
        className="h-9 border-transparent hover:border-line-strong"
        aria-label="Nombre"
      />
      {kind === "types" && (
        <Switch checked={active} onCheckedChange={(v) => run(saveLookup(kind, { id: item.id, name: item.name, active: v }))} aria-label="Activo" title="Activo en formularios" />
      )}
      <ConfirmDialog
        trigger={
          <Button size="icon-sm" variant="ghost" aria-label={`Eliminar ${item.name}`}>
            <Trash2 />
          </Button>
        }
        title={`¿Eliminar «${item.name}»?`}
        description="Los registros que lo usan quedarán sin este valor. Si solo quieres ocultarlo, desactívalo."
        onConfirm={async () => {
          await run(deleteLookup(kind, item.id));
        }}
      />
    </li>
  );
}

// -----------------------------------------------------------------------------
function ResultsSection({ results }: { results: ProspectingResult[] }) {
  const { run } = useAction();
  const [name, setName] = useState("");
  return (
    <Card>
      <CardHeader
        title="Resultados de prospección"
        description="Las casillas definen las métricas: qué cuenta como contacto efectivo (se habló con quien decide), como interés y como rechazo."
      />
      <CardBody className="overflow-x-auto pt-3">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[12px] text-ink-muted">
              <th className="py-2 font-medium">Resultado</th>
              <th className="py-2 text-center font-medium">Contacto efectivo</th>
              <th className="py-2 text-center font-medium">Interés</th>
              <th className="py-2 text-center font-medium">Rechazo</th>
              <th className="py-2 text-center font-medium">Activo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {results.map((r) => {
              const save = (patch: Partial<ProspectingResult>) => run(saveResult({ ...r, ...patch }));
              return (
                <tr key={r.id}>
                  <td className="py-2">{r.name}</td>
                  {(["is_effective_contact", "is_interest", "is_rejection", "active"] as const).map((k) => (
                    <td key={k} className="py-2 text-center">
                      <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={r[k]} onChange={(e) => save({ [k]: e.target.checked })} aria-label={`${r.name}: ${k}`} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        <form
          className="mt-3 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const res = await run(saveResult({ name, is_effective_contact: false, is_interest: false, is_rejection: false, active: true, sort_order: results.length + 1 }));
            if (res.ok) setName("");
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nuevo resultado" className="h-9" aria-label="Nuevo resultado" />
          <Button type="submit" size="sm" disabled={!name.trim()}>
            Añadir
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

// -----------------------------------------------------------------------------
function ProductsSection({ products, categories }: { products: Product[]; categories: ProductCategory[] }) {
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  return (
    <Card>
      <CardHeader
        title="Catálogo de productos"
        description="Cambiar un precio no altera pedidos ya registrados."
        action={
          <Button size="sm" variant="dark" onClick={() => setEditing("new")}>
            <Plus />
            Nuevo producto
          </Button>
        }
      />
      <CardBody className="overflow-x-auto pt-3">
        {products.length === 0 ? (
          <p className="text-sm text-ink-muted">Aún no hay productos. Puedes crear pedidos con líneas libres mientras tanto.</p>
        ) : (
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[12px] text-ink-muted">
                <th className="py-2 font-medium">Producto</th>
                <th className="py-2 font-medium">Categoría</th>
                <th className="py-2 text-right font-medium">Precio</th>
                <th className="py-2 text-right font-medium">IVA</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {products.map((p) => (
                <tr key={p.id} className={p.active ? "" : "text-ink-faint"}>
                  <td className="py-2">
                    {p.name}
                    {p.reference && <span className="block text-[12px] text-ink-muted">{p.reference}</span>}
                  </td>
                  <td className="py-2">{p.category_id ? catName.get(p.category_id) : "—"}</td>
                  <td className="num py-2 text-right">{formatEUR(Number(p.price_cents))}</td>
                  <td className="num py-2 text-right">{formatPercentBp(p.vat_rate_bp)}</td>
                  <td className="py-2 text-right">
                    {!p.active && <Badge className="mr-2">Inactivo</Badge>}
                    <Button size="icon-sm" variant="ghost" aria-label={`Editar ${p.name}`} onClick={() => setEditing(p)}>
                      <Pencil />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardBody>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent title={editing === "new" ? "Nuevo producto" : "Editar producto"}>
            <ProductForm product={editing === "new" ? null : editing} categories={categories} onDone={() => setEditing(null)} />
          </DialogContent>
        )}
      </Dialog>
    </Card>
  );
}

function ProductForm({ product, categories, onDone }: { product: Product | null; categories: ProductCategory[]; onDone: () => void }) {
  const { run, pending } = useAction();
  const [name, setName] = useState(product?.name ?? "");
  const [reference, setReference] = useState(product?.reference ?? "");
  const [category, setCategory] = useState(product?.category_id ?? "");
  const [price, setPrice] = useState(product ? (Number(product.price_cents) / 100).toFixed(2).replace(".", ",") : "");
  const [vat, setVat] = useState(product ? String(product.vat_rate_bp / 100).replace(".", ",") : "21");
  const [active, setActive] = useState(product?.active ?? true);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await run(saveProduct({ id: product?.id ?? null, name, reference, category_id: category || null, price, vat, active }));
        if (res.ok) onDone();
      }}
    >
      <Field label="Nombre" htmlFor="pf-name">
        <Input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Referencia" htmlFor="pf-ref" optional>
          <Input id="pf-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label="Categoría" htmlFor="pf-cat" optional>
          <NativeSelect id="pf-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Precio de venta (€, sin IVA)" htmlFor="pf-price">
          <Input id="pf-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" />
        </Field>
        <Field label="IVA aplicable (%)" htmlFor="pf-vat">
          <Input id="pf-vat" inputMode="decimal" value={vat} onChange={(e) => setVat(e.target.value)} />
        </Field>
      </div>
      <label className="flex items-center justify-between text-sm">
        Activo (disponible en pedidos nuevos)
        <Switch checked={active} onCheckedChange={setActive} />
      </label>
      <Button type="submit" variant="primary" loading={pending}>
        Guardar producto
      </Button>
    </form>
  );
}

// -----------------------------------------------------------------------------
const euros = (c: number) => (c / 100).toFixed(2).replace(".", ",");

function CommissionSection({ commission, tiers }: { commission: CommissionSettings; tiers: CommissionTier[] }) {
  const { run, pending } = useAction();
  const [method, setMethod] = useState(commission.method);
  const [confirmed, setConfirmed] = useState(commission.method_confirmed);
  const [baseType, setBaseType] = useState(commission.base_type);
  const [rows, setRows] = useState(tiers.map((t) => ({ lower: euros(t.lowerCents), lower_inclusive: t.lowerInclusive, rate: String(t.rateBp / 100).replace(".", ",") })));
  const [sample, setSample] = useState("8.500");

  const parsed: CommissionTier[] = rows
    .map((r) => ({ lowerCents: parseEurosToCents(r.lower) ?? -1, lowerInclusive: r.lower_inclusive, rateBp: Math.round(Number(r.rate.replace(",", ".")) * 100) }))
    .filter((t) => t.lowerCents >= 0 && Number.isFinite(t.rateBp));
  const sampleCents = parseEurosToCents(sample) ?? 0;
  const flat = computeCommission(sampleCents, parsed, "flat");
  const marginal = computeCommission(sampleCents, parsed, "marginal");

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Escala de comisiones" description="Cada tramo empieza en su límite inferior. Indica si ese importe exacto pertenece al tramo." />
        <CardBody>
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              void run(saveCommissionSettings({ method, method_confirmed: confirmed, base_type: baseType, tiers: rows }));
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Método de cálculo" htmlFor="cm-method">
                <NativeSelect id="cm-method" value={method} onChange={(e) => setMethod(e.target.value as "flat" | "marginal")}>
                  <option value="flat">A · Porcentaje del tramo sobre toda la facturación</option>
                  <option value="marginal">B · Cada porcentaje solo sobre su tramo</option>
                </NativeSelect>
              </Field>
              <Field label="Base de cálculo" htmlFor="cm-base">
                <NativeSelect id="cm-base" value={baseType} onChange={(e) => setBaseType(e.target.value as "net" | "gross")}>
                  <option value="net">Base imponible (sin IVA)</option>
                  <option value="gross">Importe total (con IVA)</option>
                </NativeSelect>
              </Field>
            </div>
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_6rem_auto] items-end gap-2">
                  <Field label={i === 0 ? "Desde (€)" : ""} htmlFor={`t-l-${i}`}>
                    <Input id={`t-l-${i}`} inputMode="decimal" value={r.lower} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, lower: e.target.value } : x)))} />
                  </Field>
                  <label className="flex h-10 items-center gap-2 text-[13px] whitespace-nowrap">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--accent)]"
                      checked={r.lower_inclusive}
                      onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, lower_inclusive: e.target.checked } : x)))}
                    />
                    incluido
                  </label>
                  <Field label={i === 0 ? "%" : ""} htmlFor={`t-r-${i}`}>
                    <Input id={`t-r-${i}`} inputMode="decimal" value={r.rate} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, rate: e.target.value } : x)))} />
                  </Field>
                  <Button type="button" size="icon" variant="ghost" aria-label="Quitar tramo" disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={() => setRows((rs) => [...rs, { lower: "", lower_inclusive: true, rate: "" }])}>
                <Plus />
                Añadir tramo
              </Button>
            </div>
            <label className="flex items-start justify-between gap-3 rounded-[var(--radius-field)] bg-sunken p-3 text-sm">
              <span>
                <span className="font-medium">He confirmado con mi empresa este método</span>
                <span className="block text-[13px] text-ink-muted">Mientras no lo marques, la comisión se muestra como «Estimación provisional».</span>
              </span>
              <Switch checked={confirmed} onCheckedChange={setConfirmed} />
            </label>
            <Button type="submit" variant="dark" loading={pending} className="self-start">
              Guardar escala
            </Button>
          </form>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Simulador" description="Compara ambos métodos con la escala actual." />
        <CardBody className="space-y-4">
          <Field label="Ventas computables (€)" htmlFor="cm-sample">
            <Input id="cm-sample" inputMode="decimal" value={sample} onChange={(e) => setSample(e.target.value)} />
          </Field>
          <dl className="space-y-3 text-sm">
            <div className={method === "flat" ? "font-medium" : ""}>
              <dt className="text-[12px] text-ink-muted">A · Sobre toda la facturación</dt>
              <dd className="num">
                {formatEUR(flat.amountCents)} <span className="text-ink-muted">({flat.tierLabel}, {formatPercentBp(flat.rateBp)})</span>
              </dd>
            </div>
            <div className={method === "marginal" ? "font-medium" : ""}>
              <dt className="text-[12px] text-ink-muted">B · Marginal por tramos</dt>
              <dd className="num">{formatEUR(marginal.amountCents)}</dd>
              <dd className="text-[12px] text-ink-muted">{marginal.breakdown.map((b) => `${formatPercentBp(b.rateBp)} de ${formatEUR(b.portionCents)}`).join(" + ") || "—"}</dd>
            </div>
            {flat.next && (
              <div>
                <dt className="text-[12px] text-ink-muted">Siguiente tramo</dt>
                <dd className="num">faltan {formatEUR(flat.next.remainingCents)}</dd>
              </div>
            )}
          </dl>
        </CardBody>
      </Card>
    </div>
  );
}

// -----------------------------------------------------------------------------
function CountableSection({ settings }: { settings: AppSettings }) {
  const { run, pending } = useAction();
  const [sel, setSel] = useState<string[]>(settings.countable_order_statuses);
  const options = ORDER_STATUSES.filter((s) => s !== "draft" && s !== "cancelled");
  return (
    <Card>
      <CardHeader
        title="Estados de pedido que computan"
        description="Qué pedidos cuentan para objetivos de facturación y comisiones. Borradores y cancelados nunca cuentan. Las devoluciones se descuentan en el mes en que se registran."
      />
      <CardBody>
        <div className="flex flex-col gap-2">
          {options.map((s) => (
            <label key={s} className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-[var(--accent)]"
                checked={sel.includes(s)}
                onChange={(e) => setSel((xs) => (e.target.checked ? [...xs, s] : xs.filter((x) => x !== s)))}
              />
              {ORDER_STATUS_LABEL[s]}
            </label>
          ))}
        </div>
        <Button variant="dark" className="mt-5" loading={pending} onClick={() => run(updateSettings({ countable_order_statuses: sel }))}>
          Guardar
        </Button>
      </CardBody>
    </Card>
  );
}

// -----------------------------------------------------------------------------
function DataSection({ hasDemo }: { hasDemo: boolean }) {
  const { run, pending } = useAction();
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Datos de demostración" description="Para probar la aplicación sin tocar tus datos reales." />
        <CardBody className="space-y-3 text-sm">
          <p className="text-ink-muted">
            Genera establecimientos, actividades, visitas, pedidos y productos ficticios marcados con «[DEMO]». No contienen nombres, teléfonos ni ventas reales. Se
            eliminan con un solo botón sin afectar al resto.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="dark" disabled={hasDemo} loading={pending} onClick={() => run(generateDemoData())}>
              <Database />
              Generar datos de demostración
            </Button>
            <ConfirmDialog
              trigger={
                <Button disabled={!hasDemo} variant="secondary">
                  <Trash2 />
                  Eliminar datos de demostración
                </Button>
              }
              title="¿Eliminar los datos de demostración?"
              description="Se borrarán únicamente los registros marcados como demostración. Tus datos reales se conservan."
              onConfirm={async () => {
                await run(deleteDemoData());
              }}
            />
          </div>
          {hasDemo && <p className="text-[13px] text-warning">Hay datos de demostración activos: las estadísticas los incluyen.</p>}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Exportación y copias de seguridad" />
        <CardBody className="space-y-3 text-sm">
          <p className="text-ink-muted">Descarga tus datos en CSV (se abren en Excel):</p>
          <div className="flex flex-wrap gap-2">
            {[
              ["clientes", "Clientes"],
              ["prospecciones", "Prospecciones (último año)"],
              ["visitas", "Visitas"],
              ["pedidos", "Pedidos (último año)"],
              ["seguimientos", "Seguimientos"],
            ].map(([k, l]) => (
              <Button key={k} asChild size="sm">
                <a href={`/api/exportar/${k}`}>{l}</a>
              </Button>
            ))}
          </div>
          <p className="text-[13px] text-ink-muted">
            Supabase realiza copias diarias en los planes de pago. Para una copia completa de la base de datos, consulta la sección «Copias de seguridad» del README
            (pg_dump con la cadena de conexión del proyecto).
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
