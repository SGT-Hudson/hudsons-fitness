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

-- B cannot mutate A's session through the RPC. Target a fixed-id A-owned
-- session by literal — a subquery would be hidden from B by RLS, so
-- save_workout would receive NULL and create a new session instead of failing.
reset role;
insert into workout_sessions (id, user_id, title)
  values ('00000000-0000-0000-0000-0000000000a5', '11111111-1111-1111-1111-111111111111', 'A owned');
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $q$ select save_workout('00000000-0000-0000-0000-0000000000a5',
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
-- hide_owned_recipe — drops the caller's reference row; pool ownership is kept
-- (R-25: the anon transfer was removed — it was Phase-2-reaper-only and broke
-- under RLS; the creator retains ownership + edit rights).
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
  '11111111-1111-1111-1111-111111111111'::uuid, 'hide leaves pool ownership with the creator');

-- a non-owner hide is a no-op (B cannot anonymise A's still-owned recipe 'R')
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $q$ select hide_owned_recipe((select id from recipes where created_by_user_id = '11111111-1111-1111-1111-111111111111' and name = 'R')) $q$,
  'B calling hide on A''s recipe does not error');
select is(
  (select created_by_user_id from recipes where created_by_user_id = '11111111-1111-1111-1111-111111111111' and name = 'R'),
  '11111111-1111-1111-1111-111111111111'::uuid, 'A''s recipe ownership is unchanged by B''s hide');

-- hide_owned_ingredient mirrors the recipe path (ref dropped, ownership kept)
reset role;
insert into ingredients (id, created_by_user_id, name, kcal_per_unit, protein_g_per_unit, carbs_g_per_unit, fat_g_per_unit) values
  ('00000000-0000-0000-0000-0000000000c4', '11111111-1111-1111-1111-111111111111', 'Hide ing', 1, 0.1, 0.1, 0.1);
insert into user_ingredient_refs (user_id, ingredient_id) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000c4');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $q$ select hide_owned_ingredient('00000000-0000-0000-0000-0000000000c4') $q$,
  'A hides its own ingredient');
select is(
  (select count(*)::int from user_ingredient_refs
    where user_id = '11111111-1111-1111-1111-111111111111' and ingredient_id = '00000000-0000-0000-0000-0000000000c4'),
  0, 'hide dropped the caller''s ingredient reference row');
select is(
  (select created_by_user_id from ingredients where id = '00000000-0000-0000-0000-0000000000c4'),
  '11111111-1111-1111-1111-111111111111'::uuid, 'hide leaves ingredient ownership with the creator');

-- ════════════════════════════════════════════════════════════════════════════
-- R-33 wave 4 — meal_plan_templates.phase_type
-- The column's check constraint, the phase round-trip through save_template
-- (create / update / clear-to-null), save_week_as_template tagging what it
-- creates, and RLS still hiding A's templates from B. The pre-existing RPC
-- behaviour (children replaced, Monday-derived default_meal_times fallback,
-- is_auto_generated = false, same_schedule_all_days = true) is asserted too, so
-- the DROP-and-recreate cannot have silently changed it.
-- ════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;

-- create, tagged 'cut', with slots + day_times (old behaviour must survive)
select lives_ok(
  $q$ select save_template(null, 'T cut', true, array['08:00','14:00'],
        '[{"day_of_week":0,"meal_index":0,"recipe_id":"00000000-0000-0000-0000-0000000000c1","servings":1},
          {"day_of_week":1,"meal_index":0,"recipe_id":"00000000-0000-0000-0000-0000000000c1","servings":2}]'::jsonb,
        '[{"day_of_week":0,"meal_times":["08:00","14:00"]}]'::jsonb,
        'cut') $q$,
  'save_template tags a template with a phase');
select is(
  (select phase_type from meal_plan_templates where name = 'T cut'),
  'cut', 'the phase round-trips on create');
select is(
  (select count(*)::int from meal_plan_template_slots s
     join meal_plan_templates t on t.id = s.template_id where t.name = 'T cut'),
  2, 'save_template still writes its slot children');
select is(
  (select count(*)::int from meal_plan_template_day_times d
     join meal_plan_templates t on t.id = d.template_id where t.name = 'T cut'),
  1, 'save_template still writes its day_times children');

-- the other two valid phases, and no phase at all
select lives_ok(
  $q$ select save_template(null, 'T maint', true, array['08:00'], '[]'::jsonb, '[]'::jsonb, 'maintenance') $q$,
  'save_template accepts maintenance');
select lives_ok(
  $q$ select save_template(null, 'T none', true, array['08:00'], '[]'::jsonb, '[]'::jsonb, null) $q$,
  'save_template accepts a template with no phase');
select is(
  (select phase_type from meal_plan_templates where name = 'T none'),
  null::text, 'an untagged template really has a null phase');

