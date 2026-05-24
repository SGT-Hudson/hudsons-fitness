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
  )) with check (exists (
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
