-- Training MVP step 3/4 — `save_workout` RPC.
--
-- STAGED — DO NOT AUTO-APPLY.
--
-- Specced in
-- `docs/superpowers/specs/2026-05-20-training-mvp-design-v2.md` §4.4.
-- Sequenced by
-- `docs/superpowers/plans/2026-05-20-training-mvp-plan.md` Task 3.
--
-- "Log a whole session" (session + N sets) and "edit a session's sets"
-- (replace-children) are multi-table atomic writes — per project
-- invariant #3 they go through an RPC, SECURITY INVOKER, with the
-- canonical `set search_path = public`. Mirrors `save_recipe` shape.
--
-- Per-row typo edits remain direct table writes (the `workout_sets`
-- UPDATE policy permits them, gated by the RLS-via-join check).
--
-- Do not run this against any database from CI or from this PR.

create or replace function public.save_workout(
  p_session_id   uuid,
  p_performed_on date,
  p_title        text,
  p_notes        text,
  p_sets         jsonb
)
returns uuid
language plpgsql
security invoker
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
    -- CREATE: insert a fresh session row owned by the caller.
    insert into public.workout_sessions (user_id, performed_on, title, notes)
    values (v_user_id, coalesce(p_performed_on, current_date), p_title, p_notes)
    returning id into v_session_id;
  else
    -- EDIT: ownership-gated update; the RLS UPDATE policy enforces the
    -- same predicate, the `and user_id = v_user_id` here keeps the
    -- error message specific when the row exists but isn't caller-owned.
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

    -- Replace-children. Cheaper than diffing for the small N here.
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

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- ROLLBACK:
--   drop function if exists public.save_workout(uuid, date, text, text, jsonb);
