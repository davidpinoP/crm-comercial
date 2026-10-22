-- ARCHIVO GENERADO: todas las migraciones de supabase/migrations concatenadas en orden.
-- Pégalo completo en el SQL Editor de Supabase para crear la base de datos de una vez.

-- =============================================================================
-- CRM Comercial — Esquema inicial
-- Convenciones:
--   * Importes monetarios en céntimos de euro (bigint). Nunca float.
--   * Tipos impositivos y descuentos en puntos básicos (bp): 2100 = 21,00 %.
--   * Toda fila pertenece a un usuario (user_id) y está protegida por RLS.
--   * Eliminación lógica (deleted_at / archived_at) donde hay historial.
--   * client_request_id + índice único = idempotencia frente a reenvíos.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Utilidades
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Perfil y configuración
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  phone       text,
  company     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.app_settings (
  user_id                     uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  inactivity_days             integer not null default 60 check (inactivity_days between 1 and 3650),
  cohort_maturity_days        integer not null default 60 check (cohort_maturity_days between 1 and 3650),
  -- Estados de pedido que computan para objetivos y comisiones
  countable_order_statuses    text[]  not null default array['confirmed','delivered','invoiced','paid','partially_returned'],
  -- Calendario laboral por defecto (1 = lunes … 7 = domingo)
  working_weekdays            integer[] not null default array[1,2,3,4,5],
  default_work_hours          numeric(4,2) not null default 8 check (default_work_hours between 0 and 24),
  work_start_time             time not null default '09:00',
  work_end_time               time not null default '18:00',
  -- Definición de visita de cierre: tipos de visita elegibles
  close_rate_include_followups boolean not null default false,
  theme                       text not null default 'system' check (theme in ('system','light','dark')),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Catálogos configurables
-- -----------------------------------------------------------------------------
create table public.establishment_types (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 80),
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name)
);

-- Resultados de prospección configurables. Las banderas definen las métricas:
--   is_effective_contact → numerador de la tasa de contacto efectivo
--   is_interest          → numerador de la tasa de interés
--   is_rejection         → aparece en «motivos de rechazo»
create table public.prospecting_results (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code                 text not null check (code ~ '^[a-z0-9_]{1,40}$'),
  name                 text not null check (length(trim(name)) between 1 and 80),
  is_effective_contact boolean not null default false,
  is_interest          boolean not null default false,
  is_rejection         boolean not null default false,
  sort_order           integer not null default 0,
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (user_id, code)
);

create table public.product_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 80),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name)
);

-- -----------------------------------------------------------------------------
-- Zonas comerciales
-- -----------------------------------------------------------------------------
create table public.commercial_zones (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name                      text not null check (length(trim(name)) between 1 and 80),
  description               text,
  color                     text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  daily_prospecting_target  integer check (daily_prospecting_target is null or daily_prospecting_target >= 0),
  notes                     text,
  is_demo                   boolean not null default false,
  archived_at               timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create table public.zone_populations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  zone_id     uuid not null references public.commercial_zones(id) on delete cascade,
  population  text not null check (length(trim(population)) between 1 and 120),
  created_at  timestamptz not null default now(),
  unique (zone_id, population)
);

-- Zona por defecto para cada día de la semana
create table public.zone_weekday_assignments (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  weekday     integer not null check (weekday between 1 and 7),
  zone_id     uuid not null references public.commercial_zones(id) on delete cascade,
  primary key (user_id, weekday)
);

-- Sobrescritura para una fecha concreta (zone_id nulo = sin zona ese día)
create table public.zone_date_overrides (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date        date not null,
  zone_id     uuid references public.commercial_zones(id) on delete cascade,
  note        text,
  primary key (user_id, date)
);

