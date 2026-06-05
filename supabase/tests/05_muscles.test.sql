-- supabase/tests/05_muscles.test.sql
-- Tier-3 — fine muscle taxonomy: seed completeness, anti-drift vs src/core/muscles.ts,
-- the validate_exercise_muscles trigger, and the system re-tag.
begin;
select * from no_plan();

-- 25 codes seeded (24 shadeable + full_body), exactly matching src/core/muscles.ts.
select set_eq(
  $$ select code from public.muscles $$,
  $$ values ('delt_front'),('delt_side'),('delt_rear'),('pec_upper'),('pec_lower'),
            ('lat'),('trap'),('rhomboids'),('lower_back'),('neck'),('biceps'),
            ('tri_long'),('tri_lateral'),('forearms'),('abs_upper'),('abs_lower'),
            ('obliques'),('quads'),('hamstrings'),('glutes'),('abductors'),
            ('adductors'),('calves'),('tibialis'),('full_body') $$,
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

-- ── B1 catalog seed + post-import muscle-tag review ──────────────────────────
-- ASSERTED FIRST, before the schema-CHECK test inserts below: those inserts run
-- in this same transaction and one of them (`src1`, source='free-exercise-db',
-- external_id null) would otherwise pollute these provenance counts.
-- The seed imported exactly 873 rows; the review migration
-- (20260605120000_b1_catalog_review) then corrected 146 primary tags and flipped
-- is_verified=true on the 402 reviewed-correct rows (256 confirmed + 146 corrected).
select is(
  (select count(*)::int from public.exercises where source = 'free-exercise-db'),
  873, 'catalog seed imported 873 rows');
select is(
  (select count(*)::int from public.exercises
     where source = 'free-exercise-db' and is_verified),
  402, 'catalog review verified 402 reviewed-correct rows');
select is(
  (select count(*)::int from public.exercises
     where source = 'free-exercise-db' and external_id is null),
  0, 'every imported row carries an external_id');
-- the review assigns codes the coarse->fine mapper cannot emit (obliques/full_body)
select is(
  (select primary_muscles from public.exercises
     where external_id = 'Clean' and source = 'free-exercise-db'),
  array['full_body'], 'Olympic-lift Clean corrected to full_body primary');
select is(
  (select primary_muscles from public.exercises
     where external_id = 'Advanced_Kettlebell_Windmill' and source = 'free-exercise-db'),
  array['obliques'], 'kettlebell windmill corrected to obliques primary');

-- ── B1 catalog schema ─────────────────────────────────────────────────────────

-- equipment CHECK accepts all 12 values (a single multi-row insert; rolls back).
insert into public.exercises (name_es, equipment) values
  ('eq1','barbell'),('eq2','dumbbell'),('eq3','kettlebell'),('eq4','ez_curl_bar'),
  ('eq5','machine'),('eq6','cable'),('eq7','bodyweight'),('eq8','band'),
  ('eq9','medicine_ball'),('eq10','exercise_ball'),('eq11','foam_roller'),('eq12','other');
select is(
  (select count(*)::int from public.exercises where name_es like 'eq%'),
  12, 'equipment CHECK accepts all 12 values');

-- equipment CHECK rejects a bogus value.
select throws_ok(
  $$ insert into public.exercises (name_es, equipment) values ('bad','sledgehammer') $$,
  '23514');  -- check_violation

-- level / mechanic / force / category CHECKs reject bogus values.
select throws_ok(
  $$ insert into public.exercises (name_es, level) values ('bad','novice') $$, '23514');
select throws_ok(
  $$ insert into public.exercises (name_es, mechanic) values ('bad','hybrid') $$, '23514');
select throws_ok(
  $$ insert into public.exercises (name_es, force) values ('bad','twist') $$, '23514');
select throws_ok(
  $$ insert into public.exercises (name_es, category) values ('bad','calisthenics') $$, '23514');

-- level / category accept verified values.
insert into public.exercises (name_es, level, category) values ('ok1','expert','olympic weightlifting');
select is(
  (select count(*)::int from public.exercises where name_es = 'ok1'),
  1, 'level=expert + category=olympic weightlifting accepted');

-- external_id is unique (partial index — the second insert must throw 23505).
insert into public.exercises (name_es, external_id) values ('ux1','dup_ext');
select throws_ok(
  $$ insert into public.exercises (name_es, external_id) values ('ux2','dup_ext') $$,
  '23505');  -- unique_violation

-- source CHECK now allows the import provenance.
insert into public.exercises (name_es, source) values ('src1','free-exercise-db');
select is(
  (select source from public.exercises where name_es = 'src1'),
  'free-exercise-db', 'source free-exercise-db accepted');

select * from finish();
rollback;
