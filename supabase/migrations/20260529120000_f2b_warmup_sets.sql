-- F-2b — routine warmup sets (% of working weight + reps).
-- STAGED — DO NOT AUTO-APPLY.
-- Adds routine_exercises.warmup_sets jsonb (array of {pct,reps}) and extends
-- save_routine to persist it. Spec: chat design 2026-05-24 (warmup-by-%).

alter table public.routine_exercises
  add column if not exists warmup_sets jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'routine_exercises_warmup_sets_is_array'
  ) then
    alter table public.routine_exercises
      add constraint routine_exercises_warmup_sets_is_array
      check (jsonb_typeof(warmup_sets) = 'array');
  end if;
end $$;

-- Recreate save_routine to persist warmup_sets (body identical to the F-2
-- version plus the new column in the child insert).
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
     target_reps_min, target_reps_max, rest_seconds, target_rpe, warmup_sets)
  select v_routine_id,
         (item->>'exercise_id')::uuid,
         (item->>'position')::int,
         (item->>'target_sets')::int,
         (item->>'target_reps_min')::int,
         (item->>'target_reps_max')::int,
         nullif(item->>'rest_seconds', '')::int,
         nullif(item->>'target_rpe', '')::numeric,
         coalesce(item->'warmup_sets', '[]'::jsonb)
  from jsonb_array_elements(p_exercises) as item;

  return v_routine_id;
end;
$$;

grant execute on function public.save_routine(uuid, text, text, jsonb) to authenticated;

-- ROLLBACK:
--   (recreate save_routine without warmup_sets from 20260528120030_f2_rpcs.sql)
--   alter table public.routine_exercises drop constraint if exists routine_exercises_warmup_sets_is_array;
--   alter table public.routine_exercises drop column if exists warmup_sets;
