-- Tier-3 / R-16 — Behavioral RLS. Depth on the high-risk surfaces:
--   * a plain per-user table (body_measurements)
--   * a join-scoped table (recipe_ingredients via recipes)
--   * the non-uniform shared library (ingredients, D-A1)
--   * tdee_state (R-07)
-- Dependency-free actor switching: insert auth.users (handle_new_user makes
-- the profile), then `set local role` + request.jwt.claims.
begin;
select plan(13);

-- Seed two users. handle_new_user (SECURITY DEFINER trigger on auth.users)
-- creates public.profiles rows for each.
insert into auth.users (id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at, created_at, updated_at)
values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'a@test.local','', now(), now(), now()),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'b@test.local','', now(), now(), now());

select isnt_empty(
  $$ select 1 from public.profiles
     where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'handle_new_user auto-created profile for user A');
select isnt_empty(
  $$ select 1 from public.profiles
     where id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
  'handle_new_user auto-created profile for user B');

-- ---- body_measurements: plain per-user table ----------------------------
set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

select lives_ok(
  $$ insert into public.body_measurements (user_id, measured_on, weight_kg)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_date, 80.0) $$,
  'user A can insert own body_measurements');

select throws_ok(
  $$ insert into public.body_measurements (user_id, measured_on, weight_kg)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', current_date, 70.0) $$,
  '42501',
  'new row violates row-level security policy for table "body_measurements"',
  'user A cannot insert a body_measurements row attributed to user B');

set local "request.jwt.claims" =
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';

select is_empty(
  $$ select 1 from public.body_measurements
     where user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'user B cannot SELECT user A body_measurements (RLS isolation)');

-- ---- recipe_ingredients: join-scoped via recipes ------------------------
set local "request.jwt.claims" =
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
set local role postgres;
insert into public.recipes (id, user_id, name)
  values ('11111111-1111-1111-1111-111111111111',
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','A recipe');
insert into public.ingredients (id, created_by_user_id, name,
  kcal_per_unit, protein_g_per_unit, carbs_g_per_unit, fat_g_per_unit)
  values ('22222222-2222-2222-2222-222222222222',
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Oats',380,13,67,7);
insert into public.recipe_ingredients (recipe_id, ingredient_id, quantity)
  values ('11111111-1111-1111-1111-111111111111',
          '22222222-2222-2222-2222-222222222222',100);

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select is_empty(
  $$ select 1 from public.recipe_ingredients
     where recipe_id='11111111-1111-1111-1111-111111111111' $$,
  'user B cannot SELECT recipe_ingredients of user A''s recipe (join-scoped)');

set local "request.jwt.claims" =
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select isnt_empty(
  $$ select 1 from public.recipe_ingredients
     where recipe_id='11111111-1111-1111-1111-111111111111' $$,
  'user A CAN SELECT recipe_ingredients of own recipe');

-- ---- ingredients: shared library (D-A1) ---------------------------------
-- All authenticated read (incl. other users' + system-seed rows).
set local role postgres;
insert into public.ingredients (id, created_by_user_id, name,
  kcal_per_unit, protein_g_per_unit, carbs_g_per_unit, fat_g_per_unit)
  values ('33333333-3333-3333-3333-333333333333', null,'System seed',0,0,0,0);

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select isnt_empty(
  $$ select 1 from public.ingredients
     where id='22222222-2222-2222-2222-222222222222' $$,
  'D-A1: any authenticated user reads another user''s ingredient');
select isnt_empty(
  $$ select 1 from public.ingredients
     where id='33333333-3333-3333-3333-333333333333' $$,
  'D-A1: any authenticated user reads a system-seed ingredient');

-- Insert must be self-attributed.
select throws_ok(
  $$ insert into public.ingredients (created_by_user_id, name,
       kcal_per_unit, protein_g_per_unit, carbs_g_per_unit, fat_g_per_unit)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Spoofed',1,1,1,1) $$,
  '42501', 'new row violates row-level security policy for table "ingredients"',
  'D-A1: cannot insert an ingredient attributed to another user');

-- Creator-only update; system seed (created_by_user_id IS NULL) immutable.
select is(
  (with u as (
     update public.ingredients set name='Hacked'
     where id='22222222-2222-2222-2222-222222222222' returning 1)
   select count(*)::int from u), 0,
  'D-A1: non-creator UPDATE of another user''s ingredient affects 0 rows');
select is(
  (with u as (
     update public.ingredients set name='Hacked seed'
     where id='33333333-3333-3333-3333-333333333333' returning 1)
   select count(*)::int from u), 0,
  'D-A1: system-seed ingredient (created_by NULL) is immutable to users');

-- ---- tdee_state: per-user (R-07) ---------------------------------------
set local role postgres;
insert into public.tdee_state (user_id, trend_weight_kg, expenditure_kcal,
  cov_ww, cov_we, cov_ee, last_updated_on)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',80,2500,1,0,1,current_date);
set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select is_empty(
  $$ select 1 from public.tdee_state
     where user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'user B cannot SELECT user A tdee_state (R-07 RLS isolation)');

select * from finish();
rollback;