-- the check constraint rejects anything that is not cut/maintenance/bulk
select throws_ok(
  $q$ select save_template(null, 'T bogus', true, array['08:00'], '[]'::jsonb, '[]'::jsonb, 'bulking') $q$,
  '23514', null,
  'the check constraint rejects a phase that is not cut/maintenance/bulk');

-- update: re-tag, then clear back to null
select lives_ok(
  $q$ select save_template(
        (select id from meal_plan_templates where name = 'T cut'),
        'T cut', true, array['08:00','14:00'],
        '[{"day_of_week":0,"meal_index":0,"recipe_id":"00000000-0000-0000-0000-0000000000c1","servings":1}]'::jsonb,
        '[]'::jsonb, 'bulk') $q$,
  'save_template re-tags an existing template');
select is(
  (select phase_type from meal_plan_templates where name = 'T cut'),
  'bulk', 'the phase round-trips on update');
select is(
  (select count(*)::int from meal_plan_template_slots s
     join meal_plan_templates t on t.id = s.template_id where t.name = 'T cut'),
  1, 'save_template still replaces (not duplicates) its slot children on update');
select is(
  (select count(*)::int from meal_plan_template_day_times d
     join meal_plan_templates t on t.id = d.template_id where t.name = 'T cut'),
  0, 'save_template still clears day_times children on update');

select lives_ok(
  $q$ select save_template(
        (select id from meal_plan_templates where name = 'T cut'),
        'T cut', true, array['08:00','14:00'], '[]'::jsonb, '[]'::jsonb, null) $q$,
  'save_template clears a phase back to null');
select is(
  (select phase_type from meal_plan_templates where name = 'T cut'),
  null::text, 'a cleared phase really is null, not the old value');

-- save_week_as_template tags what it creates, and keeps its old semantics.
-- Week c2 (seeded above) has one slot with a null meal_time, so this also
-- exercises the Monday-derived default_meal_times fallback.
select lives_ok(
  $q$ select save_week_as_template('00000000-0000-0000-0000-0000000000c2', 'From week', 'cut') $q$,
  'save_week_as_template runs with a phase');
select is(
  (select phase_type from meal_plan_templates where name = 'From week'),
  'cut', 'save_week_as_template tags the template it creates');
select is(
  (select is_auto_generated from meal_plan_templates where name = 'From week'),
  false, 'save_week_as_template still hard-codes is_auto_generated = false');
select is(
  (select same_schedule_all_days from meal_plan_templates where name = 'From week'),
  true, 'save_week_as_template still hard-codes same_schedule_all_days = true');
select is(
  (select default_meal_times from meal_plan_templates where name = 'From week'),
  array['08:00','13:00','17:00','21:00']::time[],
  'save_week_as_template still falls back to the default meal times');
select is(
  (select count(*)::int from meal_plan_template_slots s
     join meal_plan_templates t on t.id = s.template_id where t.name = 'From week'),
  1, 'save_week_as_template still copies the week''s slots');

-- RLS is untouched: B cannot see or write A's templates. Target A's template by
-- a fixed literal id — a subquery would be hidden from B by RLS, so save_template
-- would receive NULL and create a new template instead of failing (same trap as
-- the save_workout section above).
reset role;
insert into meal_plan_templates (id, user_id, name, phase_type) values
  ('00000000-0000-0000-0000-0000000000e9', '11111111-1111-1111-1111-111111111111', 'A owned tpl', 'cut');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select count(*)::int from meal_plan_templates where name in ('T cut', 'From week', 'A owned tpl')),
  0, 'RLS still hides A''s templates from B');
select throws_ok(
  $q$ select save_template(
        '00000000-0000-0000-0000-0000000000e9', 'hijack', true,
        array['08:00'], '[]'::jsonb, '[]'::jsonb, 'bulk') $q$,
  'P0001', 'template not found or not owned by user',
  'B cannot save_template into A''s template');
select throws_ok(
  $q$ select save_week_as_template('00000000-0000-0000-0000-0000000000c2', 'hijack week', 'bulk') $q$,
  'P0001', 'week not found',
  'B cannot save_week_as_template from A''s week');

reset role;
select is(
  (select phase_type from meal_plan_templates where id = '00000000-0000-0000-0000-0000000000e9'),
  'cut', 'A''s template phase is unchanged by B''s attempts');

-- ════════════════════════════════════════════════════════════════════════════
-- R-33 wave 5 — recipes.prep_time_minutes
-- The column's check constraint (positive integer minutes or null), the
-- round-trip through save_recipe (create / update / clear-to-null), and the
-- pre-existing RPC behaviour the DROP-and-recreate must not have changed:
-- ownership is still enforced on update, and children are still replaced.
-- ════════════════════════════════════════════════════════════════════════════
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;

