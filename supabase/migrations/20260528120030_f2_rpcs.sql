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
