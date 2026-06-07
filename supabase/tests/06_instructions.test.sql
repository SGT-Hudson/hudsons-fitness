begin;
select * from no_plan();

-- columns exist with the expected type
select has_column('public', 'exercises', 'instructions_en', 'instructions_en column exists');
select has_column('public', 'exercises', 'instructions_es', 'instructions_es column exists');
select col_type_is('public', 'exercises', 'instructions_en', 'text[]', 'instructions_en is text[]');
select col_type_is('public', 'exercises', 'instructions_es', 'text[]', 'instructions_es is text[]');

-- a sampled free-exercise-db row has non-empty, equal-length EN/ES instructions
-- (Barbell_Curl has 5 source steps; NOT one of the 5 empty-source rows)
select ok(
  (select coalesce(array_length(instructions_en, 1), 0) from public.exercises
     where external_id = 'Barbell_Curl' and source = 'free-exercise-db') > 0,
  'Barbell_Curl has >=1 EN instruction step');
select is(
  (select array_length(instructions_en, 1) from public.exercises
     where external_id = 'Barbell_Curl' and source = 'free-exercise-db'),
  (select array_length(instructions_es, 1) from public.exercises
     where external_id = 'Barbell_Curl' and source = 'free-exercise-db'),
  'Barbell_Curl EN/ES instruction arrays are equal length');

-- a source='system' row has empty instructions (no source steps; arrays stay '{}')
select is(
  (select coalesce(array_length(instructions_en, 1), 0) from public.exercises
     where name_en = 'Back squat' and source = 'system'),
  0, 'Back squat (system) has empty instructions_en');
select is(
  (select coalesce(array_length(instructions_es, 1), 0) from public.exercises
     where name_en = 'Back squat' and source = 'system'),
  0, 'Back squat (system) has empty instructions_es');

select * from finish();
rollback;
