"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Building2,
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  DoorOpen,
  Home,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  ShoppingBag,
  Target,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { useQuickActions } from "./quick-actions";
import { searchCustomers, type CustomerSuggestion } from "@/lib/actions/customers";
import { signOut } from "@/lib/actions/auth";
import { CUSTOMER_STATUS_LABEL } from "@/lib/labels";
import { useLookups } from "./lookups";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Inicio", icon: Home, mobile: true },
  { href: "/prospeccion", label: "Prospección", icon: DoorOpen, mobile: true },
  { href: "/calendario", label: "Calendario", icon: CalendarDays, mobile: true },
  { href: "/clientes", label: "Clientes", icon: Users, mobile: true },
  { href: "/ventas", label: "Ventas", icon: ShoppingBag, mobile: true },
  { href: "/seguimientos", label: "Seguimientos", icon: ClipboardList, mobile: false },
  { href: "/estadisticas", label: "Estadísticas", icon: BarChart3, mobile: false },
  { href: "/objetivos", label: "Objetivos", icon: Target, mobile: false },
  { href: "/configuracion", label: "Configuración", icon: Settings, mobile: false },
] as const;

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

export function AppShell({
  children,
  userLabel,
  todayZone,
}: {
  children: React.ReactNode;
  userLabel: string;
  todayZone: { name: string; color: string | null } | null;
}) {
  const path = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-dvh lg:pl-60">
      {/* Barra lateral (escritorio) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-paper lg:flex">
        <div className="flex h-16 items-center gap-2.5 px-5">
          <Logo />
          <span className="text-[15px] font-semibold tracking-[-0.01em]">CRM Comercial</span>
        </div>
        <nav className="flex-1 space-y-0.5 px-3 py-2" aria-label="Principal">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isActive(path, n.href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-sunken hover:text-ink",
                isActive(path, n.href) && "bg-sunken text-ink",
              )}
            >
              <n.icon className="size-[18px]" strokeWidth={1.8} />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <UserMenu label={userLabel} />
        </div>
      </aside>

      {/* Barra superior */}
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur supports-[backdrop-filter]:bg-canvas/75">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:px-6 lg:h-16 lg:px-8">
          <div className="flex items-center gap-2 lg:hidden">
            <Logo />
          </div>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-field)] border border-line bg-paper px-3 text-left text-sm text-ink-faint transition-colors hover:border-line-strong lg:max-w-md"
          >
            <Search className="size-4 shrink-0" />
            <span className="truncate">Buscar cliente, población, teléfono…</span>
            <kbd className="ml-auto hidden rounded border border-line px-1.5 text-[11px] text-ink-faint lg:inline">Ctrl K</kbd>
          </button>
          {todayZone && (
            <Link
              href="/calendario"
              className="hidden items-center gap-2 rounded-full border border-line bg-paper px-3 py-1.5 text-[13px] text-ink-muted sm:flex"
              title="Zona comercial prevista para hoy"
            >
              <span className="size-2 rounded-full" style={{ background: todayZone.color ?? "var(--ink-faint)" }} />
              Hoy: <span className="font-medium text-ink">{todayZone.name}</span>
            </Link>
          )}
          <div className="ml-auto hidden lg:block">
            <QuickMenu />
          </div>
          <MobileMore userLabel={userLabel} />
        </div>
      </header>

      <main className="pb-safe-nav mx-auto max-w-7xl px-4 pt-5 sm:px-6 lg:px-8 lg:pt-7">{children}</main>

      {/* Acción rápida (móvil) */}
      <div className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 lg:hidden">
        <QuickMenu fab />
      </div>

      {/* Navegación inferior (móvil) */}
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="grid grid-cols-5">
          {NAV.filter((n) => n.mobile).map((n) => {
            const active = isActive(path, n.href);
            return (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-ink-faint", active && "text-ink")}
                >
                  <n.icon className={cn("size-[22px]", active && "text-accent")} strokeWidth={active ? 2.2 : 1.8} />
                  {n.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}

function Logo() {
  return (
    <span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-ink" aria-hidden>
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M6 5v14M10 5v14M14 5v14M18 5v14M4 16 20 8" />
      </svg>
    </span>
  );
}

function QuickMenu({ fab = false }: { fab?: boolean }) {
  const qa = useQuickActions();
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        {fab ? (
          <button
            type="button"
            aria-label="Acciones rápidas"
            className="grid size-14 place-items-center rounded-full bg-ink text-paper shadow-pop transition-transform active:scale-95"
          >
            <Plus className="size-6" />
          </button>
        ) : (
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-field)] bg-ink px-4 text-sm font-medium text-paper hover:opacity-90"
          >
            <Plus className="size-4" />
            Crear
          </button>
        )}
      </DropdownTrigger>
      <DropdownContent align="end" side={fab ? "top" : "bottom"} className="w-60">
        <DropdownItem onSelect={() => qa.open({ kind: "prospecting" })}>
          <Zap />
          Nueva prospección
        </DropdownItem>
        <DropdownItem onSelect={() => qa.tallyColdCall()}>
          <DoorOpen />
          +1 puerta fría (sin datos)
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem onSelect={() => qa.open({ kind: "event" })}>
          <CalendarPlus />
          Programar visita
        </DropdownItem>
        <DropdownItem onSelect={() => qa.open({ kind: "visit" })}>
          <Building2 />
          Registrar visita realizada
        </DropdownItem>
        <DropdownItem onSelect={() => qa.open({ kind: "followup" })}>
          <ClipboardList />
          Nuevo seguimiento
        </DropdownItem>
        <DropdownItem onSelect={() => qa.open({ kind: "customer" })}>
          <UserPlus />
          Nuevo cliente
        </DropdownItem>
        <DropdownItem asChild>
          <Link href="/ventas/nuevo">
            <ShoppingBag />
            Nuevo pedido
          </Link>
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}

function UserMenu({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sunken text-[13px] font-semibold text-ink-muted">
        {label.slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-ink-muted">{label}</span>
      <form action={signOut}>
        <button type="submit" className="rounded-md p-2 text-ink-muted hover:bg-sunken hover:text-ink" aria-label="Cerrar sesión" title="Cerrar sesión">
          <LogOut className="size-4" />
        </button>
      </form>
    </div>
  );
}

function MobileMore({ userLabel }: { userLabel: string }) {
  const router = useRouter();
  return (
    <div className="lg:hidden">
      <Dropdown>
        <DropdownTrigger asChild>
          <button type="button" className="grid size-10 place-items-center rounded-[var(--radius-field)] text-ink-muted hover:bg-sunken" aria-label="Más secciones">
            <Menu className="size-5" />
          </button>
        </DropdownTrigger>
        <DropdownContent className="w-56">
          {NAV.filter((n) => !n.mobile).map((n) => (
            <DropdownItem key={n.href} onSelect={() => router.push(n.href)}>
              <n.icon />
              {n.label}
            </DropdownItem>
          ))}
          <DropdownSeparator />
          <div className="truncate px-2.5 py-1.5 text-[12px] text-ink-muted">{userLabel}</div>
          <DropdownItem onSelect={() => void signOut()}>
            <LogOut />
            Cerrar sesión
          </DropdownItem>
        </DropdownContent>
      </Dropdown>
    </div>
  );
}

function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const { types } = useLookups();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<CustomerSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!open) {
      setQ("");
      setItems([]);
    }
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setItems([]);
      return;
    }
    let live = true;
    setLoading(true);
    const t = setTimeout(async () => {
      const res = await searchCustomers(term, 12).catch(() => []);
      if (live) {
        setItems(res);
        setActive(0);
        setLoading(false);
      }
    }, 160);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  const go = (id: string) => {
    onOpenChange(false);
    router.push(`/clientes/${id}`);
  };
  const typeName = (id: string | null) => types.find((t) => t.id === id)?.name;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <DialogPrimitive.Content className="fixed inset-x-3 top-3 z-50 mx-auto max-w-xl overflow-hidden rounded-2xl border border-line bg-paper shadow-pop sm:top-[12vh]">
          <DialogPrimitive.Title className="sr-only">Buscar clientes</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Busca por nombre, población, teléfono o tipo de establecimiento.</DialogPrimitive.Description>
          <div className="flex items-center gap-2 border-b border-line px-4">
            <Search className="size-4 text-ink-faint" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, items.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === "Enter" && items[active]) go(items[active].id);
              }}
              placeholder="Nombre, población, teléfono o tipo de establecimiento"
              className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-faint"
              aria-label="Buscar"
            />
          </div>
          <ul className="max-h-[60vh] overflow-y-auto p-2" role="listbox">
            {q.trim().length < 2 && <li className="px-3 py-6 text-center text-sm text-ink-muted">Escribe al menos dos caracteres.</li>}
            {q.trim().length >= 2 && !loading && items.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-ink-muted">No hay clientes que coincidan con «{q.trim()}».</li>
            )}
            {items.map((c, i) => (
              <li key={c.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onClick={() => go(c.id)}
                  onMouseEnter={() => setActive(i)}
                  className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left", i === active && "bg-sunken")}
                >
                  <Building2 className="size-4 shrink-0 text-ink-faint" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.trade_name}</span>
                    <span className="block truncate text-[13px] text-ink-muted">
                      {[c.city, typeName(c.establishment_type_id), c.phone].filter(Boolean).join(" · ") || "Sin datos de contacto"}
                    </span>
                  </span>
                  <span className="hidden text-[12px] text-ink-muted sm:block">
                    {CUSTOMER_STATUS_LABEL[c.status as keyof typeof CUSTOMER_STATUS_LABEL]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
