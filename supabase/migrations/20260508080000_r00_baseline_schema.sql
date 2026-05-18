-- =============================================================================
-- R-00 — Baseline schema (captured 2026-05-18)
-- =============================================================================
-- This file is the captured baseline of the PRE-EXISTING production schema as
-- it stood on 2026-05-18. The live schema for Supabase project
-- `upvraruehzurbetzrxov` (EU Frankfurt) was originally built incrementally via
-- the Supabase dashboard / MCP; before this file the repo's `supabase/migrations/`
-- contained only `20260514120000_sprint9_cron_and_jobs.sql`, so the schema was
-- not reproducible from migrations.
--
-- It was reconstructed READ-ONLY from `information_schema` / `pg_catalog`
-- introspection (no DDL/DML was run against prod to produce it). It is the
-- repo's reproducibility baseline.
--
-- It is NOT auto-applied: CI does not run migrations, and the live prod DB
-- already contains every object below. Applying this file to the existing prod
-- DB MUST be a verified no-op — it is intentionally written with
-- `create … if not exists` / `do $$ … exception when duplicate_object …`
-- guards so a re-apply is safe. Verifying that no-op against prod (via the
-- Supabase CLI / `supabase db`) is itself a Wave-3 validation item and is NOT
-- performed by the PR that introduces this file.
--
-- ----------------------------------------------------------------------------
-- Migration ordering (full reasoning in the R-00 PR body)
-- ----------------------------------------------------------------------------
-- Apply order is filename-lexicographic:
--
--   20260508080000_r00_baseline_schema.sql   <- THIS FILE (pre-sprint9 schema)
--   20260514120000_sprint9_cron_and_jobs.sql <- Sprint 9 cron/RPC/Vault helper
--   20260518000000_r06_fat_pct_check.sql     <- STAGED Wave-3
--   20260518010000_r18_cron_healthcheck.sql  <- STAGED Wave-3
--   20260518020000_r07_adaptive_tdee_state.sql <- STAGED Wave-3
--
-- This baseline deliberately EXCLUDES the objects already owned by
-- `20260514120000_sprint9_cron_and_jobs.sql` so `baseline + sprint9` together
-- equal the full live schema with no double-create conflict. Specifically, the
-- sprint9 migration (NOT this file) owns:
--   * extensions `pg_net`, `pg_cron`
--   * `schema private` + `private.invoke_edge_function(text)`
--   * `public.apply_template_to_week_admin(uuid,uuid,date)`
--   * `tdee_estimates` UNIQUE (user_id, computed_on)
--   * the three pg_cron jobs (daily-nutrition-snapshot / weekly-rollover /
--     recalculate-tdee)
--
-- This baseline also does NOT include any STAGED Wave-3 changes (R-06 fat-pct
-- CHECK, R-18 cron, R-07 `tdee_state` + nullable `tdee_estimates` cols,
-- R-03/R-08/R-14 column drops, R-12 RPC) — those live in their own staged
-- files and reflect the schema's FUTURE, not its state now.
--
-- Object definitions below mirror live prod exactly (e.g. `phases`
-- `protein_g_per_kg` default is the live `1.60`; the public RPCs are
-- SECURITY INVOKER with `set search_path = ''`, matching prod). The R-05/R-06
-- code changes that already shipped did not alter these DB defaults/objects;
-- their DB-side changes are the separately-staged Wave-3 files.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Extensions (in the `extensions` schema, not `public`)
-- pg_net / pg_cron are intentionally NOT here — sprint9 owns them.
-- ----------------------------------------------------------------------------
create schema if not exists extensions;
create extension if not exists "uuid-ossp"  with schema extensions;
create extension if not exists pgcrypto     with schema extensions;
create extension if not exists pg_trgm      with schema extensions;
create extension if not exists btree_gist   with schema extensions;

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

-- profiles — extends auth.users (1 row per user)
create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  display_name      text,
  language          text not null default 'es'     check (language = any (array['es','en'])),
  units             text not null default 'metric' check (units = any (array['metric','imperial'])),
  start_date        date not null default current_date,
  initial_weight_kg numeric(5,2),
  sex               text check (sex = any (array['male','female','other'])),
  birth_date        date,
  height_cm         numeric(5,1),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  bone_kg           numeric(4,2)
);

