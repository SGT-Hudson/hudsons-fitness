-- Training MVP step 2/4 — `workout_sessions` + `workout_sets`.
--
-- STAGED — DO NOT AUTO-APPLY.
--
-- Specced in
-- `docs/superpowers/specs/2026-05-20-training-mvp-design-v2.md` §4.2
-- + §4.3. Sequenced by
-- `docs/superpowers/plans/2026-05-20-training-mvp-plan.md` Task 2.
--
-- Architecture notes:
--   - `workout_sessions` is user-owned (1 row per logical workout). No
--     unique on `(user_id, performed_on)` — multiple sessions per day
--     are allowed (spec §0.3).
--   - `workout_sets` is user-owned but RLS routes through the parent
--     `workout_sessions` via an `exists` subquery (mirrors the proven
--     `recipe_ingredients` → `recipes` policy shape from the R-00
--     baseline). No `user_id` column on `workout_sets` (spec §0.5).
--   - `exercise_id` uses `ON DELETE RESTRICT` so a system / shared
--     exercise can never silently disappear out from under historical
--     logs. Exercise lifecycle is creator-hide (post-R-01 pattern), not
--     hard-delete.
--   - `set_index` is a per-session-per-exercise ordinal; the
--     `unique (session_id, exercise_id, set_index)` makes the save-RPC's
--     "replace-children" pattern race-safe.
--
-- Do not run this against any database from CI or from this PR.

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

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- ROLLBACK:
--   drop table if exists public.workout_sets;
--   drop table if exists public.workout_sessions;
