# Training Routines & Cyclic Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user build reusable training routines, assemble them into a repeating non-week-based program, see what they're scheduled to train today, and start a workout pre-filled from that routine — while ad-hoc workouts keep working.

**Architecture:** 4 new tables (`routines`, `routine_exercises`, `programs`, `program_days`) + two nullable provenance columns on the existing `workout_sessions`. 3 new RPCs (`save_routine`, `save_program`, `set_active_program`) plus an extension of the existing `save_workout` to accept the two stamps. A pure `src/core/programs.ts` for cycle math + routine→session prefill. Two new feature roots (`routines/`, `programs/`), three new components (`RoutineBuilder`, `ProgramBuilder`, `TodayPlan`), the `/routine` route filling the already-reserved nav slot, and a planner-first rework of `/training`. The B-2 add-exercise bug is reproduced and fixed.

**Tech Stack:** Postgres + Supabase RLS (staged migrations, Wave-3 apply), React 18 + Vite + TS, TanStack Query, RHF + zod, Tailwind + shadcn/ui, Vitest + RTL/jsdom, i18next.

**Spec:** `docs/superpowers/specs/2026-05-24-training-routines-planner-design.md`

---

## Hard prerequisites

- [ ] **R-19 (Training MVP) tables are applied to prod.** Verified 2026-05-24: `exercises` (34 seed rows), `workout_sessions`, `workout_sets` all exist live. F-2 builds directly on them. If working against a fresh/branch DB, apply the R-19 migrations first.
- [ ] **Branch hygiene.** Work on a single short-lived `claude/training-routines-planner` branch → PR into `develop`. Never push to `main`/`develop` directly (CLAUDE.md inv #4).
- [ ] **STAGED-migration / Wave-3 discipline.** Every SQL object is STAGED — NOT applied by the PR. The prod-apply ceremony happens after explicit user sign-off (see `docs/operations.md` Wave-3 procedure). Use the `STAGED — DO NOT AUTO-APPLY` header on every migration.
- [ ] **Migration timestamps** start at `20260528120000` (latest applied is `20260527120000`). Bump if a later migration lands before this ships.

---

## File structure (decomposition map)

**DB (staged migrations):**

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260528120000_f2_routines.sql` | `routines` + `routine_exercises` tables, indexes, RLS |
| `supabase/migrations/20260528120010_f2_programs.sql` | `programs` + `program_days` tables, one-active partial unique index, RLS |
| `supabase/migrations/20260528120020_f2_workout_session_stamps.sql` | ALTER `workout_sessions` add `program_id` / `routine_id` |
| `supabase/migrations/20260528120030_f2_rpcs.sql` | `save_routine`, `save_program`, `set_active_program`, and the `save_workout` extension (2 new stamp params) |

**Client core (pure):**

| Path | Responsibility |
|---|---|
| `src/core/programs.ts` | `cycleDayForDate`, `scheduledSlotForDate`, `projectCycle`, `prefillSetsFromRoutine` |
| `src/core/programs.test.ts` | Tier-1 golden vectors |

**Client types:**

| Path | Responsibility |
|---|---|
| `src/types/database.ts` | Hand-edit: 4 tables, 2 new `workout_sessions` columns, 3 new RPCs, extended `save_workout` |

**Feature roots:**

| Path | Responsibility |
|---|---|
| `src/features/training/routines/api.ts` | list/fetch/delete routines, `save_routine` wrapper |
| `src/features/training/routines/routineSchema.ts` | RHF+zod routine schema |
| `src/features/training/routines/routineSchema.test.ts` | zod validation tests |
| `src/features/training/routines/hooks.ts` | TanStack hooks |
| `src/features/training/programs/api.ts` | list/fetch/delete programs, `save_program`, `set_active_program`, fetch active program |
| `src/features/training/programs/programSchema.ts` | RHF+zod program schema |
| `src/features/training/programs/programSchema.test.ts` | zod validation tests |
| `src/features/training/programs/hooks.ts` | TanStack hooks |

**Components:**

| Path | Responsibility |
|---|---|
| `src/features/training/components/RoutineBuilder.tsx` | routine create/edit form |
| `src/features/training/components/RoutineBuilder.test.tsx` | Tier-2: submit → `save_routine` payload |
| `src/features/training/components/ProgramBuilder.tsx` | program create/edit (cycle slots) |
| `src/features/training/components/ProgramBuilder.test.tsx` | Tier-2: submit → `save_program` payload |
| `src/features/training/components/TodayPlan.tsx` | planner "Hoy" card + upcoming strip + start/re-anchor |
| `src/features/training/components/TodayPlan.test.tsx` | Tier-2: renders correct scheduled slot |
| `src/features/training/components/SessionEditor.tsx` (modify) | `prefill` prop + stamp threading |
| `src/features/training/components/SessionEditor.b2.test.tsx` | B-2 reproduction (real picker path) |

**Pages + router:**

| Path | Responsibility |
|---|---|
| `src/pages/RoutinePage.tsx` | `/routine` — Rutinas + Programas tabs |
| `src/pages/RoutineEditorPage.tsx` | `/routine/rutinas/nueva` + `/routine/rutinas/:id` |
| `src/pages/ProgramEditorPage.tsx` | `/routine/programas/nuevo` + `/routine/programas/:id` |
| `src/pages/EntrenamientoPage.tsx` (modify) | planner-first "Hoy" |
| `src/app/router.tsx` (modify) | add `/routine` + child routes |

**i18n:**

| Path | Responsibility |
|---|---|
| `src/i18n/es/entrenamiento.json` (modify) | new ES strings |
| `src/i18n/en/entrenamiento.json` (modify) | new EN strings (parity) |

**Docs:**

| Path | Responsibility |
|---|---|
| `docs/roadmap.md`, `docs/decisions.md`, `docs/data-model.md`, `docs/operations.md` | roadmap entry, new D-id, schema docs, Wave-3 list |

---

## Task 1 — `routines` + `routine_exercises` tables (staged migration)

**Files:**
- Create: `supabase/migrations/20260528120000_f2_routines.sql`

- [ ] **Step 1: Write the migration**

```sql
-- F-2 step 1/4 — routines + routine_exercises.
-- STAGED — DO NOT AUTO-APPLY.
-- Spec docs/superpowers/specs/2026-05-24-training-routines-planner-design.md §3.1/§3.2.
-- routine_exercises RLS routes through the parent routine (mirrors
-- workout_sets via workout_sessions; verified r00_baseline_schema.sql).

create table if not exists public.routines (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  notes       text null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_routines_user
  on public.routines using btree (user_id, updated_at desc);

create table if not exists public.routine_exercises (
  id              uuid primary key default gen_random_uuid(),
  routine_id      uuid not null references public.routines(id) on delete cascade,
  exercise_id     uuid not null references public.exercises(id) on delete restrict,
  position        int not null check (position >= 1),
  target_sets     int not null check (target_sets > 0),
  target_reps_min int not null check (target_reps_min > 0),
  target_reps_max int not null check (target_reps_max >= target_reps_min),
  rest_seconds    int null check (rest_seconds is null or rest_seconds >= 0),
  target_rpe      numeric null check (
    target_rpe is null
    or (target_rpe between 6.0 and 10.0 and target_rpe * 2 = floor(target_rpe * 2))
  ),
  unique (routine_id, position)
);

create index if not exists idx_routine_exercises_routine
  on public.routine_exercises using btree (routine_id);

alter table public.routines enable row level security;
alter table public.routine_exercises enable row level security;

create policy "User sees own routines" on public.routines for select
  to authenticated using (auth.uid() = user_id);
create policy "User inserts own routines" on public.routines for insert
  to authenticated with check (auth.uid() = user_id);
create policy "User updates own routines" on public.routines for update
  to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "User deletes own routines" on public.routines for delete
  to authenticated using (auth.uid() = user_id);

create policy "User sees own routine exercises" on public.routine_exercises for select
  to authenticated using (exists (
    select 1 from public.routines r
    where r.id = routine_exercises.routine_id and r.user_id = auth.uid()
  ));
create policy "User inserts own routine exercises" on public.routine_exercises for insert
  to authenticated with check (exists (
    select 1 from public.routines r
    where r.id = routine_exercises.routine_id and r.user_id = auth.uid()
  ));
create policy "User updates own routine exercises" on public.routine_exercises for update
  to authenticated using (exists (
    select 1 from public.routines r
    where r.id = routine_exercises.routine_id and r.user_id = auth.uid()
  ));
create policy "User deletes own routine exercises" on public.routine_exercises for delete
  to authenticated using (exists (
    select 1 from public.routines r
    where r.id = routine_exercises.routine_id and r.user_id = auth.uid()
  ));

-- ROLLBACK:
--   drop table if exists public.routine_exercises;
--   drop table if exists public.routines;
```

- [ ] **Step 2: Eyeball the SQL** top-to-bottom — every reference is `public.`, every CHECK closes, both tables have `enable row level security` + 4 policies, ROLLBACK present.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260528120000_f2_routines.sql
git commit -m "feat(training): routines + routine_exercises tables (STAGED)"
```

---

## Task 2 — `programs` + `program_days` tables (staged migration)

**Files:**
- Create: `supabase/migrations/20260528120010_f2_programs.sql`

- [ ] **Step 1: Write the migration**

```sql
-- F-2 step 2/4 — programs + program_days (cyclic planner).
-- STAGED — DO NOT AUTO-APPLY.
-- Spec §3.3/§3.4. One active program per user (partial unique).
-- Cycle length = count(program_days); today's slot computed in code (§5).

create table if not exists public.programs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  is_active   boolean not null default false,
  anchor_date date null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (not is_active or anchor_date is not null)
);

-- One active program per user.
create unique index if not exists programs_one_active_uidx
  on public.programs (user_id) where is_active;
create index if not exists idx_programs_user
  on public.programs using btree (user_id, updated_at desc);

create table if not exists public.program_days (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references public.programs(id) on delete cascade,
  day_index   int not null check (day_index >= 0),
  is_rest     boolean not null default false,
  routine_id  uuid null references public.routines(id) on delete restrict,
  unique (program_id, day_index),
  check ((is_rest and routine_id is null) or (not is_rest and routine_id is not null))
);

create index if not exists idx_program_days_program
  on public.program_days using btree (program_id, day_index);

alter table public.programs enable row level security;
alter table public.program_days enable row level security;

create policy "User sees own programs" on public.programs for select
  to authenticated using (auth.uid() = user_id);
create policy "User inserts own programs" on public.programs for insert
  to authenticated with check (auth.uid() = user_id);
create policy "User updates own programs" on public.programs for update
  to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "User deletes own programs" on public.programs for delete
  to authenticated using (auth.uid() = user_id);

create policy "User sees own program days" on public.program_days for select
  to authenticated using (exists (
    select 1 from public.programs p
    where p.id = program_days.program_id and p.user_id = auth.uid()
  ));
create policy "User inserts own program days" on public.program_days for insert
  to authenticated with check (exists (
    select 1 from public.programs p
    where p.id = program_days.program_id and p.user_id = auth.uid()
  ));
create policy "User updates own program days" on public.program_days for update
  to authenticated using (exists (
    select 1 from public.programs p
    where p.id = program_days.program_id and p.user_id = auth.uid()
  ));
create policy "User deletes own program days" on public.program_days for delete
  to authenticated using (exists (
    select 1 from public.programs p
    where p.id = program_days.program_id and p.user_id = auth.uid()
  ));

-- ROLLBACK:
--   drop table if exists public.program_days;
--   drop table if exists public.programs;
```

- [ ] **Step 2: Eyeball the SQL** — partial unique index present, XOR CHECK on `program_days`, both tables RLS-enabled with 4 policies, ROLLBACK present.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260528120010_f2_programs.sql
git commit -m "feat(training): programs + program_days tables + one-active index (STAGED)"
```

---

## Task 3 — `workout_sessions` provenance stamps (staged migration)

**Files:**
- Create: `supabase/migrations/20260528120020_f2_workout_session_stamps.sql`

- [ ] **Step 1: Write the migration**

```sql
-- F-2 step 3/4 — workout_sessions provenance stamps.
-- STAGED — DO NOT AUTO-APPLY.
-- Spec §3.5. Nullable; ON DELETE SET NULL so a logged session survives
-- deletion of the routine/program that spawned it. null = ad-hoc.

alter table public.workout_sessions
  add column if not exists program_id uuid null references public.programs(id) on delete set null,
  add column if not exists routine_id uuid null references public.routines(id) on delete set null;

create index if not exists idx_workout_sessions_program
  on public.workout_sessions using btree (program_id) where program_id is not null;

-- ROLLBACK:
--   drop index if exists public.idx_workout_sessions_program;
--   alter table public.workout_sessions drop column if exists routine_id;
--   alter table public.workout_sessions drop column if exists program_id;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260528120020_f2_workout_session_stamps.sql
git commit -m "feat(training): workout_sessions program_id/routine_id stamps (STAGED)"
```

---

## Task 4 — RPCs: `save_routine`, `save_program`, `set_active_program`, extended `save_workout` (staged migration)

**Files:**
- Create: `supabase/migrations/20260528120030_f2_rpcs.sql`

- [ ] **Step 1: Write the migration**

```sql
-- F-2 step 4/4 — routine/program RPCs + save_workout stamp extension.
-- STAGED — DO NOT AUTO-APPLY.
-- Spec §4. All INVOKER + set search_path = public (inv #3 / D-C5).
-- save_routine / save_program: replace-children, mirror save_recipe.

create or replace function public.save_routine(
  p_routine_id uuid,
  p_name       text,
  p_notes      text,
  p_exercises  jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_routine_id uuid;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if p_routine_id is null then
    insert into public.routines (user_id, name, notes)
    values (v_user_id, p_name, p_notes)
    returning id into v_routine_id;
  else
    update public.routines
       set name = p_name, notes = p_notes, updated_at = now()
     where id = p_routine_id and user_id = v_user_id
    returning id into v_routine_id;
    if v_routine_id is null then
      raise exception 'routine not found or not owned by user';
    end if;
    delete from public.routine_exercises where routine_id = v_routine_id;
  end if;

  insert into public.routine_exercises
    (routine_id, exercise_id, position, target_sets,
     target_reps_min, target_reps_max, rest_seconds, target_rpe)
  select v_routine_id,
         (item->>'exercise_id')::uuid,
         (item->>'position')::int,
         (item->>'target_sets')::int,
         (item->>'target_reps_min')::int,
         (item->>'target_reps_max')::int,
         nullif(item->>'rest_seconds', '')::int,
         nullif(item->>'target_rpe', '')::numeric
  from jsonb_array_elements(p_exercises) as item;

  return v_routine_id;
end;
$$;

create or replace function public.save_program(
  p_program_id uuid,
  p_name       text,
  p_days       jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_program_id uuid;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if p_program_id is null then
    insert into public.programs (user_id, name)
    values (v_user_id, p_name)
    returning id into v_program_id;
  else
    -- Does NOT touch is_active / anchor_date — those are owned by
    -- set_active_program (spec §4.2).
    update public.programs
       set name = p_name, updated_at = now()
     where id = p_program_id and user_id = v_user_id
    returning id into v_program_id;
    if v_program_id is null then
      raise exception 'program not found or not owned by user';
    end if;
    delete from public.program_days where program_id = v_program_id;
  end if;

  insert into public.program_days (program_id, day_index, is_rest, routine_id)
  select v_program_id,
         (item->>'day_index')::int,
         coalesce((item->>'is_rest')::boolean, false),
         nullif(item->>'routine_id', '')::uuid
  from jsonb_array_elements(p_days) as item;

  return v_program_id;
end;
$$;

create or replace function public.set_active_program(
  p_program_id  uuid,
  p_anchor_date date
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  update public.programs
     set is_active = false, updated_at = now()
   where user_id = v_user_id and is_active and id <> p_program_id;

  update public.programs
     set is_active = true,
         anchor_date = coalesce(p_anchor_date, current_date),
         updated_at = now()
   where id = p_program_id and user_id = v_user_id;

  if not found then
    raise exception 'program not found or not owned by user';
  end if;
end;
$$;

-- Extend save_workout to accept the two provenance stamps (spec §3.5/§6.2).
-- Drop the 5-arg signature and recreate with 7 args (avoids overload
-- ambiguity). Body is the R-19 original plus the two new columns.
drop function if exists public.save_workout(uuid, date, text, text, jsonb);

create or replace function public.save_workout(
  p_session_id   uuid,
  p_performed_on date,
  p_title        text,
  p_notes        text,
  p_sets         jsonb,
  p_program_id   uuid default null,
  p_routine_id   uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_session_id uuid;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if p_session_id is null then
    insert into public.workout_sessions
      (user_id, performed_on, title, notes, program_id, routine_id)
    values
      (v_user_id, coalesce(p_performed_on, current_date), p_title, p_notes,
       p_program_id, p_routine_id)
    returning id into v_session_id;
  else
    update public.workout_sessions
       set performed_on = coalesce(p_performed_on, performed_on),
           title        = p_title,
           notes        = p_notes,
           program_id   = p_program_id,
           routine_id   = p_routine_id,
           updated_at   = now()
     where id = p_session_id and user_id = v_user_id
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

grant execute on function public.save_routine(uuid, text, text, jsonb) to authenticated;
grant execute on function public.save_program(uuid, text, jsonb) to authenticated;
grant execute on function public.set_active_program(uuid, date) to authenticated;
grant execute on function public.save_workout(uuid, date, text, text, jsonb, uuid, uuid) to authenticated;

-- ROLLBACK:
--   drop function if exists public.save_workout(uuid, date, text, text, jsonb, uuid, uuid);
--   -- (manually recreate the original 5-arg save_workout from
--   --  20260522120020_training_save_workout_rpc.sql if rolling back)
--   drop function if exists public.set_active_program(uuid, date);
--   drop function if exists public.save_program(uuid, text, jsonb);
--   drop function if exists public.save_routine(uuid, text, text, jsonb);
```

- [ ] **Step 2: Eyeball the SQL** — every function `security invoker` + `set search_path = public`, `save_program` deliberately does NOT touch `is_active`/`anchor_date`, the old `save_workout` is dropped before recreate, all 4 grants present.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260528120030_f2_rpcs.sql
git commit -m "feat(training): save_routine/save_program/set_active_program + save_workout stamps (STAGED)"
```

---

## Task 5 — `src/types/database.ts` hand-edits

**Files:**
- Modify: `src/types/database.ts`

R-04 generated types haven't shipped; hand-edit per the interim rule (R-01/R-19 precedent).

- [ ] **Step 1: Add the 4 new tables** to `Tables: {}` (alphabetised), copying the shape of an existing table and adapting columns to Tasks 1–2. Add `program_days`, `programs`, `routine_exercises`, `routines`. Mark:

```ts
// F-2 hand-edit (interim until R-04 regen): routines + cyclic planner —
// source of truth supabase/migrations/20260528120000…120030.
```

- [ ] **Step 2: Add the 2 new columns** `program_id: string | null` and `routine_id: string | null` to the `workout_sessions` `Row`/`Insert`/`Update` shapes.

- [ ] **Step 3: Add/extend the RPCs** in `Functions: {}`:

```ts
save_routine: {
  Args: { p_routine_id: string | null; p_name: string; p_notes: string | null; p_exercises: Json }
  Returns: string
}
save_program: {
  Args: { p_program_id: string | null; p_name: string; p_days: Json }
  Returns: string
}
set_active_program: {
  Args: { p_program_id: string; p_anchor_date: string | null }
  Returns: undefined
}
// extend the existing save_workout Args with the two optional stamps:
save_workout: {
  Args: {
    p_notes: string | null; p_performed_on: string | null; p_session_id: string | null;
    p_sets: Json; p_title: string | null;
    p_program_id?: string | null; p_routine_id?: string | null
  }
  Returns: string
}
```

(Per the documented post-generation patch convention, nullable id args like `p_routine_id`/`p_program_id` are `string | null`.)

- [ ] **Step 4: Run typecheck + commit**

```bash
pnpm typecheck
git add src/types/database.ts
git commit -m "feat(training): types for routines/programs tables + RPCs + session stamps"
```

Expected: typecheck PASS.

---

## Task 6 — `src/core/programs.ts` (pure cycle math + prefill) — TDD

**Files:**
- Create: `src/core/programs.test.ts`
- Create: `src/core/programs.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import {
  cycleDayForDate,
  scheduledSlotForDate,
  projectCycle,
  prefillSetsFromRoutine,
  type ProgramDaySlot,
  type RoutineExercisePrescription,
} from './programs';

const slots: ProgramDaySlot[] = [
  { dayIndex: 0, isRest: false, routineId: 'push' },
  { dayIndex: 1, isRest: false, routineId: 'pull' },
  { dayIndex: 2, isRest: false, routineId: 'legs' },
  { dayIndex: 3, isRest: true, routineId: null },
  { dayIndex: 4, isRest: true, routineId: null },
];

describe('cycleDayForDate', () => {
  it('anchor day is index 0', () => {
    expect(cycleDayForDate('2026-05-24', '2026-05-24', 5)).toBe(0);
  });
  it('advances one per day', () => {
    expect(cycleDayForDate('2026-05-24', '2026-05-25', 5)).toBe(1);
    expect(cycleDayForDate('2026-05-24', '2026-05-28', 5)).toBe(4);
  });
  it('wraps at cycle length', () => {
    expect(cycleDayForDate('2026-05-24', '2026-05-29', 5)).toBe(0);
    expect(cycleDayForDate('2026-05-24', '2026-06-03', 5)).toBe(0);
  });
  it('handles dates before the anchor with a floored modulo', () => {
    expect(cycleDayForDate('2026-05-24', '2026-05-23', 5)).toBe(4);
    expect(cycleDayForDate('2026-05-24', '2026-05-19', 5)).toBe(0);
  });
  it('a 7-day cycle behaves like a weekday offset', () => {
    expect(cycleDayForDate('2026-05-24', '2026-05-31', 7)).toBe(0);
  });
});

describe('scheduledSlotForDate', () => {
  it('returns the routine slot for a training day', () => {
    expect(scheduledSlotForDate(slots, '2026-05-24', '2026-05-25')?.routineId).toBe('pull');
  });
  it('returns the rest slot on a rest day', () => {
    const slot = scheduledSlotForDate(slots, '2026-05-24', '2026-05-27');
    expect(slot?.isRest).toBe(true);
    expect(slot?.routineId).toBeNull();
  });
  it('returns null when the program has no days', () => {
    expect(scheduledSlotForDate([], '2026-05-24', '2026-05-25')).toBeNull();
  });
});

describe('projectCycle', () => {
  it('projects N consecutive days from a start date', () => {
    const proj = projectCycle(slots, '2026-05-24', '2026-05-24', 3);
    expect(proj.map((p) => p.dateISO)).toEqual(['2026-05-24', '2026-05-25', '2026-05-26']);
    expect(proj.map((p) => p.slot?.routineId)).toEqual(['push', 'pull', 'legs']);
  });
});

describe('prefillSetsFromRoutine', () => {
  const exercises: RoutineExercisePrescription[] = [
    { exerciseId: 'bench', position: 1, targetSets: 3, targetRepsMin: 8, targetRepsMax: 12, restSeconds: 120, targetRpe: 8 },
    { exerciseId: 'row', position: 2, targetSets: 2, targetRepsMin: 10, targetRepsMax: 10, restSeconds: null, targetRpe: null },
  ];
  it('expands target_sets into that many empty set rows per exercise, ordered by position', () => {
    const out = prefillSetsFromRoutine(exercises);
    expect(out).toHaveLength(2);
    expect(out[0].exerciseId).toBe('bench');
    expect(out[0].sets).toHaveLength(3);
    expect(out[1].sets).toHaveLength(2);
  });
  it('carries rep-range / rest / rpe targets and leaves weight blank', () => {
    const out = prefillSetsFromRoutine(exercises);
    expect(out[0].sets[0]).toEqual({ setIndex: 1, targetRepsMin: 8, targetRepsMax: 12, restSeconds: 120, targetRpe: 8 });
    expect(out[1].sets[1]).toEqual({ setIndex: 2, targetRepsMin: 10, targetRepsMax: 10, restSeconds: null, targetRpe: null });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/core/programs.test.ts`
Expected: FAIL ("cannot find module './programs'").

- [ ] **Step 3: Implement `src/core/programs.ts`**

```ts
/**
 * Pure cyclic-program math + routine→session prefill. No clock (callers
 * pass ISO dates), no I/O. Dates are plain calendar dates (YYYY-MM-DD);
 * timezone is the caller's concern. Spec §5.
 */

export interface ProgramDaySlot {
  dayIndex: number;
  isRest: boolean;
  routineId: string | null;
}

export interface RoutineExercisePrescription {
  exerciseId: string;
  position: number;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  restSeconds: number | null;
  targetRpe: number | null;
}

/** Whole-day number for an ISO calendar date (UTC midnight epoch days). */
function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Add `n` whole days to an ISO date, returning a new ISO date. */
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** 0-based position in the cycle for a date. Floored modulo so dates
 *  before the anchor still map into 0..cycleLength-1. Returns 0 for a
 *  non-positive cycle length (caller treats as unscheduled). */
export function cycleDayForDate(anchorISO: string, dateISO: string, cycleLength: number): number {
  if (cycleLength <= 0) return 0;
  const delta = dayNumber(dateISO) - dayNumber(anchorISO);
  return ((delta % cycleLength) + cycleLength) % cycleLength;
}

/** The slot scheduled for a date, or null if the program has no days. */
export function scheduledSlotForDate(
  days: ProgramDaySlot[],
  anchorISO: string,
  dateISO: string,
): ProgramDaySlot | null {
  if (days.length === 0) return null;
  const idx = cycleDayForDate(anchorISO, dateISO, days.length);
  return days.find((s) => s.dayIndex === idx) ?? null;
}

export interface ProjectedDay {
  dateISO: string;
  slot: ProgramDaySlot | null;
}

/** Project the cycle onto `count` consecutive days starting at `fromISO`. */
export function projectCycle(
  days: ProgramDaySlot[],
  anchorISO: string,
  fromISO: string,
  count: number,
): ProjectedDay[] {
  const out: ProjectedDay[] = [];
  for (let i = 0; i < count; i += 1) {
    const dateISO = addDays(fromISO, i);
    out.push({ dateISO, slot: scheduledSlotForDate(days, anchorISO, dateISO) });
  }
  return out;
}

export interface PrefillSet {
  setIndex: number;
  targetRepsMin: number;
  targetRepsMax: number;
  restSeconds: number | null;
  targetRpe: number | null;
}

export interface PrefillExercise {
  exerciseId: string;
  sets: PrefillSet[];
}

/** Expand a routine's prescriptions into empty set rows for the editor:
 *  targetSets rows per exercise (ordered by position), targets carried,
 *  weight left to runtime. Spec §5. */
export function prefillSetsFromRoutine(
  exercises: RoutineExercisePrescription[],
): PrefillExercise[] {
  return [...exercises]
    .sort((a, b) => a.position - b.position)
    .map((ex) => ({
      exerciseId: ex.exerciseId,
      sets: Array.from({ length: ex.targetSets }, (_, i) => ({
        setIndex: i + 1,
        targetRepsMin: ex.targetRepsMin,
        targetRepsMax: ex.targetRepsMax,
        restSeconds: ex.restSeconds,
        targetRpe: ex.targetRpe,
      })),
    }));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run src/core/programs.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/programs.ts src/core/programs.test.ts
git commit -m "feat(training): pure core/programs cycle math + routine prefill"
```

---

## Task 7 — `routines/api.ts` + `routineSchema.ts` (+ schema test)

**Files:**
- Create: `src/features/training/routines/api.ts`
- Create: `src/features/training/routines/routineSchema.ts`
- Create: `src/features/training/routines/routineSchema.test.ts`

- [ ] **Step 1: Write `routineSchema.ts`**

```ts
import { z } from 'zod';

export const routineExerciseSchema = z
  .object({
    exercise_id: z.string().uuid(),
    target_sets: z.number().int().min(1).max(20),
    target_reps_min: z.number().int().min(1).max(100),
    target_reps_max: z.number().int().min(1).max(100),
    rest_seconds: z.number().int().min(0).max(3600).nullable().optional(),
    target_rpe: z
      .number()
      .min(6)
      .max(10)
      .refine((v) => v * 2 === Math.floor(v * 2), 'RPE must be in 0.5 steps')
      .nullable()
      .optional(),
  })
  .refine((e) => e.target_reps_max >= e.target_reps_min, {
    message: 'Max reps must be ≥ min reps',
    path: ['target_reps_max'],
  });

export const routineSchema = z.object({
  name: z.string().min(1, 'Name required').max(100),
  notes: z.string().max(2000).nullable().optional(),
  exercises: z.array(routineExerciseSchema).min(1, 'A routine needs at least one exercise'),
});

export type RoutineFormValues = z.infer<typeof routineSchema>;
```

- [ ] **Step 2: Write `routineSchema.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { routineSchema, routineExerciseSchema } from './routineSchema';

const validExercise = {
  exercise_id: '11111111-1111-1111-1111-111111111111',
  target_sets: 3, target_reps_min: 8, target_reps_max: 12, rest_seconds: 120, target_rpe: 8,
};

describe('routineExerciseSchema', () => {
  it('accepts a valid exercise', () => {
    expect(routineExerciseSchema.safeParse(validExercise).success).toBe(true);
  });
  it('rejects max reps < min reps', () => {
    expect(routineExerciseSchema.safeParse({ ...validExercise, target_reps_min: 12, target_reps_max: 8 }).success).toBe(false);
  });
  it('rejects RPE not in 0.5 steps', () => {
    expect(routineExerciseSchema.safeParse({ ...validExercise, target_rpe: 8.3 }).success).toBe(false);
  });
  it('accepts null rest and rpe', () => {
    expect(routineExerciseSchema.safeParse({ ...validExercise, rest_seconds: null, target_rpe: null }).success).toBe(true);
  });
});

describe('routineSchema', () => {
  it('requires at least one exercise', () => {
    expect(routineSchema.safeParse({ name: 'Push', notes: null, exercises: [] }).success).toBe(false);
  });
  it('requires a name', () => {
    expect(routineSchema.safeParse({ name: '', notes: null, exercises: [validExercise] }).success).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test**

Run: `pnpm vitest run src/features/training/routines/routineSchema.test.ts`
Expected: all PASS.

- [ ] **Step 4: Write `api.ts`**

```ts
import { supabase } from '@/lib/supabase';
import type { Tables, Json } from '@/types/database';

export type Routine = Tables<'routines'>;
export type RoutineExercise = Tables<'routine_exercises'>;

export interface RoutineWithExercises extends Routine {
  routine_exercises: RoutineExercise[];
}

export interface SaveRoutinePayload {
  routineId: string | null;
  name: string;
  notes: string | null;
  exercises: Array<{
    exercise_id: string;
    position: number;
    target_sets: number;
    target_reps_min: number;
    target_reps_max: number;
    rest_seconds: number | null;
    target_rpe: number | null;
  }>;
}

export async function listRoutines(userId: string): Promise<RoutineWithExercises[]> {
  const { data, error } = await supabase
    .from('routines')
    .select('*, routine_exercises(*)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as RoutineWithExercises[];
  for (const r of rows) {
    r.routine_exercises = (r.routine_exercises ?? []).sort((a, b) => a.position - b.position);
  }
  return rows;
}

export async function fetchRoutine(routineId: string): Promise<RoutineWithExercises> {
  const { data, error } = await supabase
    .from('routines')
    .select('*, routine_exercises(*)')
    .eq('id', routineId)
    .single();
  if (error) throw error;
  const row = data as unknown as RoutineWithExercises;
  row.routine_exercises = (row.routine_exercises ?? []).sort((a, b) => a.position - b.position);
  return row;
}

export async function saveRoutine(payload: SaveRoutinePayload): Promise<string> {
  const { data, error } = await supabase.rpc('save_routine', {
    p_routine_id: payload.routineId,
    p_name: payload.name,
    p_notes: payload.notes,
    p_exercises: payload.exercises as unknown as Json,
  });
  if (error) throw error;
  return data as string;
}

export async function deleteRoutine(routineId: string): Promise<void> {
  const { error } = await supabase.from('routines').delete().eq('id', routineId);
  if (error) throw error;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/features/training/routines/api.ts src/features/training/routines/routineSchema.ts src/features/training/routines/routineSchema.test.ts
git commit -m "feat(training/routines): api + zod schema"
```

---

## Task 8 — `routines/hooks.ts`

**Files:**
- Create: `src/features/training/routines/hooks.ts`

- [ ] **Step 1: Write the hooks** (mirror `src/features/training/hooks.ts`)

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { toastDeleted, toastError, toastSaved } from '@/lib/toast-helpers';
import {
  deleteRoutine, fetchRoutine, listRoutines, saveRoutine,
  type SaveRoutinePayload,
} from './api';

export function useRoutines() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ['training', 'routines', user?.id],
    queryFn: () => listRoutines(user!.id),
  });
}

export function useRoutine(routineId: string | null | undefined) {
  return useQuery({
    enabled: !!routineId,
    queryKey: ['training', 'routine', routineId],
    queryFn: () => fetchRoutine(routineId!),
  });
}

export function useSaveRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SaveRoutinePayload) => saveRoutine(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['training', 'routines'] });
      toastSaved();
    },
    onError: toastError,
  });
}

export function useDeleteRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRoutine(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['training', 'routines'] });
      toastDeleted();
    },
    onError: toastError,
  });
}
```

- [ ] **Step 2: Verify the import paths** match the existing `src/features/training/hooks.ts` (`useAuth`, `toast-helpers` names). Run `pnpm typecheck`.

- [ ] **Step 3: Commit**

```bash
git add src/features/training/routines/hooks.ts
git commit -m "feat(training/routines): TanStack Query hooks"
```

---

## Task 9 — `programs/api.ts` + `programSchema.ts` (+ schema test)

**Files:**
- Create: `src/features/training/programs/api.ts`
- Create: `src/features/training/programs/programSchema.ts`
- Create: `src/features/training/programs/programSchema.test.ts`

- [ ] **Step 1: Write `programSchema.ts`**

```ts
import { z } from 'zod';

export const programDaySchema = z
  .object({
    day_index: z.number().int().min(0),
    is_rest: z.boolean(),
    routine_id: z.string().uuid().nullable(),
  })
  .refine((d) => (d.is_rest ? d.routine_id === null : d.routine_id !== null), {
    message: 'A slot is either a rest day or has a routine',
    path: ['routine_id'],
  });

export const programSchema = z.object({
  name: z.string().min(1, 'Name required').max(100),
  days: z.array(programDaySchema).min(1, 'A program needs at least one day'),
});

export type ProgramFormValues = z.infer<typeof programSchema>;
```

- [ ] **Step 2: Write `programSchema.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { programSchema, programDaySchema } from './programSchema';

const routineDay = { day_index: 0, is_rest: false, routine_id: '11111111-1111-1111-1111-111111111111' };
const restDay = { day_index: 1, is_rest: true, routine_id: null };

describe('programDaySchema', () => {
  it('accepts a routine day with a routine_id', () => {
    expect(programDaySchema.safeParse(routineDay).success).toBe(true);
  });
  it('accepts a rest day with null routine_id', () => {
    expect(programDaySchema.safeParse(restDay).success).toBe(true);
  });
  it('rejects a rest day that also has a routine_id', () => {
    expect(programDaySchema.safeParse({ ...restDay, routine_id: routineDay.routine_id }).success).toBe(false);
  });
  it('rejects a training day with no routine_id', () => {
    expect(programDaySchema.safeParse({ day_index: 0, is_rest: false, routine_id: null }).success).toBe(false);
  });
});

describe('programSchema', () => {
  it('requires at least one day', () => {
    expect(programSchema.safeParse({ name: 'PPL', days: [] }).success).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test**

Run: `pnpm vitest run src/features/training/programs/programSchema.test.ts`
Expected: all PASS.

- [ ] **Step 4: Write `api.ts`**

```ts
import { supabase } from '@/lib/supabase';
import type { Tables, Json } from '@/types/database';

export type Program = Tables<'programs'>;
export type ProgramDay = Tables<'program_days'>;

export interface ProgramWithDays extends Program {
  program_days: ProgramDay[];
}

export interface SaveProgramPayload {
  programId: string | null;
  name: string;
  days: Array<{ day_index: number; is_rest: boolean; routine_id: string | null }>;
}

export async function listPrograms(userId: string): Promise<ProgramWithDays[]> {
  const { data, error } = await supabase
    .from('programs')
    .select('*, program_days(*)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as ProgramWithDays[];
  for (const p of rows) {
    p.program_days = (p.program_days ?? []).sort((a, b) => a.day_index - b.day_index);
  }
  return rows;
}

export async function fetchActiveProgram(userId: string): Promise<ProgramWithDays | null> {
  const { data, error } = await supabase
    .from('programs')
    .select('*, program_days(*)')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as ProgramWithDays;
  row.program_days = (row.program_days ?? []).sort((a, b) => a.day_index - b.day_index);
  return row;
}

export async function saveProgram(payload: SaveProgramPayload): Promise<string> {
  const { data, error } = await supabase.rpc('save_program', {
    p_program_id: payload.programId,
    p_name: payload.name,
    p_days: payload.days as unknown as Json,
  });
  if (error) throw error;
  return data as string;
}

export async function setActiveProgram(programId: string, anchorDateISO: string): Promise<void> {
  const { error } = await supabase.rpc('set_active_program', {
    p_program_id: programId,
    p_anchor_date: anchorDateISO,
  });
  if (error) throw error;
}

export async function deleteProgram(programId: string): Promise<void> {
  const { error } = await supabase.from('programs').delete().eq('id', programId);
  if (error) throw error;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/features/training/programs/api.ts src/features/training/programs/programSchema.ts src/features/training/programs/programSchema.test.ts
git commit -m "feat(training/programs): api + zod schema"
```

---

## Task 10 — `programs/hooks.ts`

**Files:**
- Create: `src/features/training/programs/hooks.ts`

- [ ] **Step 1: Write the hooks**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { toastDeleted, toastError, toastSaved } from '@/lib/toast-helpers';
import {
  deleteProgram, fetchActiveProgram, listPrograms, saveProgram, setActiveProgram,
  type SaveProgramPayload,
} from './api';

export function usePrograms() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ['training', 'programs', user?.id],
    queryFn: () => listPrograms(user!.id),
  });
}

export function useActiveProgram() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ['training', 'activeProgram', user?.id],
    queryFn: () => fetchActiveProgram(user!.id),
  });
}

export function useSaveProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SaveProgramPayload) => saveProgram(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['training', 'programs'] });
      void qc.invalidateQueries({ queryKey: ['training', 'activeProgram'] });
      toastSaved();
    },
    onError: toastError,
  });
}

export function useSetActiveProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ programId, anchorDateISO }: { programId: string; anchorDateISO: string }) =>
      setActiveProgram(programId, anchorDateISO),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['training', 'programs'] });
      void qc.invalidateQueries({ queryKey: ['training', 'activeProgram'] });
      toastSaved();
    },
    onError: toastError,
  });
}

export function useDeleteProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProgram(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['training', 'programs'] });
      void qc.invalidateQueries({ queryKey: ['training', 'activeProgram'] });
      toastDeleted();
    },
    onError: toastError,
  });
}
```

- [ ] **Step 2: Run `pnpm typecheck` + commit**

```bash
git add src/features/training/programs/hooks.ts
git commit -m "feat(training/programs): TanStack Query hooks"
```

---

## Task 11 — `RoutineBuilder.tsx` (+ Tier-2 test)

**Files:**
- Create: `src/features/training/components/RoutineBuilder.tsx`
- Create: `src/features/training/components/RoutineBuilder.test.tsx`

- [ ] **Step 1: Component**

RHF form bound to `routineSchema`. Mirror the structure of `SessionEditor.tsx`
(FormProvider + `useFieldArray`). Inject the save via an `onSubmit` prop
(`(payload: SaveRoutinePayload) => Promise<unknown>`) and an optional
`initial: RoutineWithExercises | null` + `initialExercises: Record<string, Exercise>`
(same pattern as `SessionEditor`) so it is unit-testable without TanStack.

Fields:
- `name` (Input), `notes` (Textarea).
- A field array of exercise rows. Each row composes the existing
  `ExercisePicker` (from `./ExercisePicker`) for `exercise_id`, plus number
  Inputs for `target_sets`, `target_reps_min`, `target_reps_max`,
  `rest_seconds` (optional), `target_rpe` (optional). Up/down buttons to
  reorder (swap `position`); a remove button. An "+ Add exercise" button
  appends a row with `exercise_id: ''`.

On submit: map field-array rows → `SaveRoutinePayload.exercises` assigning
`position = index + 1`, then call `onSubmit`. Reuse the `ExercisePicker`
locale-aware display; resolve picked `Exercise` objects in local state keyed by
row, exactly as `ExerciseBlock` does (`useState<Exercise | null>` per row).

Convert empty optional number inputs to `null` (reuse the `setValueAs` pattern
from `SetRow.tsx` for `rest_seconds` / `target_rpe`).

- [ ] **Step 2: Tier-2 test**

```tsx
// @vitest-environment jsdom
import '@/i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '@/i18n';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

// Stub the picker: clicking it selects a fixed exercise (avoids debounced query).
const EX = {
  id: '11111111-1111-1111-1111-111111111111', name_es: 'Press de banca', name_en: 'Bench press',
  primary_muscle: 'chest', equipment: 'barbell', default_increment_kg: 2.5,
  is_verified: true, source: 'system', created_by_user_id: null,
  created_at: '', updated_at: '',
};
vi.mock('./ExercisePicker', () => ({
  ExercisePicker: ({ onSelect }: { onSelect: (e: typeof EX) => void }) => (
    <button type="button" onClick={() => onSelect(EX)}>pick-mock</button>
  ),
}));

import { RoutineBuilder } from './RoutineBuilder';

beforeEach(async () => { await i18n.changeLanguage('es'); });

describe('RoutineBuilder (Tier-2)', () => {
  it('submits a save_routine payload with position-indexed exercises', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue('routine-1');
    render(<RoutineBuilder initial={null} onSubmit={onSubmit} onSaved={vi.fn()} />);

    await user.type(screen.getByLabelText(i18n.t('entrenamiento:routine.name')), 'Push A');
    await user.click(screen.getByText('pick-mock')); // selects EX into row 0
    await user.click(screen.getByRole('button', { name: i18n.t('entrenamiento:routine.save') }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.name).toBe('Push A');
    expect(payload.exercises[0]).toMatchObject({ exercise_id: EX.id, position: 1 });
  });
});
```

> **`component-test-supabase-env` trap:** the supabase module is mocked above and
> the picker is stubbed, so no env/network is touched — keep it that way or the
> test goes green-local / red-CI.

- [ ] **Step 3: Run test + commit**

Run: `pnpm vitest run src/features/training/components/RoutineBuilder.test.tsx`
Expected: PASS.

```bash
git add src/features/training/components/RoutineBuilder.tsx src/features/training/components/RoutineBuilder.test.tsx
git commit -m "feat(training): RoutineBuilder form + Tier-2 test"
```

---

## Task 12 — `ProgramBuilder.tsx` (+ Tier-2 test)

**Files:**
- Create: `src/features/training/components/ProgramBuilder.tsx`
- Create: `src/features/training/components/ProgramBuilder.test.tsx`

- [ ] **Step 1: Component**

RHF form bound to `programSchema`. Inject `onSubmit`
(`(payload: SaveProgramPayload) => Promise<unknown>`), optional
`initial: ProgramWithDays | null`, and a `routines: RoutineWithExercises[]`
prop (the available routines to pick from; the page passes `useRoutines().data`).

Fields:
- `name` (Input).
- A field array of cycle-day slots. Each slot row: a toggle/segmented control
  for **Rest** vs **Routine**; when "Routine", a `<select>` of the `routines`
  prop (value = routine id); when "Rest", `routine_id` is forced null. Up/down
  reorder, remove. "+ Add day" appends a routine slot. Show the computed cycle
  length (= number of slots).

On submit: map slots → `SaveProgramPayload.days` assigning
`day_index = index`, `is_rest`, `routine_id` (null when rest). Call `onSubmit`.

- [ ] **Step 2: Tier-2 test**

```tsx
// @vitest-environment jsdom
import '@/i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '@/i18n';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

import { ProgramBuilder } from './ProgramBuilder';

const routines = [
  { id: 'r-push', user_id: 'u', name: 'Push', notes: null, created_at: '', updated_at: '', routine_exercises: [] },
  { id: 'r-pull', user_id: 'u', name: 'Pull', notes: null, created_at: '', updated_at: '', routine_exercises: [] },
];

beforeEach(async () => { await i18n.changeLanguage('es'); });

describe('ProgramBuilder (Tier-2)', () => {
  it('submits a save_program payload with day_index-ordered slots', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue('program-1');
    render(<ProgramBuilder initial={null} routines={routines} onSubmit={onSubmit} onSaved={vi.fn()} />);

    await user.type(screen.getByLabelText(i18n.t('entrenamiento:program.name')), 'PPL');
    // default first slot is a routine slot; pick the first routine
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'r-push');
    await user.click(screen.getByRole('button', { name: i18n.t('entrenamiento:program.save') }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.name).toBe('PPL');
    expect(payload.days[0]).toMatchObject({ day_index: 0, is_rest: false, routine_id: 'r-push' });
  });
});
```

- [ ] **Step 3: Run test + commit**

Run: `pnpm vitest run src/features/training/components/ProgramBuilder.test.tsx`
Expected: PASS.

```bash
git add src/features/training/components/ProgramBuilder.tsx src/features/training/components/ProgramBuilder.test.tsx
git commit -m "feat(training): ProgramBuilder form + Tier-2 test"
```

---

## Task 13 — `TodayPlan.tsx` (+ Tier-2 test)

**Files:**
- Create: `src/features/training/components/TodayPlan.tsx`
- Create: `src/features/training/components/TodayPlan.test.tsx`

- [ ] **Step 1: Component**

Props (injected for testability):
```ts
interface Props {
  activeProgram: ProgramWithDays | null;
  routinesById: Record<string, RoutineWithExercises>;
  todayISO: string;
  /** True when a session stamped with today's scheduled routine_id already
   *  exists for today — the minimal adherence indicator (spec §10). */
  completedToday: boolean;
  onStart: (routine: RoutineWithExercises) => void;  // → navigate to editor w/ prefill
  onRestartCycle: () => void;                          // → set_active_program(anchor=today)
  onBuildProgram: () => void;                          // → navigate to /routine programas tab
}
```

Behaviour:
- No active program → empty state with a "Crear programa" CTA (`onBuildProgram`).
- Active program → compute today's slot with
  `scheduledSlotForDate(activeProgram.program_days.map(toSlot), activeProgram.anchor_date!, todayISO)`
  where `toSlot` maps a `ProgramDay` → `{ dayIndex: day_index, isRest: is_rest, routineId: routine_id }`.
  - Rest slot → a "Descanso" card.
  - Routine slot → resolve `routinesById[slot.routineId]`; show routine name +
    exercise summary (count + names) + a **"Empezar / Registrar"** button calling
    `onStart(routine)`. When `completedToday` is true, also show a "✓ Hecho"
    badge (`entrenamiento:today.done`).
- An **"Upcoming"** strip: `projectCycle(slots, anchor, todayISO, 5)` → small
  pills (date + routine name / "Descanso").
- A small **"Reiniciar ciclo hoy"** text button calling `onRestartCycle`.

Use `@/core/programs` for all date math (no inline modulo).

- [ ] **Step 2: Tier-2 test**

```tsx
// @vitest-environment jsdom
import '@/i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '@/i18n';
import { TodayPlan } from './TodayPlan';

const program = {
  id: 'p1', user_id: 'u', name: 'PPL', is_active: true, anchor_date: '2026-05-24',
  created_at: '', updated_at: '',
  program_days: [
    { id: 'd0', program_id: 'p1', day_index: 0, is_rest: false, routine_id: 'r-push' },
    { id: 'd1', program_id: 'p1', day_index: 1, is_rest: true, routine_id: null },
  ],
};
const push = { id: 'r-push', user_id: 'u', name: 'Push', notes: null, created_at: '', updated_at: '', routine_exercises: [] };

beforeEach(async () => { await i18n.changeLanguage('es'); });

describe('TodayPlan (Tier-2)', () => {
  it('shows the scheduled routine on a training day', () => {
    render(<TodayPlan activeProgram={program} routinesById={{ 'r-push': push }} todayISO="2026-05-24"
      completedToday={false} onStart={vi.fn()} onRestartCycle={vi.fn()} onBuildProgram={vi.fn()} />);
    expect(screen.getByText('Push')).toBeTruthy();
  });
  it('shows a "done" badge when completedToday is true', () => {
    render(<TodayPlan activeProgram={program} routinesById={{ 'r-push': push }} todayISO="2026-05-24"
      completedToday={true} onStart={vi.fn()} onRestartCycle={vi.fn()} onBuildProgram={vi.fn()} />);
    expect(screen.getByText(i18n.t('entrenamiento:today.done'))).toBeTruthy();
  });
  it('shows a rest card on a rest day', () => {
    render(<TodayPlan activeProgram={program} routinesById={{ 'r-push': push }} todayISO="2026-05-25"
      completedToday={false} onStart={vi.fn()} onRestartCycle={vi.fn()} onBuildProgram={vi.fn()} />);
    expect(screen.getByText(i18n.t('entrenamiento:today.rest'))).toBeTruthy();
  });
  it('shows the empty state with no active program', () => {
    render(<TodayPlan activeProgram={null} routinesById={{}} todayISO="2026-05-24"
      completedToday={false} onStart={vi.fn()} onRestartCycle={vi.fn()} onBuildProgram={vi.fn()} />);
    expect(screen.getByRole('button', { name: i18n.t('entrenamiento:today.createProgram') })).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run test + commit**

Run: `pnpm vitest run src/features/training/components/TodayPlan.test.tsx`
Expected: PASS.

```bash
git add src/features/training/components/TodayPlan.tsx src/features/training/components/TodayPlan.test.tsx
git commit -m "feat(training): TodayPlan card + upcoming strip + Tier-2 test"
```

---

## Task 14 — `SessionEditor` prefill prop + stamp threading

**Files:**
- Modify: `src/features/training/components/SessionEditor.tsx`
- Modify: `src/features/training/api.ts` (extend `SaveWorkoutPayload`)

- [ ] **Step 1: Extend `SaveWorkoutPayload`** in `src/features/training/api.ts` with two optional fields and pass them to the RPC:

```ts
// add to SaveWorkoutPayload:
  programId?: string | null;
  routineId?: string | null;

// in saveWorkout(...), add to the rpc args:
    p_program_id: payload.programId ?? null,
    p_routine_id: payload.routineId ?? null,
```

- [ ] **Step 2: Add a `prefill` prop to `SessionEditor`.** New optional props:

```ts
  /** Pre-populate a fresh session from a routine (spec §6.2). Ignored when
   *  `initial` is provided (edit mode wins). */
  prefill?: {
    programId: string | null;
    routineId: string | null;
    exercises: import('@/core/programs').PrefillExercise[];
    exercisesById: Record<string, import('../exercises/api').Exercise>;
  } | null;
```

In `deriveInitialForm`, when `initial` is null and `prefill` is present, build
`blocks` from `prefill.exercises`: one block per `PrefillExercise`, with
`target_sets` empty set rows (`reps: 0, weight_kg: 0, rpe: prefill targetRpe ?? null, is_warmup: false`).
Seed `initialExercises` from `prefill.exercisesById` so each block renders its
name immediately. Thread `prefill.programId` / `prefill.routineId` into the
`onSubmit` payload (`programId`, `routineId`). Keep edit-mode behaviour
unchanged.

Display the rep-range / rest as inline target hints near each block (read-only;
no new schema fields — they are display-only targets, actuals are still
reps/weight/rpe).

- [ ] **Step 3: Run existing tests to confirm no regression**

Run: `pnpm vitest run src/features/training/components/SessionEditor.test.tsx`
Expected: existing 3 tests still PASS (prefill is additive/optional).

- [ ] **Step 4: Commit**

```bash
git add src/features/training/components/SessionEditor.tsx src/features/training/api.ts
git commit -m "feat(training): SessionEditor prefill prop + program/routine stamp threading"
```

---

## Task 15 — Pages + router (RoutinePage, editor pages, planner-first EntrenamientoPage)

**Files:**
- Create: `src/pages/RoutinePage.tsx`
- Create: `src/pages/RoutineEditorPage.tsx`
- Create: `src/pages/ProgramEditorPage.tsx`
- Modify: `src/pages/EntrenamientoPage.tsx`
- Modify: `src/app/router.tsx`

- [ ] **Step 1: `RoutinePage.tsx`** — `/routine`. A tabbed page (use the shadcn
  `Tabs` component already in the repo — check `src/components/ui/tabs.tsx`;
  if absent, two buttons toggling local state):
  - **Rutinas tab:** `useRoutines()` list (name + exercise count + edit/delete);
    "＋ Nueva rutina" → navigate `/routine/rutinas/nueva`.
  - **Programas tab:** `usePrograms()` list (name + active badge + cycle length +
    activate/edit/delete); "＋ Nuevo programa" → `/routine/programas/nuevo`.
    "Activar" opens a date picker (default `todayInTZ()`) → `useSetActiveProgram()`.

- [ ] **Step 2: `RoutineEditorPage.tsx`** — `/routine/rutinas/nueva` and
  `/routine/rutinas/:id`. Reads `:id`; `useRoutine(id)` in edit mode; resolves
  each `exercise_id` to an `Exercise` (same `supabase.from('exercises').in('id', …)`
  pattern as `SessionEditorPage.tsx` lines 24-43). Renders `<RoutineBuilder
  initial={…} initialExercises={…} onSubmit={(p) => save.mutateAsync(p)}
  onSaved={() => navigate('/routine')} />` using `useSaveRoutine()`.

- [ ] **Step 3: `ProgramEditorPage.tsx`** — `/routine/programas/nuevo` and
  `/routine/programas/:id`. `useProgram`-equivalent via `usePrograms()` find or a
  dedicated fetch; passes `routines={useRoutines().data ?? []}` to
  `<ProgramBuilder onSubmit={(p) => saveProgram.mutateAsync(p)}
  onSaved={() => navigate('/routine')} />` using `useSaveProgram()`.

- [ ] **Step 4a: Extend `listSessions`** in `src/features/training/api.ts` so the
  planner can compute adherence: add `routine_id` to the select string
  (`'id, performed_on, title, routine_id, workout_sets(id)'`) and to the
  `SessionListItem` interface (`routine_id: string | null`), mapping it through.

- [ ] **Step 4b: Rework `EntrenamientoPage.tsx`** to planner-first. Add at the
  top: resolve `useActiveProgram()`, `useRoutines()`, and `useSessions()`, build
  `routinesById` from the routines list, then render `<TodayPlan …
  todayISO={todayInTZ()} completedToday={completedToday} onStart={startWorkout}
  onRestartCycle={restart} onBuildProgram={() => navigate('/routine')} />`.
  - `toPrescription` (inline mapper, `RoutineExercise` row → `RoutineExercisePrescription`):
    ```ts
    const toPrescription = (re: RoutineExercise) => ({
      exerciseId: re.exercise_id, position: re.position,
      targetSets: re.target_sets, targetRepsMin: re.target_reps_min,
      targetRepsMax: re.target_reps_max, restSeconds: re.rest_seconds, targetRpe: re.target_rpe,
    });
    ```
  - `completedToday`: compute from `useSessions().data` —
    ```ts
    const today = todayInTZ();
    const slot = activeProgram
      ? scheduledSlotForDate(activeProgram.program_days.map(toSlot), activeProgram.anchor_date!, today)
      : null;
    const completedToday = !!slot?.routineId &&
      (sessions.data ?? []).some((s) => s.performed_on === today && s.routine_id === slot.routineId);
    ```
    (`toSlot` maps `ProgramDay` → `ProgramDaySlot`, same mapper TodayPlan uses; define it once and share.)
  - `startWorkout(routine)`: build `prefill` via
    `prefillSetsFromRoutine(routine.routine_exercises.map(toPrescription))`,
    resolve `exercisesById` (the routine's exercises are already loaded via the
    nested select; if display names are missing, fetch like `SessionEditorPage`
    lines 24-43), then `navigate('/training/new', { state: { prefill: { programId: activeProgram!.id, routineId: routine.id, exercises, exercisesById } } })`.
    `SessionEditorPage` reads `location.state?.prefill` (Step 5) and passes it to `SessionEditor`.
  - `restart()`: `useSetActiveProgram().mutate({ programId: active.id, anchorDateISO: todayInTZ() })`.
  - Keep the existing `<SessionList />` below, under a "Entrenos recientes" heading.
  - Keep the existing "Registrar entreno" CTA as the ad-hoc path (navigates to
    `/training/new` with no prefill).

- [ ] **Step 5: Wire `SessionEditorPage.tsx`** to read prefill from router state:

```ts
import { useLocation } from 'react-router-dom';
// inside the component:
const location = useLocation();
const prefill = (location.state as { prefill?: ... } | null)?.prefill ?? null;
// pass prefill={prefill} to <SessionEditor />
```

- [ ] **Step 6: Add routes** in `src/app/router.tsx` (after the `/training/*`
  routes, lines ~105-108):

```tsx
<Route path="/routine" element={<RoutinePage />} />
<Route path="/routine/rutinas/nueva" element={<RoutineEditorPage />} />
<Route path="/routine/rutinas/:id" element={<RoutineEditorPage />} />
<Route path="/routine/programas/nuevo" element={<ProgramEditorPage />} />
<Route path="/routine/programas/:id" element={<ProgramEditorPage />} />
```

Add the three imports at the top alongside the existing page imports.

- [ ] **Step 7: Verify nav** — `nav-config.ts` already has the `routine → /routine`
  entry (line 34); no nav change needed. Confirm `sectionOf('/routine')` returns
  `'entreno'` (the existing `nav-config.test.ts` may need a new assertion — add
  `expect(sectionOf('/routine')).toBe('entreno')` if not present).

- [ ] **Step 8: typecheck + build + commit**

```bash
pnpm typecheck && pnpm build
git add src/pages/RoutinePage.tsx src/pages/RoutineEditorPage.tsx src/pages/ProgramEditorPage.tsx src/pages/EntrenamientoPage.tsx src/pages/SessionEditorPage.tsx src/features/training/api.ts src/app/router.tsx src/components/layout/nav-config.test.ts
git commit -m "feat(training): /routine pages + planner-first Hoy + prefill handoff"
```

---

## Task 16 — i18n strings (`entrenamiento` namespace, ES + EN parity)

**Files:**
- Modify: `src/i18n/es/entrenamiento.json`
- Modify: `src/i18n/en/entrenamiento.json`

- [ ] **Step 1: Add the new keys** to BOTH files (parity required — no English
  fallback strings). Cover every visible string introduced in Tasks 11-15:
  - `routine.*` — `name`, `notes`, `save`, `addExercise`, `targetSets`,
    `repsMin`, `repsMax`, `restSeconds`, `targetRpe`, `removeExercise`,
    `moveUp`, `moveDown`, list empty state, delete confirm, new/edit titles.
  - `program.*` — `name`, `save`, `addDay`, `restDay`, `routineDay`,
    `pickRoutine`, `cycleLength`, `activate`, `active`, `anchorDate`,
    list empty state, delete confirm, new/edit titles.
  - `today.*` — `heading`, `rest`, `start`, `done`, `createProgram`,
    `restartCycle`, `upcoming`, `recentSessions`, `noActiveProgram`.
  - `tabs.*` — `routines`, `programs`.

  Use the existing keys' style (look at the current `entrenamiento.json` for
  casing/structure). Example (ES):

```json
{
  "tabs": { "routines": "Rutinas", "programs": "Programas" },
  "today": {
    "heading": "Hoy",
    "rest": "Día de descanso",
    "start": "Empezar / Registrar",
    "done": "✓ Hecho",
    "createProgram": "Crear programa",
    "restartCycle": "Reiniciar ciclo hoy",
    "upcoming": "Próximos días",
    "recentSessions": "Entrenos recientes",
    "noActiveProgram": "No tienes ningún programa activo"
  }
}
```

  Mirror EN (`"rest": "Rest day"`, `"restartCycle": "Restart cycle today"`, …).

- [ ] **Step 2: Verify the namespace is registered** — `entrenamiento` is
  already registered in `src/i18n/index.ts` (R-19). No change needed; confirm.

- [ ] **Step 3: typecheck + build + commit**

```bash
pnpm typecheck && pnpm build
git add src/i18n/es/entrenamiento.json src/i18n/en/entrenamiento.json
git commit -m "feat(training): i18n strings for routines/programs/planner (ES + EN)"
```

---

## Task 17 — Reproduce & fix B-2 (add-exercise on /training/new) — systematic-debugging

**Files:**
- Create: `src/features/training/components/SessionEditor.b2.test.tsx`
- Modify: (the file the diagnosis points to — likely `ExerciseBlock.tsx`, `ExercisePicker.tsx`, or `SetRow.tsx`)

> **REQUIRED SUB-SKILL:** Use superpowers:systematic-debugging for this task. The
> existing `SessionEditor.test.tsx` deliberately **mocks** `ExercisePicker` and
> notes (its header comment) that the real "type-then-submit" interaction is
> untested under jsdom + RHF nested field-arrays. B-2 lives in that untested
> path. Do NOT guess a fix — reproduce first, find the root cause, then fix.

- [ ] **Step 1: Write a reproduction test** that exercises the REAL add-exercise
  flow the current suite skips: render `SessionEditor` with the real
  `ExerciseBlock`/`SetRow` (mock only `useExerciseSearch`/`useExerciseHistory`
  data hooks and `@/lib/supabase`, NOT the picker), then: pick an exercise via
  the picker, click "+ Add exercise", pick a second exercise, fill reps/weight
  on each, submit, and assert the `onSubmit` payload contains **two** exercise
  blocks with the correct `exercise_id`s and set values.

```tsx
// @vitest-environment jsdom
import '@/i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

const EXES = [
  { id: 'aaaaaaaa-0000-0000-0000-000000000001', name_es: 'Press de banca', name_en: 'Bench', primary_muscle: 'chest', equipment: 'barbell', default_increment_kg: 2.5, is_verified: true, source: 'system', created_by_user_id: null, created_at: '', updated_at: '' },
  { id: 'bbbbbbbb-0000-0000-0000-000000000002', name_es: 'Sentadilla', name_en: 'Squat', primary_muscle: 'quads', equipment: 'barbell', default_increment_kg: 5, is_verified: true, source: 'system', created_by_user_id: null, created_at: '', updated_at: '' },
];
vi.mock('../exercises/hooks', () => ({
  useExerciseSearch: (q: string) => ({ data: EXES.filter((e) => e.name_es.toLowerCase().includes(q.toLowerCase())), isLoading: false }),
}));
vi.mock('../hooks', () => ({ useExerciseHistory: () => ({ data: [], isLoading: false }) }));

import { SessionEditor } from './SessionEditor';

beforeEach(async () => { await i18n.changeLanguage('es'); });

describe('B-2: add multiple exercises on a fresh session', () => {
  it('captures two picked exercises in the submitted payload', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue('id');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <SessionEditor initial={null} onSubmit={onSubmit} onSaved={vi.fn()} />
      </QueryClientProvider>,
    );

    // Pick first exercise in the default block.
    await user.type(screen.getByPlaceholderText(i18n.t('entrenamiento:picker.placeholder')), 'Press');
    await user.click(await screen.findByText('Press de banca'));

    // Add a second exercise block.
    await user.click(screen.getByRole('button', { name: i18n.t('entrenamiento:editor.addExercise') }));
    const pickers = screen.getAllByPlaceholderText(i18n.t('entrenamiento:picker.placeholder'));
    await user.type(pickers[pickers.length - 1], 'Sentadilla');
    await user.click(await screen.findByText('Sentadilla'));

    // Fill one set per block.
    const repsInputs = screen.getAllByLabelText(i18n.t('entrenamiento:setRow.reps'));
    const weightInputs = screen.getAllByLabelText(i18n.t('entrenamiento:setRow.weightKg'));
    await user.type(repsInputs[0], '8'); await user.type(weightInputs[0], '70');
    await user.type(repsInputs[1], '5'); await user.type(weightInputs[1], '100');

    await user.click(screen.getByRole('button', { name: i18n.t('entrenamiento:editor.save') }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const ids = onSubmit.mock.calls[0][0].sets.map((s: { exercise_id: string }) => s.exercise_id);
    expect(new Set(ids)).toEqual(new Set([EXES[0].id, EXES[1].id]));
  });
});
```

- [ ] **Step 2: Run the reproduction**

Run: `pnpm vitest run src/features/training/components/SessionEditor.b2.test.tsx`
Expected: **FAIL** — this is the reproduction of B-2. Read the actual failure
(wrong payload? second pick not captured? number inputs NaN?). Record the
observed symptom.

- [ ] **Step 3: Root-cause via systematic-debugging.** Form a single hypothesis
  from the failure (candidate areas, in likelihood order: number `valueAsNumber`
  yielding `NaN` for typed values being filtered out by the submit filter at
  `SessionEditor.tsx:118-119`; `ExercisePicker` outside-click closing the
  dropdown before the option's click registers; stale `blockIndex` closure in
  `ExerciseBlock`). Confirm the hypothesis by reading the relevant lines / adding
  a temporary log, before editing.

- [ ] **Step 4: Apply the minimal fix** the root cause dictates (the exact change
  depends on Step 3's finding — do not pre-assume). Re-run the reproduction:

Run: `pnpm vitest run src/features/training/components/SessionEditor.b2.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full training test suite** to confirm no regression:

Run: `pnpm vitest run src/features/training`
Expected: all PASS (including the original `SessionEditor.test.tsx`).

- [ ] **Step 6: Commit**

```bash
git add src/features/training
git commit -m "fix(training): B-2 add-exercise flow on session editor + reproduction test"
```

---

## Task 18 — Docs hook-up

**Files:**
- Modify: `docs/roadmap.md`
- Modify: `docs/decisions.md`
- Modify: `docs/data-model.md`
- Modify: `docs/operations.md`

- [ ] **Step 1: Roadmap entry.** Add a new R-id (pick the next free one) for
  "Training Routines & Cyclic Planner (F-2)" with `blocked-by: R-19 prod apply`,
  status `in-progress (staged)`, links to the spec + this plan, and the
  in-scope / out-of-scope summary (out: F-3 runner, F-4 muscle viz, U-8 visual).
  Add the index line at the top of the R-id list.

- [ ] **Step 2: Decisions entry.** Add a new `D-xx` recording: the two-layer
  routine/program model, calendar-anchored scheduling with restart-from-today
  (vs advancing/queue), no-materialization (compute-on-the-fly), and the
  `set_active_program` "single-table-but-RPC for atomic flip" call. Reference the
  spec.

- [ ] **Step 3: Data-model entry.** Document the 4 new tables + the 2
  `workout_sessions` columns + the 3 RPCs in `docs/data-model.md`, in the same
  style as the existing training tables (purpose + column purpose + RLS shape).
  Add the 4 RPCs to the user-callable RPC list; note all are INVOKER.

- [ ] **Step 4: Operations Wave-3 list.** Append the 4 F-2 migrations
  (`20260528120000…120030`) to the Wave-3 migration-sequence block in
  `docs/operations.md`, in order, noting they apply after R-19's.

- [ ] **Step 5: Commit**

```bash
git add docs/roadmap.md docs/decisions.md docs/data-model.md docs/operations.md
git commit -m "docs(F-2): roadmap + decision + data-model + Wave-3 entries for routines/planner"
```

---

## Validation (run before declaring done)

- [ ] `pnpm typecheck` — 0 errors.
- [ ] `pnpm lint` — 0 errors (pre-existing warnings OK).
- [ ] `pnpm test` — all green (existing suite + new core/schema/component/B-2 tests).
- [ ] `pnpm build` — succeeds; `dist/sw.js` written.
- [ ] **Manual smoke (dev, against prod-applied schema after Wave-3):**
  1. `/routine` → Rutinas → create "Push A" with 2 exercises → save → appears in list.
  2. Programas → create "PPL test" with [Push A, Rest] → save → activate (anchor today).
  3. `/training` "Hoy" → shows "Push A" today; tap "Empezar" → editor pre-filled with Push A's exercises and set rows → fill + save.
  4. Re-open the saved session → sets persist; confirm the session row has `routine_id` set (check via Supabase).
  5. Set system clock / pick a date one day ahead conceptually → "Hoy" shows the Rest card.

---

## Wave-3 apply procedure (manual, after user sign-off)

Apply the 4 F-2 migrations **in order** via `apply_migration` (NOT `db push`),
after R-19's migrations are confirmed applied (they are, in prod):

1. `20260528120000_f2_routines.sql`
2. `20260528120010_f2_programs.sql`
3. `20260528120020_f2_workout_session_stamps.sql`
4. `20260528120030_f2_rpcs.sql`

Then merge the PR into `develop`, watch the Vercel preview render `/routine` and
the planner-first `/training` against the real schema. Promote to `main` via the
usual `release/*` flow.

---

## Tier-3 (pgTAP) gap

Same status as R-01/R-19: Tier-3 RLS/RPC tests for `routines` /
`routine_exercises` / `programs` / `program_days` / the 3 RPCs are gated behind
R-16-Tier-3 infra (no `supabase start` / pgTAP in repo). Document the gap; don't
fake coverage. When R-16-Tier-3 ships, add: owner-only on routines/programs,
RLS-via-join on the two child tables, `save_routine`/`save_program`
replace-children correctness, `set_active_program` one-active invariant
(attempt to activate two → second wins, first deactivated), cross-user isolation,
and `save_workout` stamp round-trip.
```