-- -----------------------------------------------------------------------------
-- Clientes y prospectos
-- -----------------------------------------------------------------------------
create table public.customers (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trade_name              text not null check (length(trim(trade_name)) between 1 and 160),
  legal_name              text,
  establishment_type_id   uuid references public.establishment_types(id) on delete set null,
  contact_name            text,
  phone                   text,
  email                   text,
  address                 text,
  city                    text,
  province                text,
  postal_code             text,
  zone_id                 uuid references public.commercial_zones(id) on delete set null,
  status                  text not null default 'prospect_uncontacted' check (status in (
                            'prospect_uncontacted','prospect_contacted','interested','follow_up_pending',
                            'visit_scheduled','customer_new','customer_active','customer_inactive','customer_lost')),
  first_contact_date      date,
  customer_since_date     date,
  next_action             text,
  next_follow_up_date     date,
  competitor_brands       text,
  products_of_interest    text,
  estimated_potential_cents bigint check (estimated_potential_cents is null or estimated_potential_cents >= 0),
  estimated_purchase_frequency text,
  notes                   text,
  latitude                double precision check (latitude is null or latitude between -90 and 90),
  longitude               double precision check (longitude is null or longitude between -180 and 180),
  merged_into_id          uuid references public.customers(id) on delete set null,
  is_demo                 boolean not null default false,
  archived_at             timestamptz,
  client_request_id       uuid,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create unique index customers_request_uq on public.customers(user_id, client_request_id) where client_request_id is not null;
create index customers_user_status_idx on public.customers(user_id, status) where archived_at is null;
create index customers_user_city_idx on public.customers(user_id, lower(city));
create index customers_user_name_idx on public.customers(user_id, lower(trade_name));

create table public.customer_status_history (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  customer_id  uuid not null references public.customers(id) on delete cascade,
  from_status  text,
  to_status    text not null,
  changed_at   timestamptz not null default now(),
  note         text
);
create index csh_customer_idx on public.customer_status_history(customer_id, changed_at desc);
create index csh_user_changed_idx on public.customer_status_history(user_id, changed_at);

-- -----------------------------------------------------------------------------
-- Calendario
-- -----------------------------------------------------------------------------
create table public.calendar_events (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title               text not null check (length(trim(title)) between 1 and 160),
  event_type          text not null check (event_type in (
                        'cold_call','customer_visit','prospect_visit','phone_follow_up',
                        'meeting','restock','route','other')),
  customer_id         uuid references public.customers(id) on delete set null,
  starts_at           timestamptz not null,
  ends_at             timestamptz,
  city                text,
  address             text,
  zone_id             uuid references public.commercial_zones(id) on delete set null,
  notes               text,
  status              text not null default 'scheduled' check (status in (
                        'scheduled','done','cancelled','rescheduled','not_done')),
  reminder_minutes    integer check (reminder_minutes is null or reminder_minutes between 0 and 10080),
  rescheduled_to_id   uuid references public.calendar_events(id) on delete set null,
  is_demo             boolean not null default false,
  deleted_at          timestamptz,
  client_request_id   uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
create unique index calendar_events_request_uq on public.calendar_events(user_id, client_request_id) where client_request_id is not null;
create index calendar_events_user_start_idx on public.calendar_events(user_id, starts_at) where deleted_at is null;
create index calendar_events_customer_idx on public.calendar_events(customer_id);

-- -----------------------------------------------------------------------------
-- Prospección (puertas frías)
-- -----------------------------------------------------------------------------
create table public.prospecting_activities (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null default auth.uid() references auth.users(id) on delete cascade,
  occurred_at             timestamptz not null default now(),
  customer_id             uuid references public.customers(id) on delete set null,
  -- Instantánea del texto introducido (útil si el cliente se renombra o fusiona)
  establishment_name      text,
  city                    text,
  establishment_type_id   uuid references public.establishment_types(id) on delete set null,
  contact_name            text,
  result_id               uuid references public.prospecting_results(id) on delete set null,
  notes                   text,
  next_action             text,
  follow_up_date          date,
  -- Provisional: sólo cuenta la puerta fría; datos pendientes de completar
  is_provisional          boolean not null default false,
  is_demo                 boolean not null default false,
  deleted_at              timestamptz,
  client_request_id       uuid,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  -- Una actividad no provisional debe identificar el establecimiento
  constraint prospecting_identified check (
    is_provisional or customer_id is not null or coalesce(length(trim(establishment_name)),0) > 0
  )
);
create unique index prospecting_request_uq on public.prospecting_activities(user_id, client_request_id) where client_request_id is not null;
create index prospecting_user_occurred_idx on public.prospecting_activities(user_id, occurred_at desc) where deleted_at is null;
create index prospecting_customer_idx on public.prospecting_activities(customer_id, occurred_at desc);

-- -----------------------------------------------------------------------------
-- Visitas comerciales realizadas (una fila = una visita física)
-- -----------------------------------------------------------------------------
create table public.visits (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  customer_id              uuid not null references public.customers(id) on delete cascade,
  occurred_at              timestamptz not null default now(),
  -- prospect: el establecimiento no era cliente al visitarlo; customer: cliente actual
  visit_kind               text not null check (visit_kind in ('prospect','customer')),
  -- false para visitas puramente administrativas → excluidas de la tasa de cierre
  is_commercial            boolean not null default true,
  calendar_event_id        uuid references public.calendar_events(id) on delete set null,
  prospecting_activity_id  uuid references public.prospecting_activities(id) on delete set null,
  outcome_result_id        uuid references public.prospecting_results(id) on delete set null,
  notes                    text,
  is_demo                  boolean not null default false,
  deleted_at               timestamptz,
  client_request_id        uuid,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
-- Un evento del calendario genera como máximo UNA visita (evita doble cómputo)
create unique index visits_event_uq on public.visits(calendar_event_id) where calendar_event_id is not null;
-- Una prospección se vincula como máximo a una visita
create unique index visits_prospecting_uq on public.visits(prospecting_activity_id) where prospecting_activity_id is not null;
create unique index visits_request_uq on public.visits(user_id, client_request_id) where client_request_id is not null;
create index visits_user_occurred_idx on public.visits(user_id, occurred_at desc) where deleted_at is null;
create index visits_customer_idx on public.visits(customer_id, occurred_at desc);

-- -----------------------------------------------------------------------------
-- Seguimientos
-- -----------------------------------------------------------------------------
create table public.follow_ups (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users(id) on delete cascade,
  customer_id           uuid not null references public.customers(id) on delete cascade,
  follow_up_type        text not null default 'call' check (follow_up_type in (
                          'call','visit','email','catalog_presentation','restock','win_back','other')),
  due_date              date,
  reason                text,
  notes                 text,
  status                text not null default 'pending' check (status in ('pending','done','cancelled')),
  completed_at          timestamptz,
  result                text,
  next_action           text,
  source_activity_id    uuid references public.prospecting_activities(id) on delete set null,
  previous_follow_up_id uuid references public.follow_ups(id) on delete set null,
  is_demo               boolean not null default false,
  client_request_id     uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check ((status = 'done') = (completed_at is not null))
);
create unique index follow_ups_request_uq on public.follow_ups(user_id, client_request_id) where client_request_id is not null;
create index follow_ups_user_status_due_idx on public.follow_ups(user_id, status, due_date);
create index follow_ups_customer_idx on public.follow_ups(customer_id);

-- -----------------------------------------------------------------------------
-- Catálogo, pedidos y devoluciones
-- -----------------------------------------------------------------------------
create table public.products (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name          text not null check (length(trim(name)) between 1 and 160),
  reference     text,
  category_id   uuid references public.product_categories(id) on delete set null,
  price_cents   bigint not null check (price_cents >= 0),
  vat_rate_bp   integer not null default 2100 check (vat_rate_bp between 0 and 10000),
  active        boolean not null default true,
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index products_reference_uq on public.products(user_id, reference) where reference is not null;

create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  customer_id         uuid not null references public.customers(id) on delete restrict,
  order_date          date not null,
  order_number        text,
  status              text not null default 'draft' check (status in (
                        'draft','confirmed','delivered','invoiced','paid','cancelled',
                        'partially_returned','fully_returned')),
  notes               text,
  delivery_date       date,
  paid_date           date,
  visit_id            uuid references public.visits(id) on delete set null,
  is_demo             boolean not null default false,
  deleted_at          timestamptz,
  client_request_id   uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index orders_request_uq on public.orders(user_id, client_request_id) where client_request_id is not null;
create unique index orders_number_uq on public.orders(user_id, order_number) where order_number is not null and deleted_at is null;
create index orders_user_date_idx on public.orders(user_id, order_date) where deleted_at is null;
create index orders_customer_idx on public.orders(customer_id, order_date desc);

-- Cada línea conserva una instantánea de precio, descuento e IVA.
-- Los importes de línea se calculan en la aplicación (src/lib/domain/money.ts)
-- y se validan aquí para que nunca diverjan de sus componentes.
create table public.order_items (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  order_id            uuid not null references public.orders(id) on delete cascade,
  product_id          uuid references public.products(id) on delete set null,
  description         text not null check (length(trim(description)) between 1 and 200),
  category_id         uuid references public.product_categories(id) on delete set null,
  quantity            numeric(12,3) not null check (quantity > 0),
  unit_price_cents    bigint not null check (unit_price_cents >= 0),
  discount_bp         integer not null default 0 check (discount_bp between 0 and 10000),
  vat_rate_bp         integer not null check (vat_rate_bp between 0 and 10000),
  base_cents          bigint not null check (base_cents >= 0),
  vat_cents           bigint not null check (vat_cents >= 0),
  total_cents         bigint not null check (total_cents = base_cents + vat_cents),
  position            integer not null default 0,
  created_at          timestamptz not null default now(),
  check (base_cents = round(quantity * unit_price_cents * (10000 - discount_bp) / 10000.0)),
  check (vat_cents = round(base_cents * vat_rate_bp / 10000.0))
);
create index order_items_order_idx on public.order_items(order_id, position);

-- Devoluciones / abonos: no borran el pedido original; se restan de la base computable
create table public.order_returns (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  order_id      uuid not null references public.orders(id) on delete cascade,
  return_date   date not null,
  reason        text,
  base_cents    bigint not null check (base_cents > 0),
  vat_cents     bigint not null check (vat_cents >= 0),
  total_cents   bigint not null check (total_cents = base_cents + vat_cents),
  is_demo       boolean not null default false,
  client_request_id uuid,
  created_at    timestamptz not null default now()
);
create unique index order_returns_request_uq on public.order_returns(user_id, client_request_id) where client_request_id is not null;
create index order_returns_order_idx on public.order_returns(order_id);
create index order_returns_user_date_idx on public.order_returns(user_id, return_date);

create table public.order_status_history (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  order_id     uuid not null references public.orders(id) on delete cascade,
  from_status  text,
  to_status    text not null,
  changed_at   timestamptz not null default now()
);
create index osh_order_idx on public.order_status_history(order_id, changed_at);

-- Totales derivados (no se almacenan: siempre coherentes con las líneas)
create view public.order_totals with (security_invoker = true) as
select o.id as order_id,
       o.user_id,
       coalesce(sum(i.base_cents), 0)::bigint  as base_cents,
       coalesce(sum(i.vat_cents), 0)::bigint   as vat_cents,
       coalesce(sum(i.total_cents), 0)::bigint as total_cents,
       coalesce((select sum(r.base_cents)  from public.order_returns r where r.order_id = o.id), 0)::bigint as returned_base_cents,
       coalesce((select sum(r.total_cents) from public.order_returns r where r.order_id = o.id), 0)::bigint as returned_total_cents
from public.orders o
left join public.order_items i on i.order_id = o.id
group by o.id, o.user_id;

-- -----------------------------------------------------------------------------
-- Comisiones
-- -----------------------------------------------------------------------------
create table public.commission_settings (
  user_id        uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  -- flat: tasa del tramo alcanzado sobre toda la base; marginal: cada tasa sobre su porción
  method         text not null default 'flat' check (method in ('flat','marginal')),
  -- Hasta que el usuario confirme el método de su empresa → «Estimación provisional»
  method_confirmed boolean not null default false,
  -- Base de cálculo: imponible (sin IVA) o total con IVA
  base_type      text not null default 'net' check (base_type in ('net','gross')),
  updated_at     timestamptz not null default now()
);

-- Tramos: [lower, upper) por defecto; lower_inclusive controla el tratamiento del límite inferior.
create table public.commission_tiers (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lower_cents      bigint not null check (lower_cents >= 0),
  lower_inclusive  boolean not null default true,
  rate_bp          integer not null check (rate_bp between 0 and 10000),
  created_at       timestamptz not null default now(),
  unique (user_id, lower_cents)
);

create table public.commission_calculations (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  period_month       date not null check (extract(day from period_month) = 1),
  gross_sales_cents  bigint not null,
  returns_cents      bigint not null,
  base_cents         bigint not null,
  method             text not null check (method in ('flat','marginal')),
  base_type          text not null check (base_type in ('net','gross')),
  tier_label         text not null,
  rate_bp            integer not null,
  amount_cents       bigint not null,
  order_ids          uuid[] not null default '{}',
  tiers_snapshot     jsonb not null,
  is_provisional     boolean not null default true,
  calculated_at      timestamptz not null default now(),
  -- Liquidación: sólo con registro explícito
  settled_at         timestamptz,
  settled_amount_cents bigint,
  settlement_note    text,
  check ((settled_at is null) = (settled_amount_cents is null))
);
create index commission_calc_user_period_idx on public.commission_calculations(user_id, period_month, calculated_at desc);

-- -----------------------------------------------------------------------------
-- Objetivos y calendario laboral
-- -----------------------------------------------------------------------------
create table public.sales_goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  period_type   text not null check (period_type in ('day','week','month')),
  -- null = objetivo por defecto para cualquier periodo de ese tipo
  period_start  date,
  metric        text not null check (metric in (
                  'cold_calls','effective_contacts','visits','follow_ups_done',
                  'new_customers','orders','revenue','commission')),
  -- Para métricas monetarias el objetivo se expresa en céntimos
  target_value  numeric(14,2) not null check (target_value >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index sales_goals_uq on public.sales_goals(user_id, period_type, coalesce(period_start, '1900-01-01'::date), metric);

-- Excepciones al calendario laboral por defecto
create table public.workdays (
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date          date not null,
  kind          text not null check (kind in ('work','vacation','holiday','off')),
  hours_worked  numeric(4,2) check (hours_worked is null or hours_worked between 0 and 24),
  note          text,
  primary key (user_id, date)
);

-- -----------------------------------------------------------------------------
-- Disparadores updated_at
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles','app_settings','establishment_types','prospecting_results',
    'product_categories','commercial_zones','customers','calendar_events','prospecting_activities',
    'visits','follow_ups','products','orders','sales_goals']
  loop
    execute format('create trigger %I_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Historial de estados (clientes y pedidos)
-- -----------------------------------------------------------------------------
create or replace function public.log_customer_status()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into public.customer_status_history(user_id, customer_id, from_status, to_status)
    values (new.user_id, new.id, null, new.status);
  elsif new.status is distinct from old.status then
    insert into public.customer_status_history(user_id, customer_id, from_status, to_status)
    values (new.user_id, new.id, old.status, new.status);
  end if;
  return new;
end $$;
create trigger customers_status_after_insert after insert on public.customers
  for each row execute function public.log_customer_status();
create trigger customers_status_after_update after update of status on public.customers
  for each row execute function public.log_customer_status();

-- Fecha de alta como cliente: se fija la primera vez que pasa a estado de cliente
create or replace function public.set_customer_since()
returns trigger language plpgsql as $$
begin
  if new.status in ('customer_new','customer_active') and new.customer_since_date is null then
    new.customer_since_date := (now() at time zone 'Europe/Madrid')::date;
  end if;
  if new.first_contact_date is null and new.status <> 'prospect_uncontacted' then
    new.first_contact_date := (now() at time zone 'Europe/Madrid')::date;
  end if;
  return new;
end $$;
create trigger customers_set_since before insert or update of status on public.customers
  for each row execute function public.set_customer_since();

create or replace function public.log_order_status()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.order_status_history(user_id, order_id, from_status, to_status)
    values (new.user_id, new.id, case when tg_op = 'UPDATE' then old.status end, new.status);
  end if;
  return new;
end $$;
create trigger orders_status_history after insert or update of status on public.orders
  for each row execute function public.log_order_status();

-- -----------------------------------------------------------------------------
-- Integridad entre filas del mismo usuario: impide vincular registros ajenos
-- (RLS protege la lectura; estos disparadores protegen las referencias).
-- -----------------------------------------------------------------------------
create or replace function public.assert_same_owner()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ref record;
  owner uuid;
begin
  for ref in
    select key as col, value as tbl
    from jsonb_each_text(tg_argv[0]::jsonb)
  loop
    execute format('select ($1).%I', ref.col) using new into owner;
    if owner is not null then
      execute format('select user_id from public.%I where id = $1', ref.tbl) using owner into owner;
      if owner is distinct from new.user_id then
        raise exception 'Referencia no válida en %', ref.col using errcode = '42501';
      end if;
    end if;
  end loop;
  return new;
end $$;

create trigger customers_owner before insert or update on public.customers for each row execute function
  public.assert_same_owner('{"establishment_type_id":"establishment_types","zone_id":"commercial_zones","merged_into_id":"customers"}');
create trigger prospecting_owner before insert or update on public.prospecting_activities for each row execute function
  public.assert_same_owner('{"customer_id":"customers","establishment_type_id":"establishment_types","result_id":"prospecting_results"}');
create trigger visits_owner before insert or update on public.visits for each row execute function
  public.assert_same_owner('{"customer_id":"customers","calendar_event_id":"calendar_events","prospecting_activity_id":"prospecting_activities","outcome_result_id":"prospecting_results"}');
create trigger events_owner before insert or update on public.calendar_events for each row execute function
  public.assert_same_owner('{"customer_id":"customers","zone_id":"commercial_zones"}');
create trigger follow_ups_owner before insert or update on public.follow_ups for each row execute function
  public.assert_same_owner('{"customer_id":"customers","source_activity_id":"prospecting_activities"}');
create trigger orders_owner before insert or update on public.orders for each row execute function
  public.assert_same_owner('{"customer_id":"customers","visit_id":"visits"}');
create trigger order_items_owner before insert or update on public.order_items for each row execute function
  public.assert_same_owner('{"order_id":"orders","product_id":"products","category_id":"product_categories"}');
create trigger order_returns_owner before insert or update on public.order_returns for each row execute function
  public.assert_same_owner('{"order_id":"orders"}');
create trigger products_owner before insert or update on public.products for each row execute function
  public.assert_same_owner('{"category_id":"product_categories"}');
create trigger zone_pop_owner before insert or update on public.zone_populations for each row execute function
  public.assert_same_owner('{"zone_id":"commercial_zones"}');
create trigger zone_wd_owner before insert or update on public.zone_weekday_assignments for each row execute function
  public.assert_same_owner('{"zone_id":"commercial_zones"}');
create trigger zone_override_owner before insert or update on public.zone_date_overrides for each row execute function
  public.assert_same_owner('{"zone_id":"commercial_zones"}');
-- =============================================================================
-- Row Level Security, datos iniciales por usuario y funciones transaccionales
-- =============================================================================

-- -----------------------------------------------------------------------------
-- RLS: cada usuario sólo ve y modifica sus propias filas
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
create policy profiles_owner on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array[
    'app_settings','establishment_types','prospecting_results','product_categories',
    'commercial_zones','zone_populations','zone_weekday_assignments','zone_date_overrides',
    'customers','customer_status_history','calendar_events','prospecting_activities','visits',
    'follow_ups','products','orders','order_items','order_returns','order_status_history',
    'commission_settings','commission_tiers','commission_calculations','sales_goals','workdays']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy %I on public.%I for all to authenticated
                    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
                   t || '_owner', t);
  end loop;
end $$;

-- El historial es de sólo lectura para el usuario (lo escriben los disparadores)
drop policy customer_status_history_owner on public.customer_status_history;
create policy customer_status_history_read on public.customer_status_history for select to authenticated
  using (user_id = (select auth.uid()));
create policy customer_status_history_insert on public.customer_status_history for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy order_status_history_owner on public.order_status_history;
create policy order_status_history_read on public.order_status_history for select to authenticated
  using (user_id = (select auth.uid()));
create policy order_status_history_insert on public.order_status_history for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Los anónimos no tienen acceso a nada
revoke all on all tables in schema public from anon;

-- -----------------------------------------------------------------------------
-- Valores iniciales para cada usuario nuevo
-- -----------------------------------------------------------------------------
create or replace function public.seed_user_defaults(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id) values (p_user) on conflict do nothing;
  insert into public.app_settings(user_id) values (p_user) on conflict do nothing;
  insert into public.commission_settings(user_id) values (p_user) on conflict do nothing;

  insert into public.establishment_types(user_id, name, sort_order)
  select p_user, n, o from unnest(array['Perfumería','Peluquería','Centro de estética','Salón de belleza',
    'Tienda de cosmética','Farmacia','Distribuidor','Otro']) with ordinality as x(n, o)
  on conflict do nothing;

  insert into public.prospecting_results(user_id, code, name, is_effective_contact, is_interest, is_rejection, sort_order) values
    (p_user, 'manager_absent',     'Responsable ausente',       false, false, false, 1),
    (p_user, 'not_interested',     'No interesado',             true,  false, true,  2),
    (p_user, 'effective_contact',  'Contacto efectivo',         true,  false, false, 3),
    (p_user, 'interested',         'Interesado',                true,  true,  false, 4),
    (p_user, 'follow_up_pending',  'Seguimiento pendiente',     true,  true,  false, 5),
    (p_user, 'second_visit',       'Segunda visita concertada', true,  true,  false, 6),
    (p_user, 'customer_won',       'Cliente captado',           true,  true,  false, 7),
    (p_user, 'order_won',          'Pedido conseguido',         true,  true,  false, 8)
  on conflict do nothing;

  insert into public.product_categories(user_id, name, sort_order)
  select p_user, n, o from unnest(array['Cosmética','Maquillaje','Cera depilatoria','Otros']) with ordinality as x(n, o)
  on conflict do nothing;

  -- Escala indicada: <6.000 → 0 %; 6.000–<8.000 → 4 %; 8.000–10.000 → 6 %; >10.000 → 8 %
  -- (10.000 € exactos quedan en el 6 % porque el tramo superior es «más de 10.000»)
  insert into public.commission_tiers(user_id, lower_cents, lower_inclusive, rate_bp) values
    (p_user, 0,       true,  0),
    (p_user, 600000,  true,  400),
    (p_user, 800000,  true,  600),
    (p_user, 1000000, false, 800)
  on conflict do nothing;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_user_defaults(new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Permite al propio usuario regenerar valores iniciales que haya borrado
create or replace function public.ensure_my_defaults()
returns void language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  insert into public.profiles(id) values (auth.uid()) on conflict do nothing;
  insert into public.app_settings(user_id) values (auth.uid()) on conflict do nothing;
  insert into public.commission_settings(user_id) values (auth.uid()) on conflict do nothing;
end $$;

-- -----------------------------------------------------------------------------
-- Cálculo de línea de pedido (misma fórmula que src/lib/domain/money.ts)
-- -----------------------------------------------------------------------------
create or replace function public.order_line_amounts(
  p_quantity numeric, p_unit_price_cents bigint, p_discount_bp integer, p_vat_rate_bp integer,
  out base_cents bigint, out vat_cents bigint, out total_cents bigint)
language sql immutable as $$
  select b, v, b + v from (
    select round(p_quantity * p_unit_price_cents * (10000 - p_discount_bp) / 10000.0)::bigint as b
  ) x, lateral (select round(x.b * p_vat_rate_bp / 10000.0)::bigint as v) y;
$$;

-- -----------------------------------------------------------------------------
-- Prospección: registro atómico e idempotente
-- p jsonb: {client_request_id, occurred_at?, customer_id?, establishment_name?, city?,
--           establishment_type_id?, contact_name?, result_id?, notes?, next_action?,
--           follow_up_date?, is_provisional?, create_customer?, new_customer_status?}
-- -----------------------------------------------------------------------------
create or replace function public.register_prospecting(p jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_req uuid := nullif(p->>'client_request_id','')::uuid;
  v_existing uuid;
  v_customer uuid := nullif(p->>'customer_id','')::uuid;
  v_activity uuid;
  v_provisional boolean := coalesce((p->>'is_provisional')::boolean, false);
  v_name text := nullif(trim(p->>'establishment_name'),'');
  v_status text := nullif(p->>'new_customer_status','');
  v_follow date := nullif(p->>'follow_up_date','')::date;
  v_city text := nullif(trim(p->>'city'),'');
begin
  if v_uid is null then raise exception 'No autenticado' using errcode = '42501'; end if;

  if v_req is not null then
    select id into v_existing from public.prospecting_activities
      where user_id = v_uid and client_request_id = v_req;
    if v_existing is not null then return v_existing; end if;
  end if;

  -- Crear el establecimiento si se solicita y no se ha elegido uno existente
  if v_customer is null and not v_provisional and v_name is not null
     and coalesce((p->>'create_customer')::boolean, true) then
    insert into public.customers(user_id, trade_name, city, establishment_type_id, contact_name, status, first_contact_date)
    values (v_uid, v_name, nullif(trim(p->>'city'),''), nullif(p->>'establishment_type_id','')::uuid,
            nullif(trim(p->>'contact_name'),''), coalesce(v_status, 'prospect_contacted'),
            (coalesce(nullif(p->>'occurred_at','')::timestamptz, now()) at time zone 'Europe/Madrid')::date)
    returning id into v_customer;
  elsif v_customer is not null and v_status is not null then
    update public.customers set status = v_status where id = v_customer and status is distinct from v_status;
  end if;

  if v_customer is not null then
    select coalesce(v_name, c.trade_name), coalesce(v_city, c.city)
      into v_name, v_city from public.customers c where c.id = v_customer;
  end if;

  insert into public.prospecting_activities(
    user_id, occurred_at, customer_id, establishment_name, city, establishment_type_id, contact_name,
    result_id, notes, next_action, follow_up_date, is_provisional, client_request_id)
  values (
    v_uid, coalesce(nullif(p->>'occurred_at','')::timestamptz, now()), v_customer, v_name,
    v_city, nullif(p->>'establishment_type_id','')::uuid, nullif(trim(p->>'contact_name'),''),
    nullif(p->>'result_id','')::uuid, nullif(trim(p->>'notes'),''), nullif(trim(p->>'next_action'),''),
    v_follow, v_provisional, v_req)
  returning id into v_activity;

  if v_customer is not null then
    update public.customers
       set next_action = coalesce(nullif(trim(p->>'next_action'),''), next_action),
           next_follow_up_date = coalesce(v_follow, next_follow_up_date),
           first_contact_date = coalesce(first_contact_date, (now() at time zone 'Europe/Madrid')::date)
     where id = v_customer;
    if v_follow is not null then
      insert into public.follow_ups(user_id, customer_id, follow_up_type, due_date, reason, source_activity_id)
      values (v_uid, v_customer, 'visit', v_follow,
              coalesce(nullif(trim(p->>'next_action'),''), 'Seguimiento de prospección'), v_activity);
    end if;
  end if;

  return v_activity;
end $$;

-- -----------------------------------------------------------------------------
-- Calendario: cambio de estado con visita única por evento
-- Marcar «realizado» crea (o restaura) UNA visita; cambiar a otro estado la anula.
-- -----------------------------------------------------------------------------
create or replace function public.set_event_status(
  p_event_id uuid, p_status text, p_outcome_result_id uuid default null, p_notes text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  ev public.calendar_events;
  v_visit uuid;
  v_kind text;
  v_cust_status text;
begin
  select * into ev from public.calendar_events where id = p_event_id and deleted_at is null for update;
  if not found then raise exception 'Evento no encontrado' using errcode = 'P0002'; end if;

  update public.calendar_events set status = p_status where id = p_event_id;

  if p_status = 'done' and ev.customer_id is not null
     and ev.event_type in ('customer_visit','prospect_visit','meeting','restock') then
    select status into v_cust_status from public.customers where id = ev.customer_id;
    v_kind := case
      when ev.event_type = 'prospect_visit' then 'prospect'
      when ev.event_type = 'customer_visit' then 'customer'
      when v_cust_status like 'customer_%' then 'customer' else 'prospect' end;

    insert into public.visits(user_id, customer_id, occurred_at, visit_kind, is_commercial,
                              calendar_event_id, outcome_result_id, notes)
    values (ev.user_id, ev.customer_id, least(ev.starts_at, now()), v_kind, ev.event_type <> 'restock',
            ev.id, p_outcome_result_id, p_notes)
    on conflict (calendar_event_id) where calendar_event_id is not null do update
      set deleted_at = null,
          outcome_result_id = coalesce(excluded.outcome_result_id, public.visits.outcome_result_id),
          notes = coalesce(excluded.notes, public.visits.notes)
    returning id into v_visit;
  else
    update public.visits set deleted_at = now()
     where calendar_event_id = p_event_id and deleted_at is null;
  end if;

  return v_visit;
end $$;

-- Reprogramar: el original queda «reprogramado» y se crea uno nuevo enlazado
create or replace function public.reschedule_event(p_event_id uuid, p_starts_at timestamptz, p_ends_at timestamptz)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  ev public.calendar_events;
  v_new uuid;
begin
  select * into ev from public.calendar_events where id = p_event_id and deleted_at is null for update;
  if not found then raise exception 'Evento no encontrado' using errcode = 'P0002'; end if;
  if ev.status = 'done' then raise exception 'Un evento realizado no se puede reprogramar' using errcode = '22023'; end if;
  perform public.set_event_status(p_event_id, 'rescheduled');
  insert into public.calendar_events(user_id, title, event_type, customer_id, starts_at, ends_at, city, address,
                                     zone_id, notes, reminder_minutes, is_demo)
  values (ev.user_id, ev.title, ev.event_type, ev.customer_id, p_starts_at, p_ends_at, ev.city, ev.address,
          ev.zone_id, ev.notes, ev.reminder_minutes, ev.is_demo)
  returning id into v_new;
  update public.calendar_events set rescheduled_to_id = v_new where id = p_event_id;
  return v_new;
end $$;

-- -----------------------------------------------------------------------------
-- Pedidos: guardado atómico de cabecera + líneas (importes calculados aquí)
-- p_order: {id?, client_request_id?, customer_id, order_date, order_number?, status, notes?,
--           delivery_date?, paid_date?, visit_id?}
-- p_items: [{product_id?, description, category_id?, quantity, unit_price_cents, discount_bp, vat_rate_bp}]
-- -----------------------------------------------------------------------------
create or replace function public.save_order(p_order jsonb, p_items jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := nullif(p_order->>'id','')::uuid;
  v_req uuid := nullif(p_order->>'client_request_id','')::uuid;
  v_item jsonb;
  v_pos integer := 0;
  a record;
begin
  if v_uid is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido necesita al menos una línea' using errcode = '22023';
  end if;

  if v_id is null then
    if v_req is not null then
      select id into v_id from public.orders where user_id = v_uid and client_request_id = v_req;
      if v_id is not null then return v_id; end if;
    end if;
    insert into public.orders(user_id, customer_id, order_date, order_number, status, notes,
                              delivery_date, paid_date, visit_id, client_request_id)
    values (v_uid, (p_order->>'customer_id')::uuid, (p_order->>'order_date')::date,
            nullif(trim(p_order->>'order_number'),''), coalesce(p_order->>'status','draft'),
            nullif(trim(p_order->>'notes'),''), nullif(p_order->>'delivery_date','')::date,
            nullif(p_order->>'paid_date','')::date, nullif(p_order->>'visit_id','')::uuid, v_req)
    returning id into v_id;
  else
    if exists (select 1 from public.order_returns where order_id = v_id) then
      raise exception 'El pedido tiene devoluciones registradas y sus líneas no se pueden modificar' using errcode = '22023';
    end if;
    update public.orders set
      customer_id = (p_order->>'customer_id')::uuid,
      order_date = (p_order->>'order_date')::date,
      order_number = nullif(trim(p_order->>'order_number'),''),
      status = coalesce(p_order->>'status', status),
      notes = nullif(trim(p_order->>'notes'),''),
      delivery_date = nullif(p_order->>'delivery_date','')::date,
      paid_date = nullif(p_order->>'paid_date','')::date,
      visit_id = nullif(p_order->>'visit_id','')::uuid
    where id = v_id and deleted_at is null;
    if not found then raise exception 'Pedido no encontrado' using errcode = 'P0002'; end if;
    delete from public.order_items where order_id = v_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into a from public.order_line_amounts(
      (v_item->>'quantity')::numeric, (v_item->>'unit_price_cents')::bigint,
      coalesce((v_item->>'discount_bp')::integer, 0), (v_item->>'vat_rate_bp')::integer);
    insert into public.order_items(user_id, order_id, product_id, description, category_id, quantity,
      unit_price_cents, discount_bp, vat_rate_bp, base_cents, vat_cents, total_cents, position)
    values (v_uid, v_id, nullif(v_item->>'product_id','')::uuid, v_item->>'description',
      nullif(v_item->>'category_id','')::uuid, (v_item->>'quantity')::numeric,
      (v_item->>'unit_price_cents')::bigint, coalesce((v_item->>'discount_bp')::integer, 0),
      (v_item->>'vat_rate_bp')::integer, a.base_cents, a.vat_cents, a.total_cents, v_pos);
    v_pos := v_pos + 1;
  end loop;

  return v_id;
end $$;

-- Devolución: registra el abono y ajusta el estado sin borrar el historial
create or replace function public.register_return(
  p_order_id uuid, p_return_date date, p_base_cents bigint, p_reason text, p_client_request_id uuid default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  t record;
  v_vat bigint;
begin
  if p_client_request_id is not null then
    select id into v_id from public.order_returns where user_id = v_uid and client_request_id = p_client_request_id;
    if v_id is not null then return v_id; end if;
  end if;
  select * into t from public.order_totals where order_id = p_order_id;
  if not found then raise exception 'Pedido no encontrado' using errcode = 'P0002'; end if;
  if (select status from public.orders where id = p_order_id) in ('draft','cancelled') then
    raise exception 'No se puede devolver un pedido en borrador o cancelado' using errcode = '22023';
  end if;
  if p_base_cents <= 0 or p_base_cents > t.base_cents - t.returned_base_cents then
    raise exception 'El importe devuelto supera lo pendiente de devolver' using errcode = '22023';
  end if;
  -- IVA proporcional a la base del pedido
  v_vat := case when t.base_cents = 0 then 0 else round(p_base_cents::numeric * t.vat_cents / t.base_cents) end;
  insert into public.order_returns(user_id, order_id, return_date, reason, base_cents, vat_cents, total_cents, client_request_id)
  values (v_uid, p_order_id, p_return_date, nullif(trim(p_reason),''), p_base_cents, v_vat, p_base_cents + v_vat, p_client_request_id)
  returning id into v_id;
  update public.orders set status = case
      when t.returned_base_cents + p_base_cents >= t.base_cents then 'fully_returned' else 'partially_returned' end
   where id = p_order_id;
  return v_id;
end $$;

-- -----------------------------------------------------------------------------
-- Fusión de clientes duplicados: conserva actividades, visitas, pedidos…
-- -----------------------------------------------------------------------------
create or replace function public.merge_customers(p_keep uuid, p_merge uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare
  k public.customers;
  m public.customers;
begin
  if p_keep = p_merge then raise exception 'No se puede fusionar un cliente consigo mismo' using errcode = '22023'; end if;
  select * into k from public.customers where id = p_keep and archived_at is null for update;
  select * into m from public.customers where id = p_merge and archived_at is null for update;
  if k.id is null or m.id is null then raise exception 'Cliente no encontrado' using errcode = 'P0002'; end if;

  update public.prospecting_activities set customer_id = p_keep where customer_id = p_merge;
  update public.visits                 set customer_id = p_keep where customer_id = p_merge;
  update public.follow_ups             set customer_id = p_keep where customer_id = p_merge;
  update public.calendar_events        set customer_id = p_keep where customer_id = p_merge;
  update public.orders                 set customer_id = p_keep where customer_id = p_merge;
  update public.customer_status_history set customer_id = p_keep where customer_id = p_merge;

  update public.customers set
    legal_name = coalesce(k.legal_name, m.legal_name),
    establishment_type_id = coalesce(k.establishment_type_id, m.establishment_type_id),
    contact_name = coalesce(k.contact_name, m.contact_name),
    phone = coalesce(k.phone, m.phone),
    email = coalesce(k.email, m.email),
    address = coalesce(k.address, m.address),
    city = coalesce(k.city, m.city),
    province = coalesce(k.province, m.province),
    postal_code = coalesce(k.postal_code, m.postal_code),
    zone_id = coalesce(k.zone_id, m.zone_id),
    first_contact_date = least(k.first_contact_date, m.first_contact_date),
    customer_since_date = least(k.customer_since_date, m.customer_since_date),
    notes = case when m.notes is null then k.notes when k.notes is null then m.notes
                 else k.notes || E'\n— Fusionado —\n' || m.notes end
  where id = p_keep;

  update public.customers set merged_into_id = p_keep, archived_at = now() where id = p_merge;
end $$;

-- -----------------------------------------------------------------------------
-- Datos de demostración: borrado seguro (sólo filas marcadas is_demo)
-- -----------------------------------------------------------------------------
create or replace function public.delete_demo_data()
returns integer language plpgsql security invoker set search_path = public as $$
declare n integer := 0; c integer;
begin
  if auth.uid() is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  delete from public.order_returns where is_demo; get diagnostics c = row_count; n := n + c;
  delete from public.orders where is_demo; get diagnostics c = row_count; n := n + c;
  delete from public.follow_ups where is_demo; get diagnostics c = row_count; n := n + c;
  delete from public.visits where is_demo; get diagnostics c = row_count; n := n + c;
  delete from public.prospecting_activities where is_demo; get diagnostics c = row_count; n := n + c;
  delete from public.calendar_events where is_demo; get diagnostics c = row_count; n := n + c;
  delete from public.customers where is_demo; get diagnostics c = row_count; n := n + c;
  delete from public.products where is_demo; get diagnostics c = row_count; n := n + c;
  delete from public.commercial_zones where is_demo; get diagnostics c = row_count; n := n + c;
  return n;
end $$;

grant execute on function public.register_prospecting(jsonb) to authenticated;
grant execute on function public.set_event_status(uuid, text, uuid, text) to authenticated;
grant execute on function public.reschedule_event(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.save_order(jsonb, jsonb) to authenticated;
grant execute on function public.register_return(uuid, date, bigint, text, uuid) to authenticated;
grant execute on function public.merge_customers(uuid, uuid) to authenticated;
grant execute on function public.delete_demo_data() to authenticated;
grant execute on function public.ensure_my_defaults() to authenticated;
revoke execute on function public.seed_user_defaults(uuid) from public, anon, authenticated;
-- =============================================================================
-- Permisos explícitos para el rol «authenticated» (la API de datos de Supabase).
-- No dependemos de la opción «Automatically expose new tables»: concedemos
-- solo lo necesario y RLS sigue limitando cada fila a su propietario.
-- =============================================================================
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant select on public.order_totals to authenticated;

-- El rol anónimo no accede a ningún dato
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon;

-- Funciones internas: nunca invocables desde la API
revoke execute on function public.seed_user_defaults(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.assert_same_owner() from public, anon, authenticated;
