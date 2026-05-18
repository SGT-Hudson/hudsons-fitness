-- Tier-3 / R-16 — Behavioral contracts protecting real review-found defects.
begin;
select plan(11);

insert into auth.users (id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at, created_at, updated_at)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'a@test.local','', now(), now(), now());

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

-- ---- meal_log_one_source CHECK: exactly one of recipe/ingredient/custom --
select throws_ok(
  $$ insert into public.meal_logs (user_id, logged_on) values
     ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_date) $$,
  '23514', null,
  'meal_logs with zero sources violates meal_log_one_source CHECK');

-- ---- phases EXCLUDE: no overlapping date ranges per user ----------------
select lives_ok(
  $$ insert into public.phases (user_id,name,phase_type,start_date,end_date,
       kcal_mode,kcal_value) values
     ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Cut','cut','2026-01-01',
      '2026-02-01','absolute',2000) $$,
  'first phase inserts');
select throws_ok(
  $$ insert into public.phases (user_id,name,phase_type,start_date,end_date,
       kcal_mode,kcal_value) values
     ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Overlap','bulk','2026-01-15',
      '2026-03-01','absolute',2600) $$,
  '23P01', null,
  'overlapping phase rejected by phases_user_id_daterange_excl (EXCLUDE)');

-- ---- save_recipe: create then update; not-owned raises -------------------
select isnt_empty(
  $$ select public.save_recipe(null,'R1',2,'d','i','[]'::jsonb) $$,
  'save_recipe(null,...) creates and returns a new recipe id');
select throws_ok(
  $$ select public.save_recipe(
       '99999999-9999-9999-9999-999999999999','X',1,'','','[]'::jsonb) $$,
  'P0001', 'recipe not found or not owned by user',
  'save_recipe on a non-owned/absent recipe id raises');

-- ---- materialize_plan_for_date (R-12 / D-D6) ----------------------------
-- No active week → 0.
select is(
  (select public.materialize_plan_for_date(
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_date)), 0,
  'materialize_plan_for_date returns 0 when user has no plan week');

-- Build a week with one slot for today; materialize → 1; idempotent → 0.
set local role postgres;
insert into public.recipes (id,user_id,name) values
  ('11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','PlanRecipe');
insert into public.meal_plan_weeks (id,user_id,week_start) values
  ('44444444-4444-4444-4444-444444444444',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   (now() at time zone 'Europe/Madrid')::date - 2);
insert into public.meal_plan_week_slots
  (plan_week_id,date,meal_index,recipe_id,servings) values
  ('44444444-4444-4444-4444-444444444444',
   (now() at time zone 'Europe/Madrid')::date, 1,
   '11111111-1111-1111-1111-111111111111', 1);
set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

select is(
  (select public.materialize_plan_for_date(
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     (now() at time zone 'Europe/Madrid')::date)), 1,
  'materialize_plan_for_date inserts the one missing slot (returns 1)');
select is(
  (select meal_type from public.meal_logs
   where plan_week_slot_id is not null limit 1), 'lunch',
  'meal_index 1 maps to meal_type lunch (breakfast,lunch,snack,dinner,other)');
select is(
  (select public.materialize_plan_for_date(
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     (now() at time zone 'Europe/Madrid')::date)), 0,
  'second call is idempotent (partial unique index + ON CONFLICT → 0)');
select is(
  (select public.materialize_plan_for_date(
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     (now() at time zone 'Europe/Madrid')::date + 5)), 0,
  'future date no-ops (defect 3): returns 0, inserts nothing');

select * from finish();
rollback;
