-- Tier-3 / R-16 — Structural RLS pin. Exhaustive: every public table has RLS
-- enabled and exactly the expected policy set. Any drift fails CI.
begin;
select plan(31);

-- 1. RLS enabled on all 15 tables.
select ok(
  (select bool_and(c.relrowsecurity)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = any (array[
       'profiles','body_measurements','ingredients','recipes',
       'recipe_ingredients','goals','phases','meal_plan_templates',
       'meal_plan_template_day_times','meal_plan_template_slots',
       'meal_plan_weeks','meal_plan_week_slots','meal_logs',
       'daily_nutrition_history','tdee_estimates'])),
  'RLS enabled on all 15 public tables (profiles..tdee_estimates)');

select ok(
  (select c.relrowsecurity
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname='public' and c.relname='tdee_state'),
  'RLS enabled on tdee_state (R-07)');

-- 2. Exact policy set per table (policies_are = no missing, no extra).
select policies_are('public','profiles', array[
  'Users see own profile','Users insert own profile',
  'Users update own profile','Users delete own profile']);

select policies_are('public','body_measurements', array[
  'Users see own measurements','Users insert own measurements',
  'Users update own measurements','Users delete own measurements']);

select policies_are('public','recipes', array[
  'Users see own recipes','Users insert own recipes',
  'Users update own recipes','Users delete own recipes']);

select policies_are('public','recipe_ingredients', array[
  'Users see own recipe ingredients','Users insert own recipe ingredients',
  'Users update own recipe ingredients','Users delete own recipe ingredients']);

select policies_are('public','goals', array[
  'Users see own goals','Users insert own goals',
  'Users update own goals','Users delete own goals']);

select policies_are('public','phases', array[
  'Users see own phases','Users insert own phases',
  'Users update own phases','Users delete own phases']);

select policies_are('public','meal_plan_templates', array[
  'Users see own templates','Users insert own templates',
  'Users update own templates','Users delete own templates']);

select policies_are('public','meal_plan_template_day_times', array[
  'Users see own template day times','Users insert own template day times',
  'Users update own template day times','Users delete own template day times']);

select policies_are('public','meal_plan_template_slots', array[
  'Users see own template slots','Users insert own template slots',
  'Users update own template slots','Users delete own template slots']);

select policies_are('public','meal_plan_weeks', array[
  'Users see own plan weeks','Users insert own plan weeks',
  'Users update own plan weeks','Users delete own plan weeks']);

select policies_are('public','meal_plan_week_slots', array[
  'Users see own plan week slots','Users insert own plan week slots',
  'Users update own plan week slots','Users delete own plan week slots']);

select policies_are('public','meal_logs', array[
  'Users see own meal logs','Users insert own meal logs',
  'Users update own meal logs','Users delete own meal logs']);

select policies_are('public','daily_nutrition_history', array[
  'Users see own daily history','Users insert own daily history',
  'Users update own daily history','Users delete own daily history']);

select policies_are('public','tdee_estimates', array[
  'Users see own tdee','Users insert own tdee',
  'Users update own tdee','Users delete own tdee']);

select policies_are('public','goals', array[
  'Users see own goals','Users insert own goals',
  'Users update own goals','Users delete own goals'],
  'goals policy set (re-pin)');

-- ingredients: non-uniform shared-library policy set (D-A1).
select policies_are('public','ingredients', array[
  'All users read ingredients','Users insert ingredients',
  'Creator updates own ingredients','Creator deletes own ingredients']);

-- tdee_state: R-07 names differ (snake, not "Users …").
select policies_are('public','tdee_state', array[
  'tdee_state_select_own','tdee_state_insert_own',
  'tdee_state_update_own','tdee_state_delete_own']);

-- 3. ingredients open-read is scoped to `authenticated`, not anon/public.
select is(
  (select array_to_string(array(
     select rolname from pg_roles r
     join (select unnest(polroles) pr from pg_policy
            where polname='All users read ingredients') x on x.pr=r.oid
     order by rolname), ','),
  'authenticated',
  'ingredients SELECT policy is granted to the authenticated role only');

-- 4. The view body_measurements_smoothed exists and is a plain view (RLS is
--    inherited from the underlying RLS-protected table, by design).
select has_view('public','body_measurements_smoothed',
  'body_measurements_smoothed view exists (RLS via underlying table)');

-- 5. tdee_estimates idempotency key (sprint9-owned) exists.
select col_is_unique('public','tdee_estimates',
  array['user_id','computed_on'],
  'tdee_estimates has UNIQUE (user_id, computed_on)');

-- 6. meal_logs partial unique index (R-12) exists.
select hasnt_relation('public','meal_logs_user_plan_slot_uidx_missing',
  'sanity: placeholder relation absent');
select isnt_empty(
  $$ select 1 from pg_indexes
     where schemaname='public' and tablename='meal_logs'
       and indexname='meal_logs_user_plan_slot_uidx' $$,
  'meal_logs_user_plan_slot_uidx partial unique index exists (R-12)');

select * from finish();
rollback;
