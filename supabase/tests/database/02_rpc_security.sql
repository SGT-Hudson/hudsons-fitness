-- Tier-3 / R-16 — RPC security class. Encodes the D-C5/D-D6 invariant:
-- every user-facing RPC is SECURITY INVOKER with a pinned search_path; the
-- ONLY SECURITY DEFINER function reachable via PostgREST is the cron-only
-- apply_template_to_week_admin, locked to service_role.
begin;
select plan(14);

-- Helper: assert (secdef, search_path) for a function by name+args.
-- Inline as is(...) per function for readable failures.

-- save_recipe — INVOKER, search_path=''.
select is((select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='save_recipe'), false,
  'save_recipe is SECURITY INVOKER');
select is((select array_to_string(p.proconfig,',') from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='save_recipe'),
  'search_path=', 'save_recipe pins search_path=''''');

-- save_template — INVOKER, search_path=''.
select is((select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='save_template'), false,
  'save_template is SECURITY INVOKER');
select is((select array_to_string(proconfig,',') from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='save_template'),
  'search_path=', 'save_template pins search_path=''''');

-- apply_template_to_week — INVOKER, search_path=''.
select is((select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='apply_template_to_week'), false,
  'apply_template_to_week is SECURITY INVOKER');

-- save_week_as_template — INVOKER, search_path=''.
select is((select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='save_week_as_template'), false,
  'save_week_as_template is SECURITY INVOKER');

-- materialize_plan_for_date — INVOKER, search_path=public (R-12).
select is((select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='materialize_plan_for_date'), false,
  'materialize_plan_for_date is SECURITY INVOKER (R-12 / D-D6)');
select is((select array_to_string(proconfig,',') from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='materialize_plan_for_date'),
  'search_path=public', 'materialize_plan_for_date pins search_path=public');

-- apply_template_to_week_admin — the ONLY public SECURITY DEFINER RPC.
select is((select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='apply_template_to_week_admin'), true,
  'apply_template_to_week_admin is SECURITY DEFINER (sanctioned exception)');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prosecdef
     and p.prokind='f'
     and p.proname not in ('handle_new_user')), 1,
  'exactly ONE SECURITY DEFINER function in public besides the auth trigger fn');
-- (handle_new_user is a DEFINER trigger fn, not a PostgREST-callable RPC; it
--  is excluded above. apply_template_to_week_admin is the only RPC.)

-- Grants: admin RPC revoked from anon/authenticated, granted to service_role.
select is_empty(
  $$ select 1 from information_schema.role_routine_grants
     where routine_schema='public'
       and routine_name='apply_template_to_week_admin'
       and grantee in ('anon','authenticated','public') $$,
  'apply_template_to_week_admin NOT executable by anon/authenticated/public');
select isnt_empty(
  $$ select 1 from information_schema.role_routine_grants
     where routine_schema='public'
       and routine_name='apply_template_to_week_admin'
       and grantee='service_role' and privilege_type='EXECUTE' $$,
  'apply_template_to_week_admin executable by service_role only');

-- private.invoke_edge_function — DEFINER, not granted to anon/authenticated.
select is((select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='invoke_edge_function'), true,
  'private.invoke_edge_function is SECURITY DEFINER');
select is_empty(
  $$ select 1 from information_schema.role_routine_grants
     where routine_schema='private'
       and routine_name='invoke_edge_function'
       and grantee in ('anon','authenticated','public') $$,
  'private.invoke_edge_function NOT executable by anon/authenticated/public');

select * from finish();
rollback;
