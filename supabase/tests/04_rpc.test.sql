-- Tier-3 / R-16 — RPC behaviour. Replace-children correctness, the
-- materialize_plan_for_date guard + idempotency, one-active-program
-- enforcement, hide-transfers-ownership, and the account-delete reconciliation.
-- RPC calls are wrapped in pgTAP predicates so they execute without emitting
-- stray tuples.

begin;
select * from no_plan();

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.dev'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.dev');

-- pool seeds
insert into exercises (id, name_es) values
  ('00000000-0000-0000-0000-0000000000e1', 'Press banca');
insert into ingredients (id, name, kcal_per_unit, protein_g_per_unit, carbs_g_per_unit, fat_g_per_unit) values
  ('00000000-0000-0000-0000-0000000000d1', 'Pollo', 1.65, 0.31, 0, 0.036),
  ('00000000-0000-0000-0000-0000000000d2', 'Arroz', 1.30, 0.027, 0.28, 0.003);

-- ════════════════════════════════════════════════════════════════════════════
-- save_workout — replace-children + ownership
-- ════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $q$ select save_workout(null, '2026-01-01', 'W', null,
        '[{"exercise_id":"00000000-0000-0000-0000-0000000000e1","set_index":1,"reps":5,"weight_kg":100},
          {"exercise_id":"00000000-0000-0000-0000-0000000000e1","set_index":2,"reps":5,"weight_kg":100}]'::jsonb) $q$,
  'A save_workout create succeeds');
select is(
  (select count(*)::int from workout_sets ws join workout_sessions s on s.id = ws.session_id
    where s.user_id = '11111111-1111-1111-1111-111111111111' and s.title = 'W'),
  2, 'save_workout created two sets');

select lives_ok(
  $q$ select save_workout(
        (select id from workout_sessions where user_id = '11111111-1111-1111-1111-111111111111' and title = 'W'),
        '2026-01-01', 'W', null,
        '[{"exercise_id":"00000000-0000-0000-0000-0000000000e1","set_index":1,"reps":3,"weight_kg":90}]'::jsonb) $q$,
  'A save_workout replace succeeds');
select is(
  (select count(*)::int from workout_sets ws join workout_sessions s on s.id = ws.session_id
    where s.user_id = '11111111-1111-1111-1111-111111111111' and s.title = 'W'),
  1, 'save_workout replaced children (no duplicate/orphan)');

-- B cannot mutate A's session through the RPC
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $q$ select save_workout(
        (select id from workout_sessions where user_id = '11111111-1111-1111-1111-111111111111' and title = 'W'),
        '2026-01-01', 'hijack', null, '[]'::jsonb) $q$,
  'P0001', 'session not found or not owned by user',
  'B cannot save_workout into A''s session');

-- ════════════════════════════════════════════════════════════════════════════
-- save_recipe — replace-children + auto reference row
-- ════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $q$ select save_recipe(null, 'R', 2, 'd', 'i',
        '[{"ingredient_id":"00000000-0000-0000-0000-0000000000d1","quantity":100},
          {"ingredient_id":"00000000-0000-0000-0000-0000000000d2","quantity":50}]'::jsonb) $q$,
  'A save_recipe create succeeds');
select is(
  (select count(*)::int from recipes where created_by_user_id = '11111111-1111-1111-1111-111111111111' and name = 'R'),
  1, 'save_recipe created the recipe owned by A');
select is(
  (select count(*)::int from user_recipe_refs urr
     join recipes r on r.id = urr.recipe_id
    where urr.user_id = '11111111-1111-1111-1111-111111111111' and r.name = 'R'),
  1, 'save_recipe auto-created the user_recipe_refs row');
select is(
  (select count(*)::int from recipe_ingredients ri
     join recipes r on r.id = ri.recipe_id
    where r.created_by_user_id = '11111111-1111-1111-1111-111111111111' and r.name = 'R'),
  2, 'save_recipe inserted two ingredient rows');

select lives_ok(
  $q$ select save_recipe(
        (select id from recipes where created_by_user_id = '11111111-1111-1111-1111-111111111111' and name = 'R'),
        'R', 2, 'd', 'i',
        '[{"ingredient_id":"00000000-0000-0000-0000-0000000000d1","quantity":120}]'::jsonb) $q$,
  'A save_recipe replace succeeds');
select is(
  (select count(*)::int from recipe_ingredients ri
     join recipes r on r.id = ri.recipe_id
    where r.created_by_user_id = '11111111-1111-1111-1111-111111111111' and r.name = 'R'),
  1, 'save_recipe replaced ingredient rows');

-- ════════════════════════════════════════════════════════════════════════════
-- materialize_plan_for_date — Madrid-TZ future guard + idempotency
-- ════════════════════════════════════════════════════════════════════════════
reset role;
insert into recipes (id, created_by_user_id, name) values
  ('00000000-0000-0000-0000-0000000000c1', '11111111-1111-1111-1111-111111111111', 'Plan recipe');
insert into meal_plan_weeks (id, user_id, week_start) values
  ('00000000-0000-0000-0000-0000000000c2', '11111111-1111-1111-1111-111111111111',
   (now() at time zone 'Europe/Madrid')::date);
