"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Building2, Check, Plus, X } from "lucide-react";
import { searchCustomers, type CustomerSuggestion } from "@/lib/actions/customers";
import { CUSTOMER_STATUS_LABEL } from "@/lib/labels";
import { fieldBase } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface PickedCustomer {
  id: string;
  trade_name: string;
  city: string | null;
  status?: string;
}

/**
 * Selector de establecimiento con búsqueda. Permite elegir uno existente
 * o escribir uno nuevo (allowNew). Sugiere coincidencias para evitar duplicados
 * pero nunca bloquea crear uno nuevo.
 */
export function CustomerPicker({
  value,
  onChange,
  text,
  onTextChange,
  allowNew = false,
  placeholder = "Buscar por nombre, población o teléfono",
  autoFocus,
  invalid,
  id,
}: {
  value: PickedCustomer | null;
  onChange: (c: PickedCustomer | null) => void;
  text?: string;
  onTextChange?: (t: string) => void;
  allowNew?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  invalid?: boolean;
  id?: string;
}) {
  const [query, setQuery] = useState(text ?? "");
  const [items, setItems] = useState<CustomerSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const listId = useId();
  const seq = useRef(0);

  useEffect(() => {
    if (value) return;
    const q = query.trim();
    if (q.length < 2) {
      setItems([]);
      return;
    }
    const n = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await searchCustomers(q);
        if (n === seq.current) setItems(res);
      } finally {
        if (n === seq.current) setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [query, value]);

  if (value) {
    return (
      <div className={cn(fieldBase, "flex h-10 items-center gap-2")}>
        <Building2 className="size-4 shrink-0 text-ink-muted" />
        <span className="min-w-0 flex-1 truncate">
          {value.trade_name}
          {value.city && <span className="text-ink-muted"> · {value.city}</span>}
        </span>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setQuery("");
            onTextChange?.("");
          }}
          className="rounded p-1 text-ink-muted hover:bg-sunken hover:text-ink"
          aria-label="Quitar establecimiento"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  const choose = (c: CustomerSuggestion) => {
    onChange({ id: c.id, trade_name: c.trade_name, city: c.city, status: c.status });
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={open && (items.length > 0 || (allowNew && query.trim().length > 0))}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid || undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        className={cn(fieldBase, "h-10")}
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onTextChange?.(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, items.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && items[active]) {
            e.preventDefault();
            choose(items[active]);
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && query.trim().length >= 2 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border border-line bg-paper p-1 shadow-pop"
        >
          {items.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(c);
              }}
              className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm", i === active && "bg-sunken")}
            >
              <Check className="size-4 text-ink-faint" />
              <span className="min-w-0 flex-1 truncate">
                {c.trade_name}
                {c.city && <span className="text-ink-muted"> · {c.city}</span>}
              </span>
              <span className="hidden text-[12px] text-ink-muted sm:inline">
                {CUSTOMER_STATUS_LABEL[c.status as keyof typeof CUSTOMER_STATUS_LABEL]}
              </span>
            </li>
          ))}
          {!loading && items.length === 0 && !allowNew && <li className="px-2.5 py-2 text-sm text-ink-muted">Sin coincidencias</li>}
          {allowNew && (
            <li
              role="option"
              aria-selected={false}
              onMouseDown={(e) => {
                e.preventDefault();
                setOpen(false);
              }}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-ink-muted hover:bg-sunken"
            >
              <Plus className="size-4" />
              <span className="truncate">
                {items.length ? "Ninguno: crear" : "Crear"} «{query.trim()}» como nuevo
              </span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
