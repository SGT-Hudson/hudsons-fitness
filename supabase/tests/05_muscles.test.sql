-- supabase/tests/05_muscles.test.sql
-- Tier-3 — fine muscle taxonomy: seed completeness, anti-drift vs src/core/muscles.ts,
-- the validate_exercise_muscles trigger, and the system re-tag.
begin;
select * from no_plan();

-- 23 codes seeded (22 shadeable + full_body), exactly matching src/core/muscles.ts.
select set_eq(
  $$ select code from public.muscles $$,
  $$ values ('delt_front'),('delt_side'),('delt_rear'),('pec_upper'),('pec_lower'),
            ('lat'),('trap'),('rhomboids'),('lower_back'),('biceps'),('tri_long'),
            ('tri_lateral'),('forearms'),('abs_upper'),('abs_lower'),('obliques'),
            ('quads'),('hamstrings'),('glutes'),('adductors'),('calves'),('tibialis'),
            ('full_body') $$,
  'muscles seed == src/core/muscles.ts code set'
);

-- exactly one full_body, with a null region
select is((select count(*)::int from public.muscles where is_full_body), 1, 'one full_body row');
select is((select body_region_slug from public.muscles where code='full_body'), null, 'full_body has no region');

-- every system exercise has at least one fine primary after the re-tag
select is(
  (select count(*)::int from public.exercises
     where source='system' and coalesce(array_length(primary_muscles,1),0) = 0),
  0, 'every system exercise has >=1 primary');

-- trigger rejects an unknown primary code
select throws_ok(
  $$ insert into public.exercises (name_es, primary_muscles) values ('bad', array['bogus']) $$,
  'primary_muscles contains unknown code');

-- trigger rejects full_body as a secondary
select throws_ok(
  $$ insert into public.exercises (name_es, secondary_muscles) values ('bad', array['full_body']) $$,
  'secondary_muscles contains unknown or full_body code');

select * from finish();
rollback;