-- body_measurements — one body-composition entry per user per day
create table if not exists public.body_measurements (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  measured_on  date not null,
  weight_kg    numeric(5,2),
  body_fat_pct numeric(4,2),
  muscle_pct   numeric(4,2),
  water_pct    numeric(4,2),
  notes        text,
  created_at   timestamptz not null default now(),
  unique (user_id, measured_on)
);
-- Live prod has a dropped column at ordinal 8 here (the old `bone_kg`, since
-- relocated onto `profiles`). A fresh `create table` legitimately has no such
-- hole; this is a cosmetic ordinal difference only and does not affect schema
-- equivalence (column set/types/constraints match prod).

-- ingredients — shared crowdsourced library (created_by_user_id = null = system seed)
create table if not exists public.ingredients (
  id                 uuid primary key default gen_random_uuid(),
  created_by_user_id uuid references public.profiles(id) on delete set null,
  name               text not null,
  brand              text,
  unit_type          text not null default 'gram'   check (unit_type = any (array['gram','unit'])),
  kcal_per_unit      numeric(7,2) not null,
  protein_g_per_unit numeric(6,2) not null,
  carbs_g_per_unit   numeric(6,2) not null,
  fat_g_per_unit     numeric(6,2) not null,
  fiber_g_per_unit   numeric(6,2) not null default 0,
  source             text not null default 'manual' check (source = any (array['manual','openfoodfacts','bedca','system'])),
  external_id        text,
  is_verified        boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint ingredients_source_external_id_key unique (source, external_id),
  constraint ingredients_external_consistency
    check (external_id is null or source = any (array['openfoodfacts','bedca']))
);

-- recipes — per-user, soft-delete via deleted_at
create table if not exists public.recipes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  name         text not null,
  servings     numeric(5,2) not null default 1 check (servings > 0),
  description  text,
  instructions text,
  photo_url    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- recipe_ingredients — join to the shared ingredient library
-- NOTE: ingredient FK is ON DELETE RESTRICT (shared-data backstop, D-A2).
create table if not exists public.recipe_ingredients (
  id            uuid primary key default gen_random_uuid(),
  recipe_id     uuid not null references public.recipes(id)     on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  quantity      numeric(8,2) not null,
  per_serving   boolean not null default false,
  display_order integer not null default 0,
  created_at    timestamptz not null default now()
);

-- goals — one row per user (pk = user_id)
create table if not exists public.goals (
  user_id             uuid primary key references public.profiles(id) on delete cascade,
  target_body_fat_pct numeric(4,2) not null default 20,
  notes               text,
  updated_at          timestamptz not null default now()
);

-- phases — time-boxed dietary period; non-overlapping per user via EXCLUDE gist
create table if not exists public.phases (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  name             text not null,
  phase_type       text not null check (phase_type = any (array['cut','maintenance','bulk'])),
  start_date       date not null,
  end_date         date,
  kcal_mode        text not null check (kcal_mode = any (array['absolute','tdee_delta'])),
  kcal_value       numeric(6,1) not null,
  protein_g_per_kg numeric(4,2) not null default 1.60,
  fat_pct_of_kcal  numeric(4,3) not null default 0.250,
  fiber_mode       text not null default 'per_1000_kcal' check (fiber_mode = any (array['fixed_g','per_1000_kcal'])),
  fiber_value      numeric(5,2) not null default 14,
  notes            text,
  created_at       timestamptz not null default now()
);
do $$
begin
  alter table public.phases
    add constraint phases_user_id_daterange_excl
    exclude using gist (
      user_id with =,
      daterange(start_date, coalesce(end_date, 'infinity'::date), '[]') with &&
    );
exception
  when duplicate_table then null;   -- constraint already present
  when duplicate_object then null;
end $$;

-- meal_plan_templates — named, reusable menus
create table if not exists public.meal_plan_templates (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles(id) on delete cascade,
  name                   text not null,
  same_schedule_all_days boolean not null default true,
  default_meal_times     time[] not null default array['08:00','13:00','17:00','21:00']::time[],
  is_auto_generated      boolean not null default false,
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (user_id, name)
);

