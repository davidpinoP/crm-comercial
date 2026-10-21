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
