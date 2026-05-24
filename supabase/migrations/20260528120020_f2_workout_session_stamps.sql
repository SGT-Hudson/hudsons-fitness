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
