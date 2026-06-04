-- Tier-3 / R-16 — schema + security-model invariants.
-- Asserts the structural guarantees that hard-invariant #3 depends on:
-- RLS is enabled everywhere, exactly the sanctioned set of functions is
-- SECURITY DEFINER, every other public function pins its search_path, and the
-- admin/infra functions are unreachable from anon/authenticated.
-- See docs/superpowers/specs/2026-06-03-tier3-pgtap-ci-design.md.

begin;
select * from no_plan();

-- ── every public table exists and has RLS enabled ────────────────────────────
select is(
  (select count(*)::int
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0,
  'RLS is enabled on every public table'
);

-- spot-check a representative set of tables actually exists (catches a broken
-- apply-from-zero that silently skipped a migration)
select has_table('public', 'profiles',         'profiles exists');
select has_table('public', 'recipes',          'recipes exists');
select has_table('public', 'recipe_ingredients','recipe_ingredients exists');
select has_table('public', 'ingredients',      'ingredients exists');
select has_table('public', 'exercises',        'exercises exists');
select has_table('public', 'muscles',          'muscles exists');
select has_table('public', 'workout_sessions', 'workout_sessions exists');
select has_table('public', 'workout_sets',     'workout_sets exists');
select has_table('public', 'routines',         'routines exists');
select has_table('public', 'routine_exercises','routine_exercises exists');
select has_table('public', 'programs',         'programs exists');
select has_table('public', 'program_days',     'program_days exists');
select has_table('public', 'user_ingredient_refs', 'user_ingredient_refs exists');
select has_table('public', 'user_recipe_refs',     'user_recipe_refs exists');

-- ── key RPCs exist ───────────────────────────────────────────────────────────
select has_function('public', 'save_recipe',              'save_recipe exists');
select has_function('public', 'save_workout',             'save_workout exists');
select has_function('public', 'save_routine',             'save_routine exists');
select has_function('public', 'save_program',             'save_program exists');
select has_function('public', 'save_template',            'save_template exists');
select has_function('public', 'set_active_program',       'set_active_program exists');
select has_function('public', 'materialize_plan_for_date','materialize_plan_for_date exists');
select has_function('public', 'hide_owned_recipe',        'hide_owned_recipe exists');
select has_function('public', 'hide_owned_ingredient',    'hide_owned_ingredient exists');
select has_function('public', 'reconcile_account_delete', 'reconcile_account_delete exists');

-- ── SECURITY-model invariant (hard-invariant #3) ─────────────────────────────
-- Exactly four functions across public+private may be SECURITY DEFINER:
--   the two sanctioned admin RPCs (apply_template_to_week_admin,
--   reconcile_account_delete) plus two infra functions (the handle_new_user
--   signup trigger and the private invoke_edge_function cron helper).
-- Any new DEFINER function fails this test — the machine check the invariant
-- previously lacked.
select set_eq(
  $$ select n.nspname || '.' || p.proname
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private') and p.prosecdef $$,
  $$ values ('private.invoke_edge_function'),
            ('public.apply_template_to_week_admin'),
            ('public.handle_new_user'),
            ('public.reconcile_account_delete') $$,
  'Only the sanctioned set of functions is SECURITY DEFINER'
);

-- Every public function pins search_path (a non-empty proconfig entry of the
-- form search_path=...). Both `= public` and `= ''` satisfy this — what matters
-- is that search_path is not left mutable/inherited.
select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
         where cfg like 'search_path=%')),
  0,
  'Every public function pins its search_path'
);

-- ── admin / infra functions are unreachable from anon/authenticated ──────────
select is_empty(
  $$ select 1 from information_schema.role_routine_grants
      where routine_schema = 'public' and routine_name = 'apply_template_to_week_admin'
        and grantee in ('anon', 'authenticated', 'PUBLIC') $$,
  'apply_template_to_week_admin is not executable by anon/authenticated/public');
select isnt_empty(
  $$ select 1 from information_schema.role_routine_grants
      where routine_schema = 'public' and routine_name = 'apply_template_to_week_admin'
        and grantee = 'service_role' and privilege_type = 'EXECUTE' $$,
  'apply_template_to_week_admin is executable by service_role');
select is_empty(
  $$ select 1 from information_schema.role_routine_grants
      where routine_schema = 'public' and routine_name = 'reconcile_account_delete'
        and grantee in ('anon', 'authenticated', 'PUBLIC') $$,
  'reconcile_account_delete is not executable by anon/authenticated/public');
select is_empty(
  $$ select 1 from information_schema.role_routine_grants
      where routine_schema = 'private' and routine_name = 'invoke_edge_function'
        and grantee in ('anon', 'authenticated', 'PUBLIC') $$,
  'private.invoke_edge_function is not executable by anon/authenticated/public');

-- ── key structural objects survive apply-from-zero ───────────────────────────
select has_view('public', 'body_measurements_smoothed',
  'body_measurements_smoothed view exists (RLS via the underlying table)');
select col_is_unique('public', 'tdee_estimates', array['user_id', 'computed_on'],
  'tdee_estimates has UNIQUE (user_id, computed_on) (sprint9 idempotency key)');
select isnt_empty(
  $$ select 1 from pg_indexes where schemaname = 'public' and tablename = 'meal_logs'
       and indexname = 'meal_logs_user_plan_slot_uidx' $$,
  'meal_logs partial unique index exists (R-12)');
select isnt_empty(
  $$ select 1 from pg_indexes where schemaname = 'public' and tablename = 'programs'
       and indexname = 'programs_one_active_uidx' $$,
  'programs one-active partial unique index exists (F-2)');

select * from finish();
rollback;
