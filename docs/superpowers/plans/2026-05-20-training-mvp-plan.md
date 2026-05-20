# Training MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Training MVP per
`docs/superpowers/specs/2026-05-20-training-mvp-design-v2.md` — a route
`/entrenamiento` where the user logs gym sessions with set-level reps /
weight / RPE / warmup, sees per-exercise history with derived e1RM and
PRs, and gets transparent coach suggestions (5 starter rules already
implemented in `src/core/training.ts`).

**Architecture:** 3 new DB tables (`exercises` shared pool with the
post-R-01 lifecycle model + bilingual names + per-exercise increment;
`workout_sessions` user-owned; `workout_sets` user-owned with RLS via
join to the parent session). 1 RPC `save_workout` (INVOKER,
replace-children, mirrors `save_recipe`). A `src/features/training/`
feature root with API + hooks + zod schemas + components. New routes in
`src/router.tsx`, new nav link in `AppLayout`. Two new i18n namespaces
(`entrenamiento`, `coach`), ES + EN complete. The pure core
`src/core/training.ts` (55 Vitest tests) and `src/core/library.ts` already
exist on this branch.

**Tech Stack:** Postgres + Supabase RLS (4 staged migrations), React 18
+ Vite + TS, TanStack Query, RHF + zod, Tailwind + shadcn/ui, Vitest +
RTL/jsdom for Tier-1/2, i18next.

---

## Hard prerequisites

