-- Training MVP step 1/4 — `exercises` shared pool (post-R-01 shape).
--
-- STAGED — DO NOT AUTO-APPLY.
--
-- Specced in
-- `docs/superpowers/specs/2026-05-20-training-mvp-design-v2.md` §4.1
-- (table shape) + §0.11/0.13/0.14 (bilingual names, expanded equipment
-- vocab, per-exercise `default_increment_kg`). Sequenced by
-- `docs/superpowers/plans/2026-05-20-training-mvp-plan.md` Task 1.
--
-- Requires R-01 applied first (this table follows the post-R-01
-- ingredient pattern: `created_by_user_id` with three-state semantics
-- (NULL = system seed / sentinel = anonymised / real user = owned),
-- "delete" = hide via ownership transfer rather than hard-delete).
-- The matching RLS policies live in Task 4 (verbatim copy of the
-- post-R-01 ingredients policies).
--
-- Do not run this against any database from CI or from this PR.

create table if not exists public.exercises (
  id                   uuid primary key default gen_random_uuid(),
  name_es              text not null,
  name_en              text null,
  primary_muscle       text null,
  equipment            text null,
  default_increment_kg numeric null,
  is_verified          boolean not null default false,
  created_by_user_id   uuid null references auth.users(id) on delete set null,
  source               text not null default 'manual',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (name_es is not null or name_en is not null),
  check (
    primary_muscle is null
    or primary_muscle = any (array[
      'chest','back','shoulders','quads','hamstrings','glutes',
      'calves','biceps','triceps','core','forearms','full_body'
    ])
  ),
  check (
    equipment is null
    or equipment = any (array[
      'barbell','dumbbell','kettlebell','machine','cable',
      'bodyweight','band','other'
    ])
  ),
  check (default_increment_kg is null or default_increment_kg > 0),
  check (source = any (array['manual','system']))
);

create index if not exists idx_exercises_name_es_trgm
  on public.exercises using gin (name_es extensions.gin_trgm_ops);
create index if not exists idx_exercises_name_en_trgm
  on public.exercises using gin (name_en extensions.gin_trgm_ops)
  where name_en is not null;

-- System seed — ~30 common lifts, bilingual, equipment-aware, with
-- sensible `default_increment_kg`. The seed is wrapped in a guard so
-- re-running the migration is a no-op (rows have auto-generated ids
-- with no unique constraint to dedup against).
do $$
begin
  if not exists (select 1 from public.exercises where source = 'system') then
    insert into public.exercises
      (name_es, name_en, primary_muscle, equipment, default_increment_kg,
       is_verified, created_by_user_id, source)
    values
      -- Compound barbell lifts
      ('Sentadilla trasera',          'Back squat',                 'quads',      'barbell',    5.0, true, null, 'system'),
      ('Sentadilla frontal',          'Front squat',                'quads',      'barbell',    2.5, true, null, 'system'),
      ('Peso muerto',                 'Deadlift',                   'back',       'barbell',    5.0, true, null, 'system'),
      ('Peso muerto rumano',          'Romanian deadlift',          'hamstrings', 'barbell',    2.5, true, null, 'system'),
      ('Hip thrust con barra',        'Barbell hip thrust',         'glutes',     'barbell',    5.0, true, null, 'system'),
      -- Compound barbell pressing
      ('Press de banca',              'Bench press',                'chest',      'barbell',    2.5, true, null, 'system'),
      ('Press inclinado',             'Incline bench press',        'chest',      'barbell',    2.5, true, null, 'system'),
      ('Press militar',               'Overhead press',             'shoulders',  'barbell',    2.5, true, null, 'system'),
      ('Remo con barra',              'Barbell row',                'back',       'barbell',    2.5, true, null, 'system'),
      -- Dumbbell
      ('Press con mancuernas',        'Dumbbell press',             'chest',      'dumbbell',   1.0, true, null, 'system'),
      ('Press inclinado con mancuernas','Incline dumbbell press',   'chest',      'dumbbell',   1.0, true, null, 'system'),
      ('Remo con mancuerna',          'Dumbbell row',               'back',       'dumbbell',   1.0, true, null, 'system'),
      ('Curl con mancuernas',         'Dumbbell curl',              'biceps',     'dumbbell',   1.0, true, null, 'system'),
      ('Extensión de tríceps con mancuerna','Dumbbell triceps extension','triceps','dumbbell', 1.0, true, null, 'system'),
      ('Elevaciones laterales',       'Lateral raises',             'shoulders',  'dumbbell',   1.0, true, null, 'system'),
      ('Elevaciones frontales',       'Front raises',               'shoulders',  'dumbbell',   1.0, true, null, 'system'),
      ('Pájaros con mancuernas',      'Dumbbell rear delt fly',     'shoulders',  'dumbbell',   1.0, true, null, 'system'),
      ('Press Arnold',                'Arnold press',               'shoulders',  'dumbbell',   1.0, true, null, 'system'),
      -- Machine
      ('Prensa de piernas',           'Leg press',                  'quads',      'machine',    2.5, true, null, 'system'),
      ('Extensión de cuádriceps',     'Leg extension',              'quads',      'machine',    2.5, true, null, 'system'),
      ('Curl femoral',                'Leg curl',                   'hamstrings', 'machine',    2.5, true, null, 'system'),
      ('Press de pecho en máquina',   'Chest press machine',        'chest',      'machine',    2.5, true, null, 'system'),
      ('Elevación de gemelos sentado','Seated calf raise',          'calves',     'machine',    2.5, true, null, 'system'),
      -- Cable / pulley
      ('Jalón al pecho',              'Lat pulldown',               'back',       'cable',      2.5, true, null, 'system'),
      ('Remo en polea',               'Cable row',                  'back',       'cable',      2.5, true, null, 'system'),
      ('Extensión de tríceps en polea','Cable triceps pushdown',    'triceps',    'cable',      2.5, true, null, 'system'),
      ('Curl de bíceps en polea',     'Cable biceps curl',          'biceps',     'cable',      2.5, true, null, 'system'),
      ('Pájaro en polea',             'Cable rear delt fly',        'shoulders',  'cable',      2.5, true, null, 'system'),
      ('Abdominales en polea',        'Cable crunch',               'core',       'cable',      2.5, true, null, 'system'),
      -- Bodyweight
      ('Dominadas',                   'Pull-ups',                   'back',       'bodyweight', null, true, null, 'system'),
      ('Fondos',                      'Dips',                       'chest',      'bodyweight', null, true, null, 'system'),
      ('Plancha',                     'Plank',                      'core',       'bodyweight', null, true, null, 'system'),
      -- Kettlebell
      ('Swing con kettlebell',        'Kettlebell swing',           'glutes',     'kettlebell', 4.0, true, null, 'system'),
      ('Goblet squat',                'Goblet squat',               'quads',      'kettlebell', 4.0, true, null, 'system');
  end if;
end $$;

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- ROLLBACK:
--   drop index if exists public.idx_exercises_name_en_trgm;
--   drop index if exists public.idx_exercises_name_es_trgm;
--   drop table if exists public.exercises;