insert into meal_plan_week_slots (plan_week_id, date, meal_index, recipe_id, servings) values
  ('00000000-0000-0000-0000-0000000000c2', (now() at time zone 'Europe/Madrid')::date, 0,
   '00000000-0000-0000-0000-0000000000c1', 1);

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select materialize_plan_for_date('11111111-1111-1111-1111-111111111111',
                                    (now() at time zone 'Europe/Madrid')::date)),
  1, 'materialize inserts today''s planned slot');
select is(
  (select materialize_plan_for_date('11111111-1111-1111-1111-111111111111',
                                    (now() at time zone 'Europe/Madrid')::date)),
  0, 'materialize is idempotent on a second call');
select is(
  (select materialize_plan_for_date('11111111-1111-1111-1111-111111111111',
                                    (now() at time zone 'Europe/Madrid')::date + 1)),
  0, 'materialize no-ops for a future date');

-- ════════════════════════════════════════════════════════════════════════════
-- set_active_program — at most one active program per user
-- ════════════════════════════════════════════════════════════════════════════
reset role;
insert into programs (id, user_id, name) values
  ('00000000-0000-0000-0000-0000000000f1', '11111111-1111-1111-1111-111111111111', 'P1'),
  ('00000000-0000-0000-0000-0000000000f2', '11111111-1111-1111-1111-111111111111', 'P2');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $q$ select set_active_program('00000000-0000-0000-0000-0000000000f1', current_date) $q$,
  'activate P1');
select is(
  (select count(*)::int from programs where user_id = '11111111-1111-1111-1111-111111111111' and is_active),
  1, 'exactly one active program after first activation');
select lives_ok(
  $q$ select set_active_program('00000000-0000-0000-0000-0000000000f2', current_date) $q$,
  'switch to P2');
select is(
  (select count(*)::int from programs where user_id = '11111111-1111-1111-1111-111111111111' and is_active),
  1, 'still exactly one active program after switching');
select is(
  (select id from programs where user_id = '11111111-1111-1111-1111-111111111111' and is_active),
  '00000000-0000-0000-0000-0000000000f2'::uuid, 'P2 is the active program');

-- ════════════════════════════════════════════════════════════════════════════
-- hide_owned_recipe — drops the caller's ref and anonymises pool ownership
-- ════════════════════════════════════════════════════════════════════════════
reset role;
insert into recipes (id, created_by_user_id, name) values
  ('00000000-0000-0000-0000-0000000000c3', '11111111-1111-1111-1111-111111111111', 'Hide me');
insert into user_recipe_refs (user_id, recipe_id) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000c3');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $q$ select hide_owned_recipe('00000000-0000-0000-0000-0000000000c3') $q$,
  'A hides its own recipe');
select is(
  (select count(*)::int from user_recipe_refs
    where user_id = '11111111-1111-1111-1111-111111111111' and recipe_id = '00000000-0000-0000-0000-0000000000c3'),
  0, 'hide dropped the caller''s reference row');
select is(
  (select created_by_user_id from recipes where id = '00000000-0000-0000-0000-0000000000c3'),
  '00000000-0000-0000-0000-00000000a0a0'::uuid, 'hide transferred ownership to the anon sentinel');

-- a non-owner hide is a no-op (B cannot anonymise A's still-owned recipe 'R')
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $q$ select hide_owned_recipe((select id from recipes where created_by_user_id = '11111111-1111-1111-1111-111111111111' and name = 'R')) $q$,
  'B calling hide on A''s recipe does not error');
select is(
  (select created_by_user_id from recipes where created_by_user_id = '11111111-1111-1111-1111-111111111111' and name = 'R'),
  '11111111-1111-1111-1111-111111111111'::uuid, 'A''s recipe ownership is unchanged by B''s hide');

-- ════════════════════════════════════════════════════════════════════════════
-- reconcile_account_delete — purge refs, anonymise pool, leave others intact
-- ════════════════════════════════════════════════════════════════════════════
reset role;
insert into ingredients (id, created_by_user_id, name, kcal_per_unit, protein_g_per_unit, carbs_g_per_unit, fat_g_per_unit) values
  ('00000000-0000-0000-0000-0000000000aa', '11111111-1111-1111-1111-111111111111', 'A ing', 1, 0.1, 0.1, 0.1),
  ('00000000-0000-0000-0000-0000000000bb', '22222222-2222-2222-2222-222222222222', 'B ing', 1, 0.1, 0.1, 0.1);
insert into user_ingredient_refs (user_id, ingredient_id) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000aa'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000bb');

-- runs as the privileged (service-role-equivalent) context
select lives_ok(
  $q$ select reconcile_account_delete('11111111-1111-1111-1111-111111111111') $q$,
  'reconcile_account_delete runs for A');
select is(
  (select count(*)::int from user_ingredient_refs where user_id = '11111111-1111-1111-1111-111111111111'),
  0, 'A''s ingredient reference rows are purged');
select is(
  (select created_by_user_id from ingredients where id = '00000000-0000-0000-0000-0000000000aa'),
  '00000000-0000-0000-0000-00000000a0a0'::uuid, 'A''s pooled ingredient is anonymised');
select is(
  (select count(*)::int from user_ingredient_refs where user_id = '22222222-2222-2222-2222-222222222222'),
  1, 'B''s reference rows are left intact');
select is(
  (select created_by_user_id from ingredients where id = '00000000-0000-0000-0000-0000000000bb'),
  '22222222-2222-2222-2222-222222222222'::uuid, 'B''s pooled ingredient is left intact');

select * from finish();
rollback;
