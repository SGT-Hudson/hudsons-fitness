-- Project A — fine muscle taxonomy.
-- App has no production users yet → re-tag the system seed in-place, no backfill.
-- Mirrors src/core/muscles.ts (runtime source of truth). The muscles.test.ts
-- unit test + Tier-3 pgTAP assert TS and this seed never drift.

-- 1) muscles dictionary (structure only — names live in i18n, D-E2).
create table if not exists public.muscles (
  code             text primary key,
  muscle_group     text not null,
  body_region_slug text,
  display_order    int  not null default 0,
  is_full_body     boolean not null default false,
  check (muscle_group = any (array[
    'shoulders','chest','back','arms','core','legs','full_body'
  ]))
);

alter table public.muscles enable row level security;
-- Read-only reference data: everyone authenticated may read; nobody writes via RLS.
drop policy if exists muscles_select_all on public.muscles;
create policy muscles_select_all on public.muscles for select using (true);

insert into public.muscles (code, muscle_group, body_region_slug, display_order, is_full_body) values
  ('delt_front','shoulders','deltoids',1,false),
  ('delt_side','shoulders','deltoids',2,false),
  ('delt_rear','shoulders','deltoids',3,false),
  ('pec_upper','chest','chest',4,false),
  ('pec_lower','chest','chest',5,false),
  ('lat','back','upper-back',6,false),
  ('trap','back','trapezius',7,false),
  ('rhomboids','back','upper-back',8,false),
  ('lower_back','back','lower-back',9,false),
  ('neck','back','neck',23,false),
  ('biceps','arms','biceps',10,false),
  ('tri_long','arms','triceps',11,false),
  ('tri_lateral','arms','triceps',12,false),
  ('forearms','arms','forearm',13,false),
  ('abs_upper','core','abs',14,false),
  ('abs_lower','core','abs',15,false),
  ('obliques','core','obliques',16,false),
  ('quads','legs','quadriceps',17,false),
  ('hamstrings','legs','hamstring',18,false),
  ('glutes','legs','gluteal',19,false),
  ('abductors','legs','gluteal',24,false),
  ('adductors','legs','adductors',20,false),
  ('calves','legs','calves',21,false),
  ('tibialis','legs','tibialis',22,false),
  ('full_body','full_body',null,99,true)
on conflict (code) do update set
  muscle_group = excluded.muscle_group,
  body_region_slug = excluded.body_region_slug,
  display_order = excluded.display_order,
  is_full_body = excluded.is_full_body;

-- 2) exercises.primary_muscles[] (multiple primaries); migrate the single value.
alter table public.exercises
  add column if not exists primary_muscles text[] not null default '{}';

-- Drop the old coarse primary CHECK before re-tagging to fine codes.
alter table public.exercises drop constraint if exists exercises_primary_muscle_check;
alter table public.exercises drop constraint if exists exercises_secondary_muscles_valid;

-- 3) validation trigger (a CHECK cannot reference another table).
create or replace function public.validate_exercise_muscles()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (
    select 1 from unnest(new.primary_muscles) c
    where c not in (select code from public.muscles)
  ) then
    raise exception 'primary_muscles contains unknown code';
  end if;
  if exists (
    select 1 from unnest(new.secondary_muscles) c
    where c not in (select code from public.muscles where not is_full_body)
  ) then
    raise exception 'secondary_muscles contains unknown or full_body code';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_exercise_muscles on public.exercises;
create trigger trg_validate_exercise_muscles
  before insert or update on public.exercises
  for each row execute function public.validate_exercise_muscles();

-- 4) re-tag the 34 system seeds to fine codes (system rows only, by English name).
update public.exercises as e
set primary_muscles = v.prim, secondary_muscles = v.sec
from (values
  ('Back squat',                array['quads'],                 array['glutes','hamstrings','adductors','lower_back']),
  ('Front squat',               array['quads'],                 array['glutes','abs_upper','lower_back']),
  ('Deadlift',                  array['lower_back','glutes'],   array['hamstrings','quads','lat','trap','forearms']),
  ('Romanian deadlift',         array['hamstrings'],            array['glutes','lower_back','lat','forearms']),
  ('Barbell hip thrust',        array['glutes'],                array['hamstrings']),
  ('Bench press',               array['pec_lower'],             array['delt_front','tri_lateral','tri_long']),
  ('Incline bench press',       array['pec_upper'],             array['delt_front','tri_lateral','tri_long']),
  ('Overhead press',            array['delt_front'],            array['delt_side','tri_lateral','tri_long','abs_upper']),
  ('Barbell row',               array['lat'],                   array['rhomboids','trap','biceps','forearms','delt_rear']),
  ('Dumbbell press',            array['pec_lower'],             array['delt_front','tri_lateral','tri_long']),
  ('Incline dumbbell press',    array['pec_upper'],             array['delt_front','tri_lateral','tri_long']),
  ('Dumbbell row',              array['lat'],                   array['rhomboids','biceps','forearms','delt_rear']),
  ('Dumbbell curl',             array['biceps'],                array['forearms']),
  ('Dumbbell triceps extension',array['tri_long'],              array['tri_lateral']),
  ('Lateral raises',            array['delt_side'],             array[]::text[]),
  ('Front raises',              array['delt_front'],            array[]::text[]),
  ('Dumbbell rear delt fly',    array['delt_rear'],             array['rhomboids','trap']),
  ('Arnold press',              array['delt_front'],            array['delt_side','tri_lateral','tri_long']),
  ('Leg press',                 array['quads'],                 array['glutes','hamstrings','adductors']),
  ('Leg extension',             array['quads'],                 array[]::text[]),
  ('Leg curl',                  array['hamstrings'],            array['calves']),
  ('Chest press machine',       array['pec_lower'],             array['delt_front','tri_lateral']),
  ('Seated calf raise',         array['calves'],                array[]::text[]),
  ('Lat pulldown',              array['lat'],                   array['biceps','forearms','rhomboids','delt_rear']),
  ('Cable row',                 array['lat'],                   array['rhomboids','trap','biceps','forearms']),
  ('Cable triceps pushdown',    array['tri_lateral'],           array[]::text[]),
  ('Cable biceps curl',         array['biceps'],                array['forearms']),
  ('Cable rear delt fly',       array['delt_rear'],             array['rhomboids','trap']),
  ('Cable crunch',              array['abs_upper'],             array['abs_lower','obliques']),
  ('Pull-ups',                  array['lat'],                   array['biceps','forearms','rhomboids','delt_rear']),
  ('Dips',                      array['pec_lower'],             array['tri_lateral','tri_long','delt_front']),
  ('Plank',                     array['abs_upper'],             array['abs_lower','obliques','delt_front']),
  ('Kettlebell swing',          array['glutes'],                array['hamstrings','lower_back','delt_front','abs_upper']),
  ('Goblet squat',              array['quads'],                 array['glutes','adductors','abs_upper'])
) as v(name_en, prim, sec)
where e.source = 'system' and e.name_en = v.name_en;

-- 5) drop the legacy single-value column (no prod users).
alter table public.exercises drop column if exists primary_muscle;

-- ── ROLLBACK ─────────────────────────────────────────────────────────────────
-- ROLLBACK:
--   alter table public.exercises add column if not exists primary_muscle text;
--   drop trigger if exists trg_validate_exercise_muscles on public.exercises;
--   drop function if exists public.validate_exercise_muscles();
--   alter table public.exercises drop column if exists primary_muscles;
--   drop table if exists public.muscles;