-- meal_plan_template_day_times — per-day meal-time overrides
create table if not exists public.meal_plan_template_day_times (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.meal_plan_templates(id) on delete cascade,
  day_of_week integer not null check (day_of_week >= 0 and day_of_week <= 6),
  meal_times  time[] not null,
  unique (template_id, day_of_week)
);

-- meal_plan_template_slots — recipes per meal slot in a template
-- NOTE: recipe FK is ON DELETE RESTRICT.
create table if not exists public.meal_plan_template_slots (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references public.meal_plan_templates(id) on delete cascade,
  day_of_week   integer not null check (day_of_week >= 0 and day_of_week <= 6),
  meal_index    integer not null check (meal_index >= 0),
  recipe_id     uuid not null references public.recipes(id) on delete restrict,
  servings      numeric(5,2) not null default 1 check (servings > 0),
  display_order integer not null default 0,
  created_at    timestamptz not null default now()
);

-- meal_plan_weeks — the active dynamic week
create table if not exists public.meal_plan_weeks (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  week_start         date not null,
  source_template_id uuid references public.meal_plan_templates(id) on delete set null,
  has_diverged       boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, week_start)
);

-- meal_plan_week_slots — slots inside the dynamic week
-- NOTE: recipe FK is ON DELETE RESTRICT.
create table if not exists public.meal_plan_week_slots (
  id            uuid primary key default gen_random_uuid(),
  plan_week_id  uuid not null references public.meal_plan_weeks(id) on delete cascade,
  date          date not null,
  meal_index    integer not null check (meal_index >= 0),
  meal_time     time,
  recipe_id     uuid not null references public.recipes(id) on delete restrict,
  servings      numeric(5,2) not null default 1 check (servings > 0),
  display_order integer not null default 0,
  created_at    timestamptz not null default now()
);

-- meal_logs — one row per logged food item per day
-- meal_log_one_source: exactly one of recipe_id / ingredient_id / custom_name.
create table if not exists public.meal_logs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  logged_on         date not null,
  meal_type         text check (meal_type = any (array['breakfast','lunch','snack','dinner','other'])),
  recipe_id         uuid references public.recipes(id)     on delete set null,
  ingredient_id     uuid references public.ingredients(id) on delete set null,
  custom_name       text,
  servings          numeric(6,2),
  quantity          numeric(8,2),
  custom_kcal       numeric(7,2),
  custom_protein_g  numeric(6,2),
  custom_carbs_g    numeric(6,2),
  custom_fat_g      numeric(6,2),
  custom_fiber_g    numeric(6,2),
  from_plan         boolean not null default false,
  plan_week_slot_id uuid references public.meal_plan_week_slots(id) on delete set null,
  notes             text,
  created_at        timestamptz not null default now(),
  constraint meal_log_one_source check (
    ( (recipe_id is not null)::int
    + (ingredient_id is not null)::int
    + (custom_name is not null)::int ) = 1
  )
);

-- daily_nutrition_history — daily planned-vs-consumed snapshot (pk = user_id, logged_on)
create table if not exists public.daily_nutrition_history (
  user_id            uuid not null references public.profiles(id) on delete cascade,
  logged_on          date not null,
  planned_kcal       numeric(7,1),
  planned_protein_g  numeric(6,2),
  planned_carbs_g    numeric(6,2),
  planned_fat_g      numeric(6,2),
  planned_fiber_g    numeric(6,2),
  consumed_kcal      numeric(7,1),
  consumed_protein_g numeric(6,2),
  consumed_carbs_g   numeric(6,2),
  consumed_fat_g     numeric(6,2),
  consumed_fiber_g   numeric(6,2),
  had_active_plan    boolean not null default false,
  computed_at        timestamptz not null default now(),
  primary key (user_id, logged_on)
);