-- the check constraint, straight at the table
select throws_ok(
  $q$ insert into recipes (created_by_user_id, name, prep_time_minutes)
      values ('11111111-1111-1111-1111-111111111111', 'zero prep', 0) $q$,
  '23514', null,
  'the check constraint rejects a prep time of 0');
select throws_ok(
  $q$ insert into recipes (created_by_user_id, name, prep_time_minutes)
      values ('11111111-1111-1111-1111-111111111111', 'negative prep', -5) $q$,
  '23514', null,
  'the check constraint rejects a negative prep time');
select lives_ok(
  $q$ insert into recipes (created_by_user_id, name, prep_time_minutes)
      values ('11111111-1111-1111-1111-111111111111', 'positive prep', 45) $q$,
  'the check constraint accepts a positive prep time');
select lives_ok(
  $q$ insert into recipes (created_by_user_id, name, prep_time_minutes)
      values ('11111111-1111-1111-1111-111111111111', 'null prep', null) $q$,
  'the check constraint accepts a null prep time (no time recorded)');

-- create through the RPC, with a prep time and the meal types still in place
select lives_ok(
  $q$ select save_recipe(null, 'R prep', 2, 'd', 'i',
        '[{"ingredient_id":"00000000-0000-0000-0000-0000000000d1","quantity":100},
          {"ingredient_id":"00000000-0000-0000-0000-0000000000d2","quantity":50}]'::jsonb,
        array['lunch']::text[], 35) $q$,
  'save_recipe creates a recipe with a prep time');
select is(
  (select prep_time_minutes from recipes where name = 'R prep'),
  35, 'the prep time round-trips on create');
select is(
  (select meal_types from recipes where name = 'R prep'),
  array['lunch']::text[], 'save_recipe still writes meal_types (U-2 behaviour survives the recreate)');
select is(
  (select count(*)::int from recipe_ingredients ri
     join recipes r on r.id = ri.recipe_id where r.name = 'R prep'),
  2, 'save_recipe still writes its ingredient children');

-- create with no prep time at all (the default keeps the 7-arg call sites honest)
select lives_ok(
  $q$ select save_recipe(null, 'R no prep', 1, null, null, '[]'::jsonb, array['snack']::text[]) $q$,
  'save_recipe still accepts a call that omits the prep time');
select is(
  (select prep_time_minutes from recipes where name = 'R no prep'),
  null::int, 'a recipe saved without a prep time really has none');

-- a bad prep time through the RPC is rejected by the constraint, not by app code
select throws_ok(
  $q$ select save_recipe(null, 'R bad prep', 1, null, null, '[]'::jsonb, '{}'::text[], 0) $q$,
  '23514', null,
  'save_recipe surfaces the check constraint for a prep time of 0');

-- update: re-time, and children are still replaced (not duplicated)
select lives_ok(
  $q$ select save_recipe(
        (select id from recipes where name = 'R prep'),
        'R prep', 2, 'd', 'i',
        '[{"ingredient_id":"00000000-0000-0000-0000-0000000000d1","quantity":120}]'::jsonb,
        array['lunch']::text[], 50) $q$,
  'save_recipe updates the prep time of an existing recipe');
select is(
  (select prep_time_minutes from recipes where name = 'R prep'),
  50, 'the prep time round-trips on update');
select is(
  (select count(*)::int from recipe_ingredients ri
     join recipes r on r.id = ri.recipe_id where r.name = 'R prep'),
  1, 'save_recipe still replaces (not duplicates) its ingredient children on update');

-- clearing back to null is a real write, not an omission
select lives_ok(
  $q$ select save_recipe(
        (select id from recipes where name = 'R prep'),
        'R prep', 2, 'd', 'i', '[]'::jsonb, array['lunch']::text[], null) $q$,
  'save_recipe clears a prep time back to null');
select is(
  (select prep_time_minutes from recipes where name = 'R prep'),
  null::int, 'a cleared prep time really is null, not the old value');

-- ownership is still enforced on update. Fixed literal id: a subquery would be
-- hidden from B by RLS, so save_recipe would receive NULL and create a new
-- recipe instead of failing (same trap as the save_workout section above).
reset role;
insert into recipes (id, created_by_user_id, name, prep_time_minutes) values
  ('00000000-0000-0000-0000-0000000000f1', '11111111-1111-1111-1111-111111111111', 'A owned recipe', 20);

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $q$ select save_recipe('00000000-0000-0000-0000-0000000000f1', 'hijack', 1, null, null,
        '[]'::jsonb, '{}'::text[], 99) $q$,
  'P0001', 'recipe not found or not owned by user',
  'B cannot save_recipe into A''s recipe');

reset role;
select is(
  (select prep_time_minutes from recipes where id = '00000000-0000-0000-0000-0000000000f1'),
  20, 'A''s prep time is unchanged by B''s attempt');

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
