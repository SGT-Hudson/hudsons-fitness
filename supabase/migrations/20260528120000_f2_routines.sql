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
  )) with check (exists (
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
