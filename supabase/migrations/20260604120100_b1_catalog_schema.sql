-- Project B1 — catalog ingestion schema (free-exercise-db).
-- Adds the rich-metadata columns the 873-row import needs, widens the equipment
-- and source CHECKs, and adds the external_id unique key the seed upserts on.
-- The data seed lands in a separate generated migration (…_b1_catalog_seed.sql).
-- No production users yet → reshape freely; no backfill.

-- 1) new metadata columns (all nullable except images, which defaults to '{}').
alter table public.exercises
  add column if not exists level       text,
  add column if not exists mechanic    text,
  add column if not exists force       text,
  add column if not exists category    text,
  add column if not exists images      text[] not null default '{}',
  add column if not exists external_id text;

-- 2) idempotency key for the seed upsert (partial — manual rows keep external_id null).
create unique index if not exists idx_exercises_external_id
  on public.exercises (external_id) where external_id is not null;

-- 3) metadata CHECKs (values verified against the dataset, design §2).
alter table public.exercises drop constraint if exists exercises_level_check;
alter table public.exercises add constraint exercises_level_check
  check (level is null or level = any (array['beginner','intermediate','expert']));

alter table public.exercises drop constraint if exists exercises_mechanic_check;
alter table public.exercises add constraint exercises_mechanic_check
  check (mechanic is null or mechanic = any (array['compound','isolation']));

alter table public.exercises drop constraint if exists exercises_force_check;
alter table public.exercises add constraint exercises_force_check
  check (force is null or force = any (array['push','pull','static']));

alter table public.exercises drop constraint if exists exercises_category_check;
alter table public.exercises add constraint exercises_category_check
  check (category is null or category = any (array[
    'strength','stretching','plyometrics','powerlifting',
    'olympic weightlifting','strongman','cardio'
  ]));

-- 4) widen the equipment CHECK 8 -> 12 values.
--    The original CHECK is declared table-level + anonymous in `create table`
--    (20260522120000_training_exercises.sql lines 40-46). Postgres auto-names a
--    single-column table-level CHECK `<table>_<col>_check`, so on the local/CI DB
--    (verified 2026-06-05) it is `exercises_equipment_check` — the literal
--    `drop … if exists` below removes it and the widened replacement is re-added
--    under the same stable name. The pg_constraint introspection is a
--    belt-and-suspenders: should any environment instead carry a multi-column or
--    differently-named CHECK referencing `equipment` (auto-named `exercises_check{N}`),
--    this drops it too. The guard skips our own name so the two paths don't collide.
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'exercises'
      and con.contype = 'c'
      and con.conname <> 'exercises_equipment_check'      -- skip our own (re-runs)
      and pg_get_constraintdef(con.oid) ilike '%equipment%'
  loop
    execute format('alter table public.exercises drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.exercises drop constraint if exists exercises_equipment_check;
alter table public.exercises add constraint exercises_equipment_check
  check (
    equipment is null
    or equipment = any (array[
      'barbell','dumbbell','kettlebell','ez_curl_bar','machine','cable',
      'bodyweight','band','medicine_ball','exercise_ball','foam_roller','other'
    ])
  );

-- 5) widen the source CHECK to allow the import provenance. Same situation as
--    equipment: the original anonymous single-column CHECK is auto-named
--    `exercises_source_check` (verified), handled by the literal drop+add; the
--    introspection drops any other CHECK referencing `source` for robustness.
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'exercises'
      and con.contype = 'c'
      and con.conname <> 'exercises_source_check'         -- skip our own (re-runs)
      and pg_get_constraintdef(con.oid) ilike '%source%'
  loop
    execute format('alter table public.exercises drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.exercises drop constraint if exists exercises_source_check;
alter table public.exercises add constraint exercises_source_check
  check (source = any (array['manual','system','free-exercise-db']));

-- ── ROLLBACK ─────────────────────────────────────────────────────────────────
-- ROLLBACK:
--   alter table public.exercises drop constraint if exists exercises_level_check;
--   alter table public.exercises drop constraint if exists exercises_mechanic_check;
--   alter table public.exercises drop constraint if exists exercises_force_check;
--   alter table public.exercises drop constraint if exists exercises_category_check;
--   drop index if exists public.idx_exercises_external_id;
--   alter table public.exercises drop column if exists external_id;
--   alter table public.exercises drop column if exists images;
--   alter table public.exercises drop column if exists category;
--   alter table public.exercises drop column if exists force;
--   alter table public.exercises drop column if exists mechanic;
--   alter table public.exercises drop column if exists level;
--   alter table public.exercises drop constraint if exists exercises_source_check;
--   alter table public.exercises add constraint exercises_source_check
--     check (source = any (array['manual','system']));
--   alter table public.exercises drop constraint if exists exercises_equipment_check;
--   alter table public.exercises add constraint exercises_equipment_check
--     check (equipment is null or equipment = any (array[
--       'barbell','dumbbell','kettlebell','machine','cable','bodyweight','band','other']));
-- (Rollback re-adds the narrowed CHECKs under their stable names — equivalent to
--  the originals for all practical purposes.)