-- tdee_estimates — TDEE cache
-- The UNIQUE (user_id, computed_on) constraint is owned by the sprint9
-- migration (NOT here) so baseline+sprint9 do not double-create it.
create table if not exists public.tdee_estimates (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  computed_on         date not null,
  window_days         integer not null,
  avg_kcal_intake     numeric(7,1) not null,
  weight_delta_kg     numeric(5,2) not null,
  estimated_tdee_kcal numeric(7,1) not null,
  bmr_kcal            numeric(7,1),
  activity_kcal       numeric(7,1),
  workout_kcal_logged numeric(7,1),
  neat_residual_kcal  numeric(7,1),
  created_at          timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Secondary indexes (PK / UNIQUE indexes are created by the constraints above)
-- ----------------------------------------------------------------------------
create index if not exists idx_body_measurements_user_date
  on public.body_measurements using btree (user_id, measured_on desc);

create index if not exists idx_ingredients_name_trgm
  on public.ingredients using gin (name extensions.gin_trgm_ops);
create index if not exists idx_ingredients_brand_trgm
  on public.ingredients using gin (brand extensions.gin_trgm_ops) where (brand is not null);

create index if not exists idx_recipes_user_active
  on public.recipes using btree (user_id, updated_at desc) where (deleted_at is null);
create unique index if not exists recipes_user_id_name_active
  on public.recipes using btree (user_id, name) where (deleted_at is null);

create index if not exists idx_recipe_ingredients_recipe
  on public.recipe_ingredients using btree (recipe_id);

create index if not exists idx_meal_logs_user_date
  on public.meal_logs using btree (user_id, logged_on desc);

create index if not exists idx_template_slots
  on public.meal_plan_template_slots using btree (template_id, day_of_week, meal_index);

create index if not exists idx_plan_week_slots
  on public.meal_plan_week_slots using btree (plan_week_id, date, meal_index);

create index if not exists idx_phases_user_active
  on public.phases using btree (user_id, start_date desc) where (end_date is null);

create index if not exists idx_daily_history_user
  on public.daily_nutrition_history using btree (user_id, logged_on desc);

create index if not exists idx_tdee_user_date
  on public.tdee_estimates using btree (user_id, computed_on desc);

-- ----------------------------------------------------------------------------
-- View: body_measurements_smoothed (adds the 5-day weight moving average)
-- Not RLS-able (a plain view); access is gated by the underlying table RLS.
-- ----------------------------------------------------------------------------
create or replace view public.body_measurements_smoothed as
  select
    id, user_id, measured_on, weight_kg, body_fat_pct, muscle_pct,
    water_pct, notes, created_at,
    avg(weight_kg) over (
      partition by user_id order by measured_on
      rows between 4 preceding and current row
    ) as weight_kg_5day_avg
  from public.body_measurements bm;

-- ----------------------------------------------------------------------------
-- Trigger fn + trigger: handle_new_user (auto-create profile on signup)
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Trigger fn + trigger: mark_week_diverged (flip has_diverged for today+ edits)
-- ----------------------------------------------------------------------------
create or replace function public.mark_week_diverged()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  update public.meal_plan_weeks
    set has_diverged = true, updated_at = now()
    where id = coalesce(new.plan_week_id, old.plan_week_id)
      and coalesce(new.date, old.date) >= current_date;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_mark_week_diverged on public.meal_plan_week_slots;
create trigger trg_mark_week_diverged
  after insert or delete or update on public.meal_plan_week_slots
  for each row execute function public.mark_week_diverged();

-- ----------------------------------------------------------------------------
-- RPCs (user-facing, SECURITY INVOKER, set search_path = '')
-- apply_template_to_week_admin is NOT here — sprint9 owns it.
-- ----------------------------------------------------------------------------

create or replace function public.save_recipe(
  p_recipe_id uuid, p_name text, p_servings numeric,
  p_description text, p_instructions text, p_ingredients jsonb
)
returns uuid
language plpgsql
set search_path to ''
as $$
declare
  v_user_id uuid;
  v_recipe_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if p_recipe_id is null then
    insert into public.recipes (user_id, name, servings, description, instructions)
    values (v_user_id, p_name, p_servings, p_description, p_instructions)
    returning id into v_recipe_id;
  else
    update public.recipes
      set name = p_name,
          servings = p_servings,
          description = p_description,
          instructions = p_instructions,
          updated_at = now()
      where id = p_recipe_id
        and user_id = v_user_id
        and deleted_at is null
      returning id into v_recipe_id;
    if v_recipe_id is null then
      raise exception 'recipe not found or not owned by user';
    end if;
    delete from public.recipe_ingredients where recipe_id = v_recipe_id;
  end if;

  insert into public.recipe_ingredients
    (recipe_id, ingredient_id, quantity, per_serving, display_order)
  select v_recipe_id,
         (item->>'ingredient_id')::uuid,
         (item->>'quantity')::numeric,
         coalesce((item->>'per_serving')::boolean, false),
         coalesce((item->>'display_order')::int, 0)
  from jsonb_array_elements(p_ingredients) as item;

  return v_recipe_id;
end;
$$;

create or replace function public.save_template(
  p_template_id uuid, p_name text, p_same_schedule_all_days boolean,
  p_default_meal_times text[], p_slots jsonb, p_day_times jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
set search_path to ''
as $$
declare
  v_user_id uuid;
  v_template_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if p_template_id is null then
    insert into public.meal_plan_templates
      (user_id, name, same_schedule_all_days, default_meal_times)
    values
      (v_user_id, p_name, p_same_schedule_all_days, p_default_meal_times::time[])
    returning id into v_template_id;
  else
    update public.meal_plan_templates
      set name = p_name,
          same_schedule_all_days = p_same_schedule_all_days,
          default_meal_times = p_default_meal_times::time[],
          updated_at = now()
      where id = p_template_id and user_id = v_user_id
      returning id into v_template_id;
    if v_template_id is null then
      raise exception 'template not found or not owned by user';
    end if;
    delete from public.meal_plan_template_slots where template_id = v_template_id;
    delete from public.meal_plan_template_day_times where template_id = v_template_id;
  end if;

  insert into public.meal_plan_template_slots
    (template_id, day_of_week, meal_index, recipe_id, servings, display_order)
  select v_template_id,
         (item->>'day_of_week')::int,
         (item->>'meal_index')::int,
         (item->>'recipe_id')::uuid,
         (item->>'servings')::numeric,
         coalesce((item->>'display_order')::int, 0)
  from jsonb_array_elements(p_slots) as item;

  if jsonb_array_length(p_day_times) > 0 then
    insert into public.meal_plan_template_day_times
      (template_id, day_of_week, meal_times)
    select v_template_id,
           (item->>'day_of_week')::int,
           (
             select array_agg(t::time)
             from jsonb_array_elements_text(item->'meal_times') t
           )
    from jsonb_array_elements(p_day_times) as item;
  end if;

  return v_template_id;
end;
$$;

create or replace function public.apply_template_to_week(
  p_template_id uuid, p_target_date date
)
returns uuid
language plpgsql
set search_path to ''
as $$
declare
  v_user_id uuid;
  v_week_start date;
  v_week_id uuid;
  v_template_default_times time[];
  v_d date;
  v_dow int;
  v_meal_times time[];
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select default_meal_times into v_template_default_times
    from public.meal_plan_templates
    where id = p_template_id and user_id = v_user_id;
  if v_template_default_times is null then
    raise exception 'template not found';
  end if;

  v_week_start := (p_target_date - ((extract(isodow from p_target_date)::int - 1)))::date;

  insert into public.meal_plan_weeks (user_id, week_start, source_template_id, has_diverged)
  values (v_user_id, v_week_start, p_template_id, false)
  on conflict (user_id, week_start) do update
    set source_template_id = excluded.source_template_id,
        has_diverged = false,
        updated_at = now()
  returning id into v_week_id;

  delete from public.meal_plan_week_slots
    where plan_week_id = v_week_id and date >= p_target_date;

  v_d := p_target_date;
  while v_d <= v_week_start + 6 loop
    v_dow := extract(isodow from v_d)::int - 1;

    select meal_times into v_meal_times
      from public.meal_plan_template_day_times
      where template_id = p_template_id and day_of_week = v_dow;
    if v_meal_times is null then
      v_meal_times := v_template_default_times;
    end if;

    insert into public.meal_plan_week_slots
      (plan_week_id, date, meal_index, meal_time, recipe_id, servings, display_order)
    select v_week_id, v_d, ts.meal_index,
           v_meal_times[ts.meal_index + 1],
           ts.recipe_id, ts.servings, ts.display_order
    from public.meal_plan_template_slots ts
    where ts.template_id = p_template_id and ts.day_of_week = v_dow;

    v_d := v_d + 1;
  end loop;

  update public.meal_plan_weeks
    set has_diverged = false, updated_at = now()
    where id = v_week_id;

  return v_week_id;
end;
$$;

create or replace function public.save_week_as_template(
  p_week_id uuid, p_name text
)
returns uuid
language plpgsql
set search_path to ''
as $$
declare
  v_user_id uuid;
  v_template_id uuid;
  v_week_start date;
  v_default_times time[];
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select week_start into v_week_start
    from public.meal_plan_weeks
    where id = p_week_id and user_id = v_user_id;
  if v_week_start is null then
    raise exception 'week not found';
  end if;

  -- Monday's meal_times (in slot order) become the default
  select coalesce(
    array_agg(distinct meal_time order by meal_time)
      filter (where meal_time is not null),
    array['08:00','13:00','17:00','21:00']::time[]
  )
  into v_default_times
  from public.meal_plan_week_slots
  where plan_week_id = p_week_id and date = v_week_start;

  insert into public.meal_plan_templates
    (user_id, name, same_schedule_all_days, default_meal_times, is_auto_generated)
  values
    (v_user_id, p_name, true, v_default_times, false)
  returning id into v_template_id;

  insert into public.meal_plan_template_slots
    (template_id, day_of_week, meal_index, recipe_id, servings, display_order)
  select v_template_id,
         (extract(isodow from date)::int - 1),
         meal_index,
         recipe_id,
         servings,
         display_order
  from public.meal_plan_week_slots
  where plan_week_id = p_week_id;

  return v_template_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Row-Level Security
-- ----------------------------------------------------------------------------
alter table public.profiles                     enable row level security;
alter table public.body_measurements            enable row level security;
alter table public.ingredients                  enable row level security;
alter table public.recipes                      enable row level security;
alter table public.recipe_ingredients           enable row level security;
alter table public.goals                        enable row level security;
alter table public.phases                       enable row level security;
alter table public.meal_plan_templates          enable row level security;
alter table public.meal_plan_template_day_times enable row level security;
alter table public.meal_plan_template_slots     enable row level security;
alter table public.meal_plan_weeks              enable row level security;
alter table public.meal_plan_week_slots         enable row level security;
alter table public.meal_logs                    enable row level security;
alter table public.daily_nutrition_history      enable row level security;
alter table public.tdee_estimates               enable row level security;

-- Standard per-user pattern: SELECT/INSERT/UPDATE/DELETE gated on auth.uid().
-- `create policy` is not idempotent, so the whole set is guarded.
--
-- DESIGN NOTE — this DO-block is intentionally ALL-OR-NOTHING: a caught
-- `duplicate_object` aborts the entire block (PL/pgSQL does not resume after
-- the failing statement). Correct for the only two intended paths:
--   * existing prod (every policy already exists): the first CREATE throws,
--     the rest are skipped → exactly the desired no-op.
--   * clean standup (e.g. `supabase db reset`, R-16 Tier-3): no exception,
--     all policies created.
-- It is NOT safe for a partial-policy state. Do NOT append new policies here:
-- a future migration that adds a policy must put it in its OWN separately
-- guarded block, or earlier existing policies will make it silently skip.
do $$
begin
  -- profiles (gated on id, not user_id)
  create policy "Users see own profile"   on public.profiles for select using (auth.uid() = id);
  create policy "Users insert own profile" on public.profiles for insert with check (auth.uid() = id);
  create policy "Users update own profile" on public.profiles for update using (auth.uid() = id);
  create policy "Users delete own profile" on public.profiles for delete using (auth.uid() = id);

  -- body_measurements
  create policy "Users see own measurements"    on public.body_measurements for select using (auth.uid() = user_id);
  create policy "Users insert own measurements" on public.body_measurements for insert with check (auth.uid() = user_id);
  create policy "Users update own measurements" on public.body_measurements for update using (auth.uid() = user_id);
  create policy "Users delete own measurements" on public.body_measurements for delete using (auth.uid() = user_id);

  -- recipes
  create policy "Users see own recipes"    on public.recipes for select using (auth.uid() = user_id);
  create policy "Users insert own recipes" on public.recipes for insert with check (auth.uid() = user_id);
  create policy "Users update own recipes" on public.recipes for update using (auth.uid() = user_id);
  create policy "Users delete own recipes" on public.recipes for delete using (auth.uid() = user_id);

  -- recipe_ingredients (via join to recipes)
  create policy "Users see own recipe ingredients"    on public.recipe_ingredients for select
    using (exists (select 1 from public.recipes r where r.id = recipe_ingredients.recipe_id and r.user_id = auth.uid()));
  create policy "Users insert own recipe ingredients" on public.recipe_ingredients for insert
    with check (exists (select 1 from public.recipes r where r.id = recipe_ingredients.recipe_id and r.user_id = auth.uid()));
  create policy "Users update own recipe ingredients" on public.recipe_ingredients for update
    using (exists (select 1 from public.recipes r where r.id = recipe_ingredients.recipe_id and r.user_id = auth.uid()));
  create policy "Users delete own recipe ingredients" on public.recipe_ingredients for delete
    using (exists (select 1 from public.recipes r where r.id = recipe_ingredients.recipe_id and r.user_id = auth.uid()));

  -- goals
  create policy "Users see own goals"    on public.goals for select using (auth.uid() = user_id);
  create policy "Users insert own goals" on public.goals for insert with check (auth.uid() = user_id);
  create policy "Users update own goals" on public.goals for update using (auth.uid() = user_id);
  create policy "Users delete own goals" on public.goals for delete using (auth.uid() = user_id);

  -- phases
  create policy "Users see own phases"    on public.phases for select using (auth.uid() = user_id);
  create policy "Users insert own phases" on public.phases for insert with check (auth.uid() = user_id);
  create policy "Users update own phases" on public.phases for update using (auth.uid() = user_id);
  create policy "Users delete own phases" on public.phases for delete using (auth.uid() = user_id);

  -- meal_plan_templates
  create policy "Users see own templates"    on public.meal_plan_templates for select using (auth.uid() = user_id);
  create policy "Users insert own templates" on public.meal_plan_templates for insert with check (auth.uid() = user_id);
  create policy "Users update own templates" on public.meal_plan_templates for update using (auth.uid() = user_id);
  create policy "Users delete own templates" on public.meal_plan_templates for delete using (auth.uid() = user_id);

  -- meal_plan_template_day_times (via join to templates)
  create policy "Users see own template day times"    on public.meal_plan_template_day_times for select
    using (exists (select 1 from public.meal_plan_templates t where t.id = meal_plan_template_day_times.template_id and t.user_id = auth.uid()));
  create policy "Users insert own template day times" on public.meal_plan_template_day_times for insert
    with check (exists (select 1 from public.meal_plan_templates t where t.id = meal_plan_template_day_times.template_id and t.user_id = auth.uid()));
  create policy "Users update own template day times" on public.meal_plan_template_day_times for update
    using (exists (select 1 from public.meal_plan_templates t where t.id = meal_plan_template_day_times.template_id and t.user_id = auth.uid()));
  create policy "Users delete own template day times" on public.meal_plan_template_day_times for delete
    using (exists (select 1 from public.meal_plan_templates t where t.id = meal_plan_template_day_times.template_id and t.user_id = auth.uid()));

  -- meal_plan_template_slots (via join to templates)
  create policy "Users see own template slots"    on public.meal_plan_template_slots for select
    using (exists (select 1 from public.meal_plan_templates t where t.id = meal_plan_template_slots.template_id and t.user_id = auth.uid()));
  create policy "Users insert own template slots" on public.meal_plan_template_slots for insert
    with check (exists (select 1 from public.meal_plan_templates t where t.id = meal_plan_template_slots.template_id and t.user_id = auth.uid()));
  create policy "Users update own template slots" on public.meal_plan_template_slots for update
    using (exists (select 1 from public.meal_plan_templates t where t.id = meal_plan_template_slots.template_id and t.user_id = auth.uid()));
  create policy "Users delete own template slots" on public.meal_plan_template_slots for delete
    using (exists (select 1 from public.meal_plan_templates t where t.id = meal_plan_template_slots.template_id and t.user_id = auth.uid()));

  -- meal_plan_weeks
  create policy "Users see own plan weeks"    on public.meal_plan_weeks for select using (auth.uid() = user_id);
  create policy "Users insert own plan weeks" on public.meal_plan_weeks for insert with check (auth.uid() = user_id);
  create policy "Users update own plan weeks" on public.meal_plan_weeks for update using (auth.uid() = user_id);
  create policy "Users delete own plan weeks" on public.meal_plan_weeks for delete using (auth.uid() = user_id);

  -- meal_plan_week_slots (via join to weeks)
  create policy "Users see own plan week slots"    on public.meal_plan_week_slots for select
    using (exists (select 1 from public.meal_plan_weeks w where w.id = meal_plan_week_slots.plan_week_id and w.user_id = auth.uid()));
  create policy "Users insert own plan week slots" on public.meal_plan_week_slots for insert
    with check (exists (select 1 from public.meal_plan_weeks w where w.id = meal_plan_week_slots.plan_week_id and w.user_id = auth.uid()));
  create policy "Users update own plan week slots" on public.meal_plan_week_slots for update
    using (exists (select 1 from public.meal_plan_weeks w where w.id = meal_plan_week_slots.plan_week_id and w.user_id = auth.uid()));
  create policy "Users delete own plan week slots" on public.meal_plan_week_slots for delete
    using (exists (select 1 from public.meal_plan_weeks w where w.id = meal_plan_week_slots.plan_week_id and w.user_id = auth.uid()));

  -- meal_logs
  create policy "Users see own meal logs"    on public.meal_logs for select using (auth.uid() = user_id);
  create policy "Users insert own meal logs" on public.meal_logs for insert with check (auth.uid() = user_id);
  create policy "Users update own meal logs" on public.meal_logs for update using (auth.uid() = user_id);
  create policy "Users delete own meal logs" on public.meal_logs for delete using (auth.uid() = user_id);

  -- daily_nutrition_history
  create policy "Users see own daily history"    on public.daily_nutrition_history for select using (auth.uid() = user_id);
  create policy "Users insert own daily history" on public.daily_nutrition_history for insert with check (auth.uid() = user_id);
  create policy "Users update own daily history" on public.daily_nutrition_history for update using (auth.uid() = user_id);
  create policy "Users delete own daily history" on public.daily_nutrition_history for delete using (auth.uid() = user_id);

  -- tdee_estimates
  create policy "Users see own tdee"    on public.tdee_estimates for select using (auth.uid() = user_id);
  create policy "Users insert own tdee" on public.tdee_estimates for insert with check (auth.uid() = user_id);
  create policy "Users update own tdee" on public.tdee_estimates for update using (auth.uid() = user_id);
  create policy "Users delete own tdee" on public.tdee_estimates for delete using (auth.uid() = user_id);

  -- ingredients — shared crowdsourced library (D-A1): open SELECT/INSERT for
  -- authenticated; UPDATE/DELETE creator-only; created_by_user_id IS NULL =
  -- immutable system seed.
  create policy "All users read ingredients"       on public.ingredients for select to authenticated using (true);
  create policy "Users insert ingredients"         on public.ingredients for insert to authenticated with check (auth.uid() = created_by_user_id);
  create policy "Creator updates own ingredients"  on public.ingredients for update to authenticated using (auth.uid() = created_by_user_id) with check (auth.uid() = created_by_user_id);
  create policy "Creator deletes own ingredients"  on public.ingredients for delete to authenticated using (auth.uid() = created_by_user_id);
exception
  when duplicate_object then null;   -- policies already exist (re-apply no-op)
end $$;
