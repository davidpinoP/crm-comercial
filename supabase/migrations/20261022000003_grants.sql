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
