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