- [ ] **R-01 has shipped to develop AND Wave-3 apply has been
      performed.** R-01 (PR #71) implements the shared-pool lifecycle
      model that the `exercises` table follows verbatim. If R-01 is not
      yet on develop, **STOP** — merging this plan's PR before R-01
      would force the exercises pool into the pre-R-01 ingredient
      pattern and force a second migration to align with R-01 later.
      The spec §3 is explicit: this is structural, not sequencing.

- [ ] **Branch hygiene.** Work continues on `claude/training-mvp-spec`
      (the branch this plan was written on, currently PR #70 draft).
      Do not create a second branch — the spec + core + this plan +
      every implementation commit live in one PR for one cohesive
      review.

- [ ] **STAGED-migration / Wave-3 discipline** applies here, exactly
      as for R-01 (and R-03/R-06/R-07/R-08/R-12/R-14/R-18). Every SQL
      object is STAGED — NOT APPLIED by the PR. The Wave-3 prod-apply
      ceremony happens AFTER explicit user sign-off, after R-01's own
      Wave-3 apply has settled. See `docs/operations.md` Wave-3
      procedure.

---

## File structure (decomposition map)

**DB (staged migrations):**

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260522120000_training_exercises.sql` | `exercises` table (post-R-01 shape) + CHECK constraints + trigram indexes + system seed |
| `supabase/migrations/20260522120010_training_sessions_sets.sql` | `workout_sessions` + `workout_sets` tables + their indexes + the RLS-via-join policy for `workout_sets` |
| `supabase/migrations/20260522120020_training_save_workout_rpc.sql` | `save_workout(p_session_id, p_performed_on, p_title, p_notes, p_sets)` RPC — INVOKER, replace-children |
| `supabase/migrations/20260522120030_training_exercises_rls.sql` | RLS policies on `exercises` (post-R-01 verbatim) + on `workout_sessions` |

**Client core (pure, already done — re-validate):**

| Path | Responsibility |
|---|---|
| `src/core/training.ts` | Already in repo. 55 Vitest tests pass. No changes in this plan unless a follow-up brainstorm adds rules. |
| `src/core/library.ts` | Already in repo (`LIBRARY_ANON_OWNER_ID`). No changes. |

**Client types:**

| Path | Responsibility |
|---|---|
| `src/types/database.ts` | Hand-edit (interim until R-04 regen): add 3 new tables + `save_workout` RPC. |

**Feature root `src/features/training/`:**

| Path | Responsibility |
|---|---|
| `src/features/training/api.ts` | List/fetch sessions; list/fetch sets for one session; fetch per-exercise history; fetch exercise context (primary muscle, equipment, default increment) for coach assembly; call `save_workout` RPC. |
| `src/features/training/hooks.ts` | TanStack Query hooks wrapping `api.ts`. |
| `src/features/training/schema.ts` | RHF + zod schemas for the session editor (date, title, notes, exercise blocks with set rows). |
| `src/features/training/exercises/api.ts` | Pool search (bilingual `or(name_es.ilike, name_en.ilike)`); my-library list (via `user_exercise_refs` if R-01 split, otherwise direct pool query — see Task 5 decision note); create-manual-exercise (with `default_increment_kg` auto-suggestion + ensure ref). |
| `src/features/training/exercises/hooks.ts` | `useExerciseSearch`, `useExercise`, `useCreateExercise`, `useHideExercise`. |
| `src/features/training/components/SessionList.tsx` | Newest-first list of `workout_sessions` with date + title + set count badge. |
| `src/features/training/components/SessionEditor.tsx` | RHF-powered editor: date, title, notes, exercise blocks. Owns the field array of exercises and (per exercise) the field array of sets. |
| `src/features/training/components/ExerciseBlock.tsx` | Per-exercise sub-form: exercise picker + coach suggestions + set rows + add-set button. |
| `src/features/training/components/ExercisePicker.tsx` | Locale-aware autocomplete against the pool (mirrors `IngredientAutocomplete`). Has a "+ Create new" affordance opening `ExerciseDialog`. |
| `src/features/training/components/ExerciseDialog.tsx` | Modal form for creating an exercise: `name_es`, `name_en?`, `primary_muscle?`, `equipment`, `default_increment_kg` (auto-suggested from equipment, editable). |
| `src/features/training/components/SetRow.tsx` | One set: reps / weight_kg / RPE / warmup toggle. Greyed placeholder showing the last working set's values (spec §6). |
| `src/features/training/components/CoachSuggestions.tsx` | Renders `evaluateCoach(ctx)` output: one card per suggestion with i18n-keyed headline + (for progression rules) an editable `nextWeightKg` field. |
| `src/features/training/components/ExerciseHistory.tsx` | Per-exercise: every past set grouped by session date + e1RM trend chart + volume + PR badges. Reuses `TrendChart` / `interpolateSeries` / `TimeRangePills` from `features/measurements`. |

**Pages + router:**

| Path | Responsibility |
|---|---|
| `src/pages/EntrenamientoPage.tsx` | List of sessions + "＋ Registrar entreno" CTA. |
| `src/pages/SessionEditorPage.tsx` | New or edit session (route param). |
| `src/pages/ExerciseHistoryPage.tsx` | Pick / show an exercise's history. |
| `src/router.tsx` | Add `/entrenamiento`, `/entrenamiento/nueva`, `/entrenamiento/:id`, `/entrenamiento/ejercicios/:id`. |
| `src/components/AppLayout.tsx` (or wherever nav lives — confirm at impl) | Add the Entrenamiento nav link. |

**i18n:**

| Path | Responsibility |
|---|---|
| `src/i18n/es/entrenamiento.json` | All UI strings for the training feature, ES. |
| `src/i18n/en/entrenamiento.json` | Same, EN. |
| `src/i18n/es/coach.json` | Coach rule headlines, ES. |
| `src/i18n/en/coach.json` | Same, EN. |
| `src/i18n/index.ts` | Register the two new namespaces. |

**Tests (Tier-2):**

| Path | Responsibility |
|---|---|
| `src/features/training/exercises/api.test.ts` | Bilingual search ordering + create-with-auto-increment (mocked supabase). |
| `src/features/training/schema.test.ts` | Zod validation: rejects 0 reps, negative weight, RPE out of 6.0–10.0, RPE not 0.5-granular, etc. |
| `src/features/training/components/SessionEditor.test.tsx` | RHF submit → expected `save_workout` payload shape; placeholder-commit flow; coach suggestion render + editable next-weight. |

---

## Task 1 — `exercises` table (staged migration + seed)

**Files:**
- Create: `supabase/migrations/20260522120000_training_exercises.sql`

- [ ] **Step 1: Write the migration with the STAGED header**

Use the same `STAGED — DO NOT AUTO-APPLY` header convention as R-01's
migrations (see `supabase/migrations/20260520120000_r01_library_anon_seed.sql`
for the template). Body:

```sql
-- Training MVP step 1/4 — `exercises` shared pool (post-R-01 shape).
-- STAGED — DO NOT AUTO-APPLY.
-- Specced in docs/superpowers/specs/2026-05-20-training-mvp-design-v2.md
-- §4.1 (table) + §0.11/0.13/0.14 (bilingual names, expanded equipment vocab,
-- per-exercise default_increment_kg).
-- Requires R-01 applied first (this table follows the post-R-01 ingredient
-- pattern: created_by_user_id with the three-state semantics, hide-via-
-- ownership-transfer not hard-delete).

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
```

- [ ] **Step 2: Append the system-seed insert (idempotent)**

Append to the same file. ~30–40 common lifts. Bilingual, equipment-aware,
with sensible `default_increment_kg`. Example head:

```sql
insert into public.exercises
  (id, name_es, name_en, primary_muscle, equipment, default_increment_kg,
   is_verified, created_by_user_id, source)
values
  -- Compound barbell lifts (5 kg jumps)
  (gen_random_uuid(), 'Sentadilla trasera', 'Back squat',     'quads',     'barbell', 5.0, true, null, 'system'),
  (gen_random_uuid(), 'Sentadilla frontal', 'Front squat',    'quads',     'barbell', 2.5, true, null, 'system'),
  (gen_random_uuid(), 'Peso muerto',        'Deadlift',       'back',      'barbell', 5.0, true, null, 'system'),
  (gen_random_uuid(), 'Peso muerto rumano', 'Romanian deadlift','hamstrings','barbell', 2.5, true, null, 'system'),
  -- Compound barbell pressing (2.5 kg jumps)
  (gen_random_uuid(), 'Press de banca',     'Bench press',    'chest',     'barbell', 2.5, true, null, 'system'),
  (gen_random_uuid(), 'Press inclinado',    'Incline bench press','chest', 'barbell', 2.5, true, null, 'system'),
  (gen_random_uuid(), 'Press militar',      'Overhead press', 'shoulders', 'barbell', 2.5, true, null, 'system'),
  (gen_random_uuid(), 'Remo con barra',     'Barbell row',    'back',      'barbell', 2.5, true, null, 'system'),
  -- Dumbbell accessories (1.0 kg increments per dumbbell)
  (gen_random_uuid(), 'Press con mancuernas','Dumbbell press','chest',     'dumbbell', 1.0, true, null, 'system'),
  (gen_random_uuid(), 'Remo con mancuerna', 'Dumbbell row',   'back',      'dumbbell', 1.0, true, null, 'system'),
  (gen_random_uuid(), 'Curl con mancuernas','Dumbbell curl',  'biceps',    'dumbbell', 1.0, true, null, 'system'),
  (gen_random_uuid(), 'Extensión de tríceps con mancuerna','Dumbbell triceps extension','triceps','dumbbell',1.0,true,null,'system'),
  (gen_random_uuid(), 'Elevaciones laterales','Lateral raises','shoulders','dumbbell', 1.0, true, null, 'system'),
  -- Machine staples (2.5 kg increments — selectorized stacks)
  (gen_random_uuid(), 'Prensa de piernas',  'Leg press',      'quads',     'machine',  2.5, true, null, 'system'),
  (gen_random_uuid(), 'Extensión de cuádriceps','Leg extension','quads',   'machine',  2.5, true, null, 'system'),
  (gen_random_uuid(), 'Curl femoral',       'Leg curl',       'hamstrings','machine',  2.5, true, null, 'system'),
  (gen_random_uuid(), 'Press de pecho en máquina','Chest press machine','chest','machine',2.5,true,null,'system'),
  -- Cable / pulley (2.5 kg increments)
  (gen_random_uuid(), 'Jalón al pecho',     'Lat pulldown',   'back',      'cable',    2.5, true, null, 'system'),
  (gen_random_uuid(), 'Remo en polea',      'Cable row',      'back',      'cable',    2.5, true, null, 'system'),
  (gen_random_uuid(), 'Extensión de tríceps en polea','Cable triceps pushdown','triceps','cable',2.5,true,null,'system'),
  (gen_random_uuid(), 'Curl de bíceps en polea','Cable biceps curl','biceps','cable', 2.5, true, null, 'system'),
  (gen_random_uuid(), 'Pájaro en polea',    'Cable rear delt fly','shoulders','cable',2.5,true,null,'system'),
  -- Bodyweight / accessory
  (gen_random_uuid(), 'Dominadas',          'Pull-ups',       'back',      'bodyweight', 0, true, null, 'system'),
  (gen_random_uuid(), 'Fondos',             'Dips',           'chest',     'bodyweight', 0, true, null, 'system'),
  (gen_random_uuid(), 'Plancha',            'Plank',          'core',      'bodyweight', 0, true, null, 'system'),
  (gen_random_uuid(), 'Abdominales en polea','Cable crunch',  'core',      'cable',    2.5, true, null, 'system'),
  -- Kettlebell (4 kg jumps — fixed-weight singles)
  (gen_random_uuid(), 'Swing con kettlebell','Kettlebell swing','glutes',  'kettlebell',4.0,true,null,'system')
on conflict do nothing;
```

The insert is idempotent because `id` is auto-generated each run but no
unique constraint matches on the seed rows; re-runs would create
duplicates. **Fix:** wrap in a guard:

```sql
do $$
begin
  if not exists (select 1 from public.exercises where source = 'system') then
    insert into public.exercises (...)
    values (...);
  end if;
end $$;
```

Use this `do $$ ... end $$;` guard around the seed.

- [ ] **Step 3: Add the ROLLBACK block**

Append:

```sql
-- ROLLBACK:
--   drop index if exists public.idx_exercises_name_en_trgm;
--   drop index if exists public.idx_exercises_name_es_trgm;
--   drop table if exists public.exercises;
```

- [ ] **Step 4: Lint the SQL by eyeballing the migration end-to-end**

No automated SQL lint runs in CI. Read top to bottom, confirm: every
table reference is `public.exercises`, every CHECK clause closes, the
`do $$` guard wraps the seed, the ROLLBACK block is present.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260522120000_training_exercises.sql
git commit -m "feat(training): exercises table + system seed (STAGED)"
```

---

## Task 2 — `workout_sessions` + `workout_sets` tables

**Files:**
- Create: `supabase/migrations/20260522120010_training_sessions_sets.sql`

- [ ] **Step 1: Write the file with the STAGED header**

```sql
-- Training MVP step 2/4 — `workout_sessions` + `workout_sets`.
-- STAGED — DO NOT AUTO-APPLY.
-- Specced in §4.2 / §4.3. RLS on workout_sets routes through
-- workout_sessions (mirrors recipe_ingredients via recipes; verified
-- against r00_baseline_schema.sql:712-720). No user_id column on
-- workout_sets (§0.5).
```

- [ ] **Step 2: workout_sessions table**

```sql
create table if not exists public.workout_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  performed_on  date not null default current_date,
  title         text null,
  notes         text null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_workout_sessions_user_date
  on public.workout_sessions using btree (user_id, performed_on desc);

alter table public.workout_sessions enable row level security;

create policy "User sees own workout sessions"
  on public.workout_sessions for select
  to authenticated
  using (auth.uid() = user_id);

create policy "User inserts own workout sessions"
  on public.workout_sessions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "User updates own workout sessions"
  on public.workout_sessions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "User deletes own workout sessions"
  on public.workout_sessions for delete
  to authenticated
  using (auth.uid() = user_id);
```

- [ ] **Step 3: workout_sets table + RLS-via-join policies**

```sql
create table if not exists public.workout_sets (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_id  uuid not null references public.exercises(id)        on delete restrict,
  set_index    integer not null check (set_index >= 1),
  reps         integer not null check (reps >= 0),
  weight_kg    numeric(8,2) not null check (weight_kg >= 0),
  rpe          numeric(3,1) null check (
    rpe is null or (rpe between 6.0 and 10.0 and rpe * 2 = floor(rpe * 2))
  ),
  is_warmup    boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (session_id, exercise_id, set_index)
);

create index if not exists idx_workout_sets_session
  on public.workout_sets using btree (session_id);
create index if not exists idx_workout_sets_exercise
  on public.workout_sets using btree (exercise_id);

alter table public.workout_sets enable row level security;

create policy "User sees own workout sets"
  on public.workout_sets for select
  to authenticated
  using (exists (
    select 1 from public.workout_sessions s
    where s.id = workout_sets.session_id and s.user_id = auth.uid()
  ));

create policy "User inserts own workout sets"
  on public.workout_sets for insert
  to authenticated
  with check (exists (
    select 1 from public.workout_sessions s
    where s.id = workout_sets.session_id and s.user_id = auth.uid()
  ));

create policy "User updates own workout sets"
  on public.workout_sets for update
  to authenticated
  using (exists (
    select 1 from public.workout_sessions s
    where s.id = workout_sets.session_id and s.user_id = auth.uid()
  ));

create policy "User deletes own workout sets"
  on public.workout_sets for delete
  to authenticated
  using (exists (
    select 1 from public.workout_sessions s
    where s.id = workout_sets.session_id and s.user_id = auth.uid()
  ));
```

- [ ] **Step 4: ROLLBACK block**

```sql
-- ROLLBACK:
--   drop table if exists public.workout_sets;
--   drop table if exists public.workout_sessions;
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260522120010_training_sessions_sets.sql
git commit -m "feat(training): workout_sessions + workout_sets tables (STAGED)"
```

---

## Task 3 — `save_workout` RPC

**Files:**
- Create: `supabase/migrations/20260522120020_training_save_workout_rpc.sql`

- [ ] **Step 1: Write the file**

```sql
-- Training MVP step 3/4 — save_workout RPC.
-- STAGED — DO NOT AUTO-APPLY.
-- Spec §4.4. Mirrors save_recipe: INVOKER, replace-children, atomic
-- session + N sets in one call. Per CLAUDE.md inv #3.

create or replace function public.save_workout(
  p_session_id   uuid,
  p_performed_on date,
  p_title        text,
  p_notes        text,
  p_sets         jsonb
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_user_id    uuid;
  v_session_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if p_session_id is null then
    insert into public.workout_sessions (user_id, performed_on, title, notes)
    values (v_user_id, coalesce(p_performed_on, current_date), p_title, p_notes)
    returning id into v_session_id;
  else
    update public.workout_sessions
       set performed_on = coalesce(p_performed_on, performed_on),
           title        = p_title,
           notes        = p_notes,
           updated_at   = now()
     where id      = p_session_id
       and user_id = v_user_id
    returning id into v_session_id;
    if v_session_id is null then
      raise exception 'session not found or not owned by user';
    end if;
    delete from public.workout_sets where session_id = v_session_id;
  end if;

  insert into public.workout_sets
    (session_id, exercise_id, set_index, reps, weight_kg, rpe, is_warmup)
  select v_session_id,
         (item->>'exercise_id')::uuid,
         (item->>'set_index')::int,
         (item->>'reps')::int,
         (item->>'weight_kg')::numeric,
         nullif(item->>'rpe', '')::numeric,
         coalesce((item->>'is_warmup')::boolean, false)
  from jsonb_array_elements(p_sets) as item;

  return v_session_id;
end;
$$;

grant execute on function public.save_workout(uuid, date, text, text, jsonb) to authenticated;

-- ROLLBACK:
--   drop function if exists public.save_workout(uuid, date, text, text, jsonb);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260522120020_training_save_workout_rpc.sql
git commit -m "feat(training): save_workout RPC (INVOKER, replace-children, STAGED)"
```

---

## Task 4 — RLS on `exercises` (post-R-01 verbatim)

**Files:**
- Create: `supabase/migrations/20260522120030_training_exercises_rls.sql`

- [ ] **Step 1: Write the file mirroring the R-01 ingredients policies**

Copy the post-R-01 ingredient RLS policies verbatim, swapping
`ingredients` → `exercises`. Reference:
`supabase/migrations/20260520120070_r01_rls.sql` §2 (the four
post-R-01 ingredient policies).

```sql
-- Training MVP step 4/4 — RLS on exercises (post-R-01 verbatim).
-- STAGED — DO NOT AUTO-APPLY.
-- The shared-pool policies are an exact structural copy of the post-R-01
-- ingredients policies. Spec §4.1 ("RLS — copied from the post-R-01
-- `ingredients` policies verbatim").

alter table public.exercises enable row level security;

create policy "Exercises pool readable"
  on public.exercises for select
  to authenticated
  using (true);

create policy "Self-tagged insert into exercises pool"
  on public.exercises for insert
  to authenticated
  with check (auth.uid() = created_by_user_id);

create policy "Real owner updates own exercise"
  on public.exercises for update
  to authenticated
  using (
    auth.uid() = created_by_user_id
    and created_by_user_id is not null
    and created_by_user_id <> '00000000-0000-0000-0000-00000000a0a0'
  )
  with check (
    auth.uid() = created_by_user_id
    and created_by_user_id is not null
    and created_by_user_id <> '00000000-0000-0000-0000-00000000a0a0'
  );

create policy "Real owner deletes own exercise"
  on public.exercises for delete
  to authenticated
  using (
    auth.uid() = created_by_user_id
    and created_by_user_id is not null
    and created_by_user_id <> '00000000-0000-0000-0000-00000000a0a0'
  );

-- ROLLBACK:
--   drop policy if exists "Exercises pool readable"              on public.exercises;
--   drop policy if exists "Self-tagged insert into exercises pool" on public.exercises;
--   drop policy if exists "Real owner updates own exercise"      on public.exercises;
--   drop policy if exists "Real owner deletes own exercise"      on public.exercises;
--   alter table public.exercises disable row level security;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260522120030_training_exercises_rls.sql
git commit -m "feat(training): exercises RLS (post-R-01 verbatim, STAGED)"
```

---

## Task 5 — `src/types/database.ts` hand-edits

**Files:**
- Modify: `src/types/database.ts`

R-04 (generated types) hasn't shipped; hand-edit per the interim rule
followed by R-03/R-08/R-14/R-01.

- [ ] **Step 1: Add the three new tables**

Insert (alphabetised within `Tables: {}`) three new entries:
`exercises`, `workout_sessions`, `workout_sets`. Copy the shape of an
existing table (e.g. `ingredients`) and adapt columns to match the
migrations from Tasks 1-2. Mark the comment:

```ts
// R-01 hand-edit (interim until R-04 regen): training MVP tables —
// see supabase/migrations/20260522120000…120030 for the source of truth.
```

- [ ] **Step 2: Add the `save_workout` RPC to `Functions: {}`**

```ts
save_workout: {
  Args: {
    p_notes: string | null
    p_performed_on: string | null
    p_session_id: string | null
    p_sets: Json
    p_title: string | null
  }
  Returns: string
}
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```

Expected: PASS (the hand-edits should match what the spec/migrations
declare; if a column type mismatches, the compiler will catch it once
any feature code consumes the type).

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(training): types/database.ts hand-edits for training tables + save_workout"
```

---

## Task 6 — `src/features/training/exercises/api.ts`

**Files:**
- Create: `src/features/training/exercises/api.ts`
- Test: `src/features/training/exercises/api.test.ts`

- [ ] **Step 1: Write the API surface**

```ts
import { supabase } from '@/lib/supabase';
import type { Tables, TablesInsert } from '@/types/database';
import { DOUBLE_PROGRESSION_DEFAULTS } from '@/core/training';

export type Exercise = Tables<'exercises'>;
export type Equipment =
  | 'barbell' | 'dumbbell' | 'kettlebell' | 'machine'
  | 'cable'   | 'bodyweight' | 'band'      | 'other';

export interface ExerciseCreateInput {
  name_es: string;
  name_en: string | null;
  primary_muscle: string | null;
  equipment: Equipment | null;
  default_increment_kg: number | null;
}

/** Locale-aware pool search — queries both name_es and name_en via trigram.
 *  Display happens at render; we return both names so the picker can pick
 *  the user's locale or fall back. */
export async function searchExercises(query: string, limit = 20): Promise<Exercise[]> {
  const trimmed = query.trim();
  const base = supabase
    .from('exercises')
    .select('*')
    .order('is_verified', { ascending: false })
    .order('name_es')
    .limit(limit);
  if (trimmed === '') {
    const { data, error } = await base;
    if (error) throw error;
    return data;
  }
  const safe = trimmed.replace(/[%_,]/g, '');
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .or(`name_es.ilike.%${safe}%,name_en.ilike.%${safe}%`)
    .order('is_verified', { ascending: false })
    .order('name_es')
    .limit(limit);
  if (error) throw error;
  return data;
}

/** Auto-suggest a default_increment_kg from equipment vocab, matching
 *  the core DOUBLE_PROGRESSION_DEFAULTS.incrementByEquipment map. */
export function suggestIncrementForEquipment(eq: Equipment | null): number {
  if (eq === null) return DOUBLE_PROGRESSION_DEFAULTS.fallbackIncrementKg;
  return DOUBLE_PROGRESSION_DEFAULTS.incrementByEquipment[eq]
    ?? DOUBLE_PROGRESSION_DEFAULTS.fallbackIncrementKg;
}

export async function createExercise(
  userId: string,
  input: ExerciseCreateInput,
): Promise<Exercise> {
  const payload: TablesInsert<'exercises'> = {
    created_by_user_id: userId,
    source: 'manual',
    name_es: input.name_es,
    name_en: input.name_en,
    primary_muscle: input.primary_muscle,
    equipment: input.equipment,
    default_increment_kg: input.default_increment_kg,
  };
  const { data, error } = await supabase
    .from('exercises')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/** R-01 verbatim: hide (creator → anon if owner; ref drop semantics
 *  in v2 when refs ship). The hide_owned_exercise RPC is intentionally
 *  NOT in MVP — exercises don't have a per-user reference yet
 *  (spec §3 inherits whatever R-01 ships for ingredients; v2 adds
 *  user_exercise_refs if we want "remove from my library" UX). */
```

- [ ] **Step 2: Write the test for `suggestIncrementForEquipment` (pure)**

```ts
import { describe, it, expect } from 'vitest';
import { suggestIncrementForEquipment } from './api';

describe('suggestIncrementForEquipment', () => {
  it('barbell → 2.5', () => expect(suggestIncrementForEquipment('barbell')).toBe(2.5));
  it('dumbbell → 1.0', () => expect(suggestIncrementForEquipment('dumbbell')).toBe(1.0));
  it('kettlebell → 4.0', () => expect(suggestIncrementForEquipment('kettlebell')).toBe(4.0));
  it('cable → 2.5', () => expect(suggestIncrementForEquipment('cable')).toBe(2.5));
  it('bodyweight → 0', () => expect(suggestIncrementForEquipment('bodyweight')).toBe(0));
  it('band → 0', () => expect(suggestIncrementForEquipment('band')).toBe(0));
  it('null → fallback (2.5)', () => expect(suggestIncrementForEquipment(null)).toBe(2.5));
});
```

- [ ] **Step 3: Run the test**

```bash
pnpm vitest run src/features/training/exercises/api.test.ts
```

Expected: all 7 PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/training/exercises/api.ts src/features/training/exercises/api.test.ts
git commit -m "feat(training/exercises): pool search + locale-aware autocomplete API"
```

---

## Task 7 — `src/features/training/exercises/hooks.ts`

**Files:**
- Create: `src/features/training/exercises/hooks.ts`

- [ ] **Step 1: TanStack Query wrappers**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { toastCreated, toastError } from '@/lib/toast-helpers';
import {
  createExercise,
  searchExercises,
  type Exercise,
  type ExerciseCreateInput,
} from './api';

export function useExerciseSearch(query: string, limit = 20) {
  return useQuery({
    queryKey: ['exercises', 'search', query, limit],
    queryFn: () => searchExercises(query, limit),
    placeholderData: (prev) => prev,
  });
}

export function useCreateExercise() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation<Exercise, Error, ExerciseCreateInput>({
    mutationFn: (input) => createExercise(user!.id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['exercises'] });
      toastCreated();
    },
    onError: toastError,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/training/exercises/hooks.ts
git commit -m "feat(training/exercises): TanStack Query hooks"
```

---

## Task 8 — `ExerciseDialog.tsx` (create-new modal)

**Files:**
- Create: `src/features/training/components/ExerciseDialog.tsx`

- [ ] **Step 1: Component scaffold (mirror `IngredientDialog`)**

Look at `src/features/ingredients/components/IngredientDialog.tsx` for
the Dialog + RHF + zod pattern (R-09 form convention). Build the
analogous `ExerciseDialog` with these fields:

- `name_es` (required, string min 1)
- `name_en` (optional, string)
- `primary_muscle` (optional, select from controlled vocab)
- `equipment` (optional, select from 8 values)
- `default_increment_kg` (optional, numeric ≥ 0; auto-fills from
  `suggestIncrementForEquipment(equipment)` when equipment is picked
  and the user hasn't manually edited the field yet)

On submit: call `useCreateExercise().mutate(input)`, then close the
dialog and (via prop callback) return the created exercise id to the
caller (the picker that opened the dialog).

Include the spec §0.11 hint as helper text near the names: "Spanish
required; English optional. Both populated for system seeds."

- [ ] **Step 2: Commit**

```bash
git add src/features/training/components/ExerciseDialog.tsx
git commit -m "feat(training): ExerciseDialog (create-new exercise modal)"
```

---

## Task 9 — `ExercisePicker.tsx`

**Files:**
- Create: `src/features/training/components/ExercisePicker.tsx`

- [ ] **Step 1: Component**

Mirror `IngredientAutocomplete`. Search input, debounced query through
`useExerciseSearch`, results dropdown showing each match's display name
in the user's locale (with the other locale as subtitle if present), a
"+ Create new" row at the bottom that opens `ExerciseDialog`. Selecting
an exercise calls a prop callback with the full `Exercise` row.

Display helper inline:

```ts
function displayName(ex: Exercise, lang: 'es' | 'en'): string {
  if (lang === 'es') return ex.name_es;
  return ex.name_en ?? ex.name_es;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/training/components/ExercisePicker.tsx
git commit -m "feat(training): ExercisePicker autocomplete (locale-aware)"
```

---

## Task 10 — `src/features/training/api.ts` (sessions + history)

**Files:**
- Create: `src/features/training/api.ts`

- [ ] **Step 1: Types**

```ts
import { supabase } from '@/lib/supabase';
import type { Tables, Json } from '@/types/database';
import type { CoreSessionSet } from '@/core/training';

export type WorkoutSession = Tables<'workout_sessions'>;
export type WorkoutSet     = Tables<'workout_sets'>;

export interface SessionListItem {
  id: string;
  performed_on: string;
  title: string | null;
  set_count: number;
}

export interface SessionWithSets extends WorkoutSession {
  workout_sets: WorkoutSet[];
}

export interface SaveWorkoutPayload {
  sessionId: string | null;
  performedOn: string; // YYYY-MM-DD
  title: string | null;
  notes: string | null;
  sets: Array<{
    exercise_id: string;
    set_index: number;
    reps: number;
    weight_kg: number;
    rpe: number | null;
    is_warmup: boolean;
  }>;
}
```

- [ ] **Step 2: Session list query**

```ts
export async function listSessions(userId: string, limit = 50): Promise<SessionListItem[]> {
  const { data, error } = await supabase
    .from('workout_sessions')
    .select('id, performed_on, title, workout_sets(id)')
    .eq('user_id', userId)
    .order('performed_on', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((s) => ({
    id: s.id,
    performed_on: s.performed_on,
    title: s.title,
    set_count: s.workout_sets?.length ?? 0,
  }));
}
```

- [ ] **Step 3: Session fetch (one)**

```ts
export async function fetchSession(sessionId: string): Promise<SessionWithSets> {
  const { data, error } = await supabase
    .from('workout_sessions')
    .select('*, workout_sets(*)')
    .eq('id', sessionId)
    .single();
  if (error) throw error;
  const raw = data as unknown as SessionWithSets;
  raw.workout_sets = (raw.workout_sets ?? []).sort(
    (a, b) =>
      a.exercise_id.localeCompare(b.exercise_id) || a.set_index - b.set_index,
  );
  return raw;
}
```

- [ ] **Step 4: Per-exercise history (for the coach + history view)**

```ts
export async function fetchExerciseHistory(
  userId: string,
  exerciseId: string,
): Promise<CoreSessionSet[]> {
  const { data, error } = await supabase
    .from('workout_sets')
    .select(
      'reps, weight_kg, rpe, is_warmup, set_index, session_id, exercise_id, session:workout_sessions(performed_on, user_id)',
    )
    .eq('exercise_id', exerciseId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  type Row = {
    reps: number;
    weight_kg: number | string;
    rpe: number | string | null;
    is_warmup: boolean;
    set_index: number;
    session_id: string;
    exercise_id: string;
    session: { performed_on: string; user_id: string } | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  // RLS scoped, but defensively filter to this user's sessions.
  return rows
    .filter((r) => r.session?.user_id === userId)
    .map((r) => ({
      reps: r.reps,
      weightKg: r.weight_kg,
      rpe: r.rpe,
      isWarmup: r.is_warmup,
      setIndex: r.set_index,
      sessionId: r.session_id,
      exerciseId: r.exercise_id,
      performedOn: r.session!.performed_on,
    }));
}
```

- [ ] **Step 5: `saveWorkout` RPC wrapper**

```ts
export async function saveWorkout(payload: SaveWorkoutPayload): Promise<string> {
  const { data, error } = await supabase.rpc('save_workout', {
    p_session_id:   payload.sessionId,
    p_performed_on: payload.performedOn,
    p_title:        payload.title,
    p_notes:        payload.notes,
    p_sets:         payload.sets as unknown as Json,
  });
  if (error) throw error;
  return data as string;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('workout_sessions')
    .delete()
    .eq('id', sessionId);
  if (error) throw error;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/features/training/api.ts
git commit -m "feat(training): sessions / sets / history API surface"
```

---

## Task 11 — `src/features/training/hooks.ts`

**Files:**
- Create: `src/features/training/hooks.ts`

- [ ] **Step 1: Hooks**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { toastDeleted, toastError, toastSaved } from '@/lib/toast-helpers';
import {
  deleteSession,
  fetchExerciseHistory,
  fetchSession,
  listSessions,
  saveWorkout,
  type SaveWorkoutPayload,
} from './api';

export function useSessions() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ['training', 'sessions', user?.id],
    queryFn: () => listSessions(user!.id),
  });
}

export function useSession(sessionId: string | null | undefined) {
  return useQuery({
    enabled: !!sessionId,
    queryKey: ['training', 'session', sessionId],
    queryFn: () => fetchSession(sessionId!),
  });
}

export function useExerciseHistory(exerciseId: string | null | undefined) {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user && !!exerciseId,
    queryKey: ['training', 'history', user?.id, exerciseId],
    queryFn: () => fetchExerciseHistory(user!.id, exerciseId!),
  });
}

export function useSaveWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SaveWorkoutPayload) => saveWorkout(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['training'] });
      toastSaved();
    },
    onError: toastError,
  });
}

export function useDeleteSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSession(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['training', 'sessions'] });
      toastDeleted();
    },
    onError: toastError,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/training/hooks.ts
git commit -m "feat(training): TanStack Query hooks for sessions / sets / history"
```

---

## Task 12 — `src/features/training/schema.ts` (zod)

**Files:**
- Create: `src/features/training/schema.ts`
- Test: `src/features/training/schema.test.ts`

- [ ] **Step 1: Schemas**

```ts
import { z } from 'zod';

export const setSchema = z.object({
  set_index: z.number().int().min(1),
  reps: z.number().int().min(0).max(200),
  weight_kg: z.number().min(0).max(1000),
  rpe: z
    .number()
    .min(6)
    .max(10)
    .refine((v) => v * 2 === Math.floor(v * 2), 'RPE must be in 0.5 steps')
    .nullable()
    .optional(),
  is_warmup: z.boolean().default(false),
});

export const exerciseBlockSchema = z.object({
  exercise_id: z.string().uuid(),
  sets: z.array(setSchema).min(1, 'At least one set per exercise'),
});

export const sessionSchema = z.object({
  performed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().max(100).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  blocks: z.array(exerciseBlockSchema).min(1, 'A session needs at least one exercise'),
});

export type SessionFormValues = z.infer<typeof sessionSchema>;
```

- [ ] **Step 2: Test**

```ts
import { describe, it, expect } from 'vitest';
import { sessionSchema, setSchema } from './schema';

describe('setSchema', () => {
  it('accepts a valid set', () => {
    expect(setSchema.safeParse({
      set_index: 1, reps: 8, weight_kg: 70, rpe: 7, is_warmup: false,
    }).success).toBe(true);
  });
  it('rejects RPE = 6.3 (not 0.5-granular)', () => {
    expect(setSchema.safeParse({
      set_index: 1, reps: 8, weight_kg: 70, rpe: 6.3, is_warmup: false,
    }).success).toBe(false);
  });
  it('rejects RPE > 10', () => {
    expect(setSchema.safeParse({
      set_index: 1, reps: 8, weight_kg: 70, rpe: 10.5, is_warmup: false,
    }).success).toBe(false);
  });
  it('accepts null RPE', () => {
    expect(setSchema.safeParse({
      set_index: 1, reps: 8, weight_kg: 70, rpe: null, is_warmup: false,
    }).success).toBe(true);
  });
});

describe('sessionSchema', () => {
  it('requires at least one exercise block', () => {
    expect(sessionSchema.safeParse({
      performed_on: '2026-05-22', title: null, notes: null, blocks: [],
    }).success).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests + commit**

```bash
pnpm vitest run src/features/training/schema.test.ts
git add src/features/training/schema.ts src/features/training/schema.test.ts
git commit -m "feat(training): zod schemas for session editor"
```

---

## Task 13 — `SetRow.tsx` (with repeat-last placeholder)

**Files:**
- Create: `src/features/training/components/SetRow.tsx`

- [ ] **Step 1: Component**

A row of 4 inputs: reps / weight_kg / rpe / is_warmup, wired through
the RHF `Controller` pattern co-located in the parent. Accept a
`placeholder: CoreSessionSet | null` prop; when present, render the
input `placeholder` attributes as the last working set's values (greyed
"8 × 70 kg @ 7"). The form value remains empty until the user types or
taps "Use last".

Include a small "Use last" button next to the row that, when clicked,
sets the four field values to the placeholder values via
`field.onChange`. Per spec §6 ("Hevy pattern" with button fallback).

The set_index is owned by the parent block; this component reads it
read-only.

- [ ] **Step 2: Commit**

```bash
git add src/features/training/components/SetRow.tsx
git commit -m "feat(training): SetRow with last-working-set placeholder + Use-last button"
```

---

## Task 14 — `CoachSuggestions.tsx`

**Files:**
- Create: `src/features/training/components/CoachSuggestions.tsx`

- [ ] **Step 1: Component**

Accept a `CoachContext` (assembled by the parent block from the
selected exercise + its history + today's ISO) and an optional
`onApplySuggestedLoad: (nextWeightKg: number) => void` callback.

Call `evaluateCoach(ctx)` and render each `CoachSuggestion` as a small
card. Map `ruleId` to a UI severity colour. For progression rules
(`double-progression`, `rep-progression`), render the `nextWeightKg`
detail as an editable numeric input next to a small "Apply to next set"
button that calls `onApplySuggestedLoad(currentInputValue)`.

Use `i18next` to resolve the `headline` key — read from the
`coach` namespace (Task 19 creates the strings). Interpolate the
`detail` blob: `t(headline, detail)`.

- [ ] **Step 2: Commit**

```bash
git add src/features/training/components/CoachSuggestions.tsx
git commit -m "feat(training): CoachSuggestions card with editable suggested next-load"
```

---

## Task 15 — `ExerciseBlock.tsx`

**Files:**
- Create: `src/features/training/components/ExerciseBlock.tsx`

- [ ] **Step 1: Component**

Per-exercise block inside the session editor. Composes:

- `ExercisePicker` (top) for choosing the exercise (locks once picked).
- `CoachSuggestions` (just below picker, only when exercise picked + history loaded).
- A RHF field array of `SetRow`s, with an "+ Add set" button.

When the exercise is picked, the block calls `useExerciseHistory` to
fetch the user's prior sets for that exercise. From that, it derives
the `placeholder` set (via `lastWorkingSetForExercise`) to thread into
the next empty `SetRow`, and builds the `CoachContext` for
`CoachSuggestions`.

The `onApplySuggestedLoad` from `CoachSuggestions` sets the next set
row's `weight_kg` to the user-edited suggestion value.

- [ ] **Step 2: Commit**

```bash
git add src/features/training/components/ExerciseBlock.tsx
git commit -m "feat(training): ExerciseBlock composing picker + coach + set rows"
```

---

## Task 16 — `SessionEditor.tsx`

**Files:**
- Create: `src/features/training/components/SessionEditor.tsx`
- Test: `src/features/training/components/SessionEditor.test.tsx`

- [ ] **Step 1: Editor**

Outer RHF form bound to `sessionSchema`. Fields: date (default
`todayInTZ()` for Europe/Madrid via `@/lib/dates`), title (optional),
notes (optional), and a field array of `ExerciseBlock`s with an "+ Add
exercise" button.

On submit: flatten `blocks` into the `sets[]` shape `save_workout`
expects (`{ exercise_id, set_index, reps, weight_kg, rpe, is_warmup }`),
then call `useSaveWorkout().mutateAsync({ sessionId, … })`. Navigate
back to `/entrenamiento` on success.

Accept `initial?: SessionWithSets` for edit mode (passed by the page).

- [ ] **Step 2: Tier-2 component test**

Use the jsdom + RTL setup established by R-09/R-16 (see
`src/features/phases/components/PhaseDialog.test.tsx` for the pattern).
Test:

1. Renders empty form by default.
2. User picks an exercise → block appears.
3. User fills a set row + submits → `saveWorkout` mock called with the
   expected payload shape.
4. Placeholder appears when history is mocked with one prior session.

- [ ] **Step 3: Commit**

```bash
pnpm vitest run src/features/training/components/SessionEditor.test.tsx
git add src/features/training/components/SessionEditor.tsx src/features/training/components/SessionEditor.test.tsx
git commit -m "feat(training): SessionEditor (RHF + zod, save_workout submit) + Tier-2 test"
```

---

## Task 17 — `SessionList.tsx`

**Files:**
- Create: `src/features/training/components/SessionList.tsx`

- [ ] **Step 1: Component**

Render `useSessions()` data. Newest-first by `performed_on`. Each row:
date (formatted via `@/lib/dates`) + title (or "—") + set-count badge
+ Edit + Delete icon buttons. Click on the row navigates to
`/entrenamiento/:id`.

Empty state: a localised "no sessions yet" prompt with the "Registrar
entreno" CTA.

- [ ] **Step 2: Commit**

```bash
git add src/features/training/components/SessionList.tsx
git commit -m "feat(training): SessionList component (newest-first, edit/delete affordances)"
```

---

## Task 18 — `ExerciseHistory.tsx`

**Files:**
- Create: `src/features/training/components/ExerciseHistory.tsx`

- [ ] **Step 1: Component**

Accept `exerciseId`. Fetch `useExerciseHistory(exerciseId)`. Layout:

- Header: exercise name (locale-aware).
- Trend card: e1RM trend line (use `e1rmTrendForExercise` from
  `@/core/training`, render with `TrendChart` from
  `features/measurements`).
- PR list: `detectPRsForExercise` output rendered as a column of
  `Badge` rows.
- Past sessions: grouped by `performed_on`, each session shows its set
  rows (reps × weight_kg @ RPE) with a warmup pill.

- [ ] **Step 2: Commit**

```bash
git add src/features/training/components/ExerciseHistory.tsx
git commit -m "feat(training): ExerciseHistory (trend + PR list + past sessions)"
```

---

## Task 19 — Pages + router + nav

**Files:**
- Create: `src/pages/EntrenamientoPage.tsx`
- Create: `src/pages/SessionEditorPage.tsx`
- Create: `src/pages/ExerciseHistoryPage.tsx`
- Modify: `src/router.tsx`
- Modify: `src/components/AppLayout.tsx` (or wherever nav lives — find with `grep`)

- [ ] **Step 1: EntrenamientoPage**

Renders header + `<SessionList />` + a "Registrar entreno" button that
navigates to `/entrenamiento/nueva`.

- [ ] **Step 2: SessionEditorPage**

Reads `:id` from `useParams`; `null` for `/entrenamiento/nueva`. Calls
`useSession(id)` when id is present; passes the result to
`<SessionEditor initial={...} />`.

- [ ] **Step 3: ExerciseHistoryPage**

Reads `:id` from `useParams`. Renders `<ExerciseHistory exerciseId={id} />`.

- [ ] **Step 4: Wire routes**

In `src/router.tsx`, add 3 routes under the authenticated layout. Patterns:

```ts
{ path: 'entrenamiento',                      element: <EntrenamientoPage /> },
{ path: 'entrenamiento/nueva',                element: <SessionEditorPage /> },
{ path: 'entrenamiento/:id',                  element: <SessionEditorPage /> },
{ path: 'entrenamiento/ejercicios/:id',       element: <ExerciseHistoryPage /> },
```

- [ ] **Step 5: Nav link**

Locate the nav (`grep -rn "Diario\|Recetas" src/components` finds it).
Add an entry for `/entrenamiento` with the matching pattern (icon,
i18n key, route).

- [ ] **Step 6: Commit**

```bash
pnpm typecheck && pnpm build
git add src/pages/Entrenamiento*.tsx src/pages/SessionEditorPage.tsx src/pages/ExerciseHistoryPage.tsx src/router.tsx src/components/AppLayout.tsx
git commit -m "feat(training): pages + routes + nav for /entrenamiento"
```

---

## Task 20 — i18n: `entrenamiento` + `coach` namespaces

**Files:**
- Create: `src/i18n/es/entrenamiento.json`
- Create: `src/i18n/en/entrenamiento.json`
- Create: `src/i18n/es/coach.json`
- Create: `src/i18n/en/coach.json`
- Modify: `src/i18n/index.ts`

- [ ] **Step 1: `entrenamiento.json` (ES + EN, parity)**

Cover every visible string in the pages and components from Tasks 7-19:
page titles, list empty state, set field labels, submit / cancel,
delete-session confirm, exercise dialog labels (name_es, name_en,
primary_muscle options, equipment options, default_increment_kg).

Both ES and EN must be complete (no English fallback strings — project
i18n rule).

- [ ] **Step 2: `coach.json` (ES + EN, parity)**

One key per `ruleId` in `MVP_COACH_RULES`. Match what
`CoachSuggestions` resolves: `coach.rules.<ruleId>.headline`,
interpolated with the rule's `detail` blob.

Example ES:

```json
{
  "rules": {
    "doubleProgression": {
      "headline": "Has hecho {{sessions}} sesiones a {{weightKg}} kg × {{targetReps}} reps con RPE ≤ {{rpeMax}} — prueba {{nextWeightKg}} kg en la próxima."
    },
    "repProgression": {
      "headline": "Has subido de {{repsFirst}} a {{repsLast}} reps a {{weightKg}} kg en {{sessions}} sesiones — prueba {{nextWeightKg}} kg en la próxima."
    },
    "flatE1rmDeload": {
      "headline": "Tu 1RM estimado lleva {{sessions}} sesiones plano (±{{spreadKg}} kg). Considera una semana de descarga en este ejercicio."
    },
    "rpeClimbingFatigue": {
      "headline": "RPE sube de {{rpeFirst}} a {{rpeLast}} a {{weightKg}} kg en {{sessions}} sesiones — fatiga acumulándose. Considera bajar la carga a {{suggestedWeightKg}} kg."
    },
    "muscleRecency": {
      "headline": "Llevas {{daysSince}} días sin entrenar {{primaryMuscle}}.",
      "headlineNever": "Aún no has entrenado {{primaryMuscle}}."
    }
  }
}
```

Mirror EN.

- [ ] **Step 3: Register namespaces in `src/i18n/index.ts`**

Add `entrenamiento` and `coach` to the resources block alongside the
existing namespaces.

- [ ] **Step 4: Commit**

```bash
pnpm typecheck && pnpm build
git add src/i18n/
git commit -m "feat(training): entrenamiento + coach i18n namespaces (ES + EN)"
```

---

## Task 21 — Roadmap + docs hook-up

**Files:**
- Modify: `docs/roadmap.md` (add Training MVP entry)
- Modify: `docs/operations.md` (append the 4 staged migrations to the Wave-3 list)

- [ ] **Step 1: Roadmap entry**

After the R-01 block in `docs/roadmap.md`, add a new entry — pick the
next available R-id (likely **R-19** at time of writing). Format:

```markdown
## R-19 — Training MVP (Phase 1: ad-hoc session logging + rule-based coach)
- **decision:** (none yet — to be added at impl time per the new D-id for §2.1/§2.2 guardrails)
- **blocked-by:** R-01
- **status:** in-progress (2026-05-22) — Tasks 1–21 staged on
  `claude/training-mvp-spec`; pending Wave-3 prod apply.
- **spec:** `docs/superpowers/specs/2026-05-20-training-mvp-design-v2.md`
- **plan:** `docs/superpowers/plans/2026-05-20-training-mvp-plan.md`
- **scope:** First instance of the Training module. 3 tables
  (`exercises`, `workout_sessions`, `workout_sets`), 1 RPC
  (`save_workout`), 1 pure module (`core/training.ts`, 55 tests, already
  in repo), 5 starter coach rules, 1 route `/entrenamiento`. Bilingual
  exercise names. Per-exercise load increments. Repeat-last placeholder
  on set rows. Editable progression-rule suggestions. NO LLM, ever
  (architectural guardrail).
- **out-of-scope (intentional, sequenced):** routines / programmed
  training, bodyweight/assisted/cardio modelling, the section split
  (Dieta/Entreno), home redesign, in-app onboarding, desktop layout,
  Tier-3 pgTAP coverage (gated behind R-16-Tier-3 infra).
```

Index line up top:
```
- R-19 — Training MVP (Phase 1)
```

- [ ] **Step 2: Operations Wave-3 list extension**

Append the 4 training migrations to the Wave-3 migration-sequence
block in `docs/operations.md` (the same block updated for R-01).

- [ ] **Step 3: Commit**

```bash
git add docs/roadmap.md docs/operations.md
git commit -m "docs(R-19): roadmap entry + operations Wave-3 list for Training MVP"
```

---

## Validation (run before declaring done)

- [ ] `pnpm typecheck` — 0 errors.
- [ ] `pnpm lint` — 0 errors (warnings can be pre-existing).
- [ ] `pnpm test` — all green; 280-base + new tests from Tasks 6/12/16.
- [ ] `pnpm build` — succeeds; `dist/sw.js` written.
- [ ] Manual smoke (in dev, against prod-applied schema): create a
      session, add bench-press 3 sets at 70 kg, save, re-open. Confirm
      sets reappear with their values and the e1RM trend renders on the
      history view.

---

## Wave-3 apply procedure (manual, documented in operations.md)

Apply the 4 training migrations **in order** via `apply_migration` (NOT
`db push`), AFTER R-01 has been applied:

1. `20260522120000_training_exercises.sql`
2. `20260522120010_training_sessions_sets.sql`
3. `20260522120020_training_save_workout_rpc.sql`
4. `20260522120030_training_exercises_rls.sql`

Then drop PR #70 out of draft, merge into `develop`, watch the Vercel
preview render `/entrenamiento` against the now-real schema. Promote
to `main` via the usual `release/*` flow.

---

## Tier-3 (pgTAP) gap

Same status as R-01: Tier-3 RLS / RPC tests for `exercises` /
`workout_sessions` / `workout_sets` / `save_workout` would be ideal but
are gated behind R-16-Tier-3 infrastructure (no `supabase start` /
pgTAP framework in repo). Document the gap; don't fake coverage. When
R-16-Tier-3 ships, a follow-up adds: pool SELECT open, system-seed
immutability, anon immutability, RLS-via-join correctness on
`workout_sets`, `save_workout` replace-children correctness,
RLS-prevents-stealing-another-user's-session.
