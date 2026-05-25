-- F-4 — per-exercise secondary movers for the muscle heatmap.
-- App has no production users yet → re-tag the system seed in-place, no backfill.

alter table public.exercises
  add column if not exists secondary_muscles text[] not null default '{}';

alter table public.exercises
  drop constraint if exists exercises_secondary_muscles_valid;
alter table public.exercises
  add constraint exercises_secondary_muscles_valid check (
    secondary_muscles <@ array[
      'chest','back','shoulders','quads','hamstrings','glutes',
      'calves','biceps','triceps','core','forearms'
    ]::text[]
  );

-- Re-tag the 34 system seeds by English name (system rows only).
update public.exercises as e
set secondary_muscles = v.sec
from (values
  ('Back squat',                array['glutes','hamstrings','core']),
  ('Front squat',               array['glutes','core']),
  ('Deadlift',                  array['glutes','hamstrings','quads','forearms','core']),
  ('Romanian deadlift',         array['glutes','back','forearms']),
  ('Barbell hip thrust',        array['hamstrings']),
  ('Bench press',               array['shoulders','triceps']),
  ('Incline bench press',       array['shoulders','triceps']),
  ('Overhead press',            array['triceps','core']),
  ('Barbell row',               array['biceps','forearms','shoulders']),
  ('Dumbbell press',            array['shoulders','triceps']),
  ('Incline dumbbell press',    array['shoulders','triceps']),
  ('Dumbbell row',              array['biceps','forearms']),
  ('Dumbbell curl',             array['forearms']),
  ('Dumbbell triceps extension',array[]::text[]),
  ('Lateral raises',            array[]::text[]),
  ('Front raises',              array[]::text[]),
  ('Dumbbell rear delt fly',    array['back']),
  ('Arnold press',              array['triceps']),
  ('Leg press',                 array['glutes','hamstrings']),
  ('Leg extension',             array[]::text[]),
  ('Leg curl',                  array['calves']),
  ('Chest press machine',       array['shoulders','triceps']),
  ('Seated calf raise',         array[]::text[]),
  ('Lat pulldown',              array['biceps','forearms']),
  ('Cable row',                 array['biceps','forearms']),
  ('Cable triceps pushdown',    array[]::text[]),
  ('Cable biceps curl',         array['forearms']),
  ('Cable rear delt fly',       array['back']),
  ('Cable crunch',              array[]::text[]),
  ('Pull-ups',                  array['biceps','forearms']),
  ('Dips',                      array['triceps','shoulders']),
  ('Plank',                     array['shoulders']),
  ('Kettlebell swing',          array['hamstrings','back','core']),
  ('Goblet squat',              array['glutes','core'])
) as v(name_en, sec)
where e.source = 'system' and e.name_en = v.name_en;

-- ROLLBACK:
--   alter table public.exercises drop constraint if exists exercises_secondary_muscles_valid;
--   alter table public.exercises drop column if exists secondary_muscles;
