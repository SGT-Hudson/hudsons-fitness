-- R-33 wave 4 — a template carries the phase it was written for.
-- Spec: docs/superpowers/specs/2026-07-11-r33-wave4-template-phase.md
--
-- Nullable by design: every pre-existing template has no honest phase, and
-- "serves any phase" stays a legitimate permanent state. No FK to `phases` —
-- this is a loose label ("this menu is for a cut"), not a reference to one
-- dated phase the user once ran. The allowed values mirror
-- `phases.phase_type`'s check constraint exactly.
--
-- RLS on public.meal_plan_templates (auth.uid() = user_id) is unchanged and
-- remains the sole security boundary; a bad phase string is rejected by the
-- check constraint, not by app code. Both RPCs stay SECURITY INVOKER.

alter table public.meal_plan_templates
  add column if not exists phase_type text
    check (phase_type is null or phase_type in ('cut', 'maintenance', 'bulk'));

-- ----------------------------------------------------------------------------
-- save_template — gains a trailing p_phase_type, written on create and update.
--
-- DROP then CREATE, not CREATE OR REPLACE: a trailing defaulted parameter
-- changes the signature, so `create or replace` would register an OVERLOAD and
-- leave the old 6-arg body callable. The old signature is dropped explicitly.
-- Everything else below is the R-00 baseline body, unchanged.
-- ----------------------------------------------------------------------------
drop function if exists public.save_template(uuid, text, boolean, text[], jsonb, jsonb);

create or replace function public.save_template(
  p_template_id uuid, p_name text, p_same_schedule_all_days boolean,
  p_default_meal_times text[], p_slots jsonb,
  p_day_times jsonb default '[]'::jsonb,
  p_phase_type text default null
)
returns uuid
language plpgsql
security invoker
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
      (user_id, name, same_schedule_all_days, default_meal_times, phase_type)
    values
      (v_user_id, p_name, p_same_schedule_all_days, p_default_meal_times::time[], p_phase_type)
    returning id into v_template_id;
  else
    update public.meal_plan_templates
      set name = p_name,
          same_schedule_all_days = p_same_schedule_all_days,
          default_meal_times = p_default_meal_times::time[],
          phase_type = p_phase_type,
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

grant execute on function
  public.save_template(uuid, text, boolean, text[], jsonb, jsonb, text)
  to authenticated;

-- ----------------------------------------------------------------------------
-- save_week_as_template — gains the same trailing p_phase_type, so "guardar
-- como plantilla" from the planner can tag what it saves. Same DROP-then-CREATE
-- reason. Body is the R-00 baseline verbatim otherwise: is_auto_generated stays
-- hard-coded false, same_schedule_all_days stays hard-coded true, and
-- default_meal_times is still derived from Monday's distinct meal_times with
-- the 08:00/13:00/17:00/21:00 fallback.
-- ----------------------------------------------------------------------------
drop function if exists public.save_week_as_template(uuid, text);

create or replace function public.save_week_as_template(
  p_week_id uuid, p_name text, p_phase_type text default null
)
returns uuid
language plpgsql
security invoker
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
    (user_id, name, same_schedule_all_days, default_meal_times, is_auto_generated, phase_type)
  values
    (v_user_id, p_name, true, v_default_times, false, p_phase_type)
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

grant execute on function
  public.save_week_as_template(uuid, text, text)
  to authenticated;

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- ROLLBACK:
--   drop function if exists public.save_template(uuid, text, boolean, text[], jsonb, jsonb, text);
--   drop function if exists public.save_week_as_template(uuid, text, text);
--   alter table public.meal_plan_templates drop column if exists phase_type;
--   -- then re-create the 6-arg / 2-arg bodies from
--   -- 20260508080000_r00_baseline_schema.sql.
