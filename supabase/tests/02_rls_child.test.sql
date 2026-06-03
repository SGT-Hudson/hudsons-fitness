-- Tier-3 / R-16 — RLS isolation on child tables (ownership via a join to the
-- parent). Covers workout_sets, recipe_ingredients (both with the R-22
-- UPDATE-WITH-CHECK gap, asserted under todo) and routine_exercises,
-- program_days (F-2 closed the gap — hard assertions).

begin;
select * from no_plan();

-- ── seed (privileged) ────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.dev'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.dev');

-- shared-pool seeds (system-owned)
insert into exercises (id, name_es) values
  ('00000000-0000-0000-0000-0000000000e1', 'Press banca');
insert into ingredients (id, name, kcal_per_unit, protein_g_per_unit, carbs_g_per_unit, fat_g_per_unit) values
  ('00000000-0000-0000-0000-0000000000d1', 'Pollo', 1.65, 0.31, 0, 0.036),
  ('00000000-0000-0000-0000-0000000000d2', 'Arroz', 1.30, 0.027, 0.28, 0.003);

-- parents: A-owned and B-owned
insert into workout_sessions (id, user_id) values
  ('00000000-0000-0000-0000-00000000005a', '11111111-1111-1111-1111-111111111111'),
  ('00000000-0000-0000-0000-00000000005b', '22222222-2222-2222-2222-222222222222');
insert into recipes (id, created_by_user_id, name) values
  ('00000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'Recipe A'),
  ('00000000-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', 'Recipe B');
insert into routines (id, user_id, name) values
  ('00000000-0000-0000-0000-0000000000a2', '11111111-1111-1111-1111-111111111111', 'Routine A'),
  ('00000000-0000-0000-0000-0000000000b2', '22222222-2222-2222-2222-222222222222', 'Routine B');
insert into programs (id, user_id, name) values
  ('00000000-0000-0000-0000-0000000000a3', '11111111-1111-1111-1111-111111111111', 'Program A'),
  ('00000000-0000-0000-0000-0000000000b3', '22222222-2222-2222-2222-222222222222', 'Program B');

-- B-owned child rows (used by the re-point tests) + one A-owned set (SELECT denial)
insert into workout_sets (id, session_id, exercise_id, set_index, reps, weight_kg) values
  ('00000000-0000-0000-0000-0000000000ca', '00000000-0000-0000-0000-00000000005a', '00000000-0000-0000-0000-0000000000e1', 1, 5, 100),
  ('00000000-0000-0000-0000-0000000000cb', '00000000-0000-0000-0000-00000000005b', '00000000-0000-0000-0000-0000000000e1', 1, 5, 100);
insert into recipe_ingredients (recipe_id, ingredient_id, quantity) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', 100);
insert into routine_exercises (routine_id, exercise_id, position, target_sets, target_reps_min, target_reps_max) values
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000e1', 1, 3, 5, 8);
-- rest days (is_rest true, routine_id null) satisfy program_days_check
insert into program_days (program_id, day_index, is_rest) values
  ('00000000-0000-0000-0000-0000000000b3', 0, true);

-- act as user B for all behavioural assertions
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;

-- ── workout_sets (parent workout_sessions) ───────────────────────────────────
select is(
  (select count(*)::int from workout_sets
    where session_id = '00000000-0000-0000-0000-00000000005a'),
  0, 'B cannot SELECT a set in A''s session');
select lives_ok(
  $q$ insert into workout_sets (session_id, exercise_id, set_index, reps, weight_kg)
      values ('00000000-0000-0000-0000-00000000005b','00000000-0000-0000-0000-0000000000e1',2,8,80) $q$,
  'B can INSERT a set into its own session');
select throws_ok(
  $q$ insert into workout_sets (session_id, exercise_id, set_index, reps, weight_kg)
      values ('00000000-0000-0000-0000-00000000005a','00000000-0000-0000-0000-0000000000e1',9,8,80) $q$,
  '42501', NULL, 'B cannot INSERT a set into A''s session');
-- R-22 gap: workout_sets UPDATE has USING but no WITH CHECK, so re-pointing a
-- child into another user's parent is not blocked yet. Asserted under todo so
-- it is visible and non-failing; flip to a hard assertion when R-22 lands.
select todo_start('R-22: workout_sets UPDATE lacks WITH CHECK');
select throws_ok(
  $q$ update workout_sets set session_id = '00000000-0000-0000-0000-00000000005a'
       where id = '00000000-0000-0000-0000-0000000000cb' $q$,
  '42501', NULL, 'B cannot re-point its own set into A''s session');
select todo_end();

-- ── recipe_ingredients (parent recipes) ──────────────────────────────────────
select lives_ok(
  $q$ insert into recipe_ingredients (recipe_id, ingredient_id, quantity)
      values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000d2',50) $q$,
  'B can INSERT an ingredient row into its own recipe');
select throws_ok(
  $q$ insert into recipe_ingredients (recipe_id, ingredient_id, quantity)
      values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d2',50) $q$,
  '42501', NULL, 'B cannot INSERT an ingredient row into A''s recipe');
select todo_start('R-22: recipe_ingredients UPDATE lacks WITH CHECK');
select throws_ok(
  $q$ update recipe_ingredients set recipe_id = '00000000-0000-0000-0000-0000000000a1'
       where recipe_id = '00000000-0000-0000-0000-0000000000b1'
         and ingredient_id = '00000000-0000-0000-0000-0000000000d1' $q$,
  '42501', NULL, 'B cannot re-point its own recipe_ingredient into A''s recipe');
select todo_end();

-- ── routine_exercises (parent routines) — F-2 closed the gap ─────────────────
select lives_ok(
  $q$ insert into routine_exercises (routine_id, exercise_id, position, target_sets, target_reps_min, target_reps_max)
      values ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000e1',2,3,5,8) $q$,
  'B can INSERT an exercise into its own routine');
select throws_ok(
  $q$ insert into routine_exercises (routine_id, exercise_id, position, target_sets, target_reps_min, target_reps_max)
      values ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000e1',1,3,5,8) $q$,
  '42501', NULL, 'B cannot INSERT an exercise into A''s routine');
select throws_ok(
  $q$ update routine_exercises set routine_id = '00000000-0000-0000-0000-0000000000a2'
       where routine_id = '00000000-0000-0000-0000-0000000000b2' and position = 1 $q$,
  '42501', NULL, 'B cannot re-point its own routine_exercise into A''s routine');

-- ── program_days (parent programs) — F-2 closed the gap ──────────────────────
select lives_ok(
  $q$ insert into program_days (program_id, day_index, is_rest)
      values ('00000000-0000-0000-0000-0000000000b3',1,true) $q$,
  'B can INSERT a day into its own program');
select throws_ok(
  $q$ insert into program_days (program_id, day_index, is_rest)
      values ('00000000-0000-0000-0000-0000000000a3',5,true) $q$,
  '42501', NULL, 'B cannot INSERT a day into A''s program');
select throws_ok(
  $q$ update program_days set program_id = '00000000-0000-0000-0000-0000000000a3'
       where program_id = '00000000-0000-0000-0000-0000000000b3' and day_index = 0 $q$,
  '42501', NULL, 'B cannot re-point its own program_day into A''s program');

select * from finish();
rollback;
