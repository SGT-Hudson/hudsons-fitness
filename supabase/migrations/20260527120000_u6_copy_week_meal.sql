-- U-6 — copy one planned meal onto other days of the active week.
--
-- STAGED — DO NOT AUTO-APPLY. Specced in
-- `docs/superpowers/specs/2026-05-24-copy-meal-across-days-design.md` §6;
-- sequenced by `docs/superpowers/plans/2026-05-24-copy-meal-across-days.md` Task 3.
--
-- Copy-with-overwrite is a multi-row delete-then-insert across N target days
-- that must be atomic. Single table, so invariant #3 (>1-table) does not compel
-- it — the RPC is chosen for atomicity (a client delete+insert would be two
-- non-atomic round trips). SECURITY INVOKER + canonical `set search_path`;
-- RLS on meal_plan_week_slots is the sole security boundary.
--
-- Do not run this against any database from CI or from this PR.

create or replace function public.copy_week_meal(
  p_plan_week_id uuid,
  p_source_date  date,
  p_meal_index   int,
  p_target_dates date[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Replace target days' slots at this meal index (RLS scopes to the owner).
  delete from public.meal_plan_week_slots
   where plan_week_id = p_plan_week_id
     and meal_index   = p_meal_index
     and date = any (p_target_dates);

  -- Copy the source meal's rows onto each target date.
  insert into public.meal_plan_week_slots
    (plan_week_id, date, meal_index, meal_time, recipe_id, servings, display_order)
  select src.plan_week_id,
         tgt.d,
         src.meal_index,
         src.meal_time,
         src.recipe_id,
         src.servings,
         src.display_order
  from public.meal_plan_week_slots src
  cross join unnest (p_target_dates) as tgt(d)
  where src.plan_week_id = p_plan_week_id
    and src.date         = p_source_date
    and src.meal_index   = p_meal_index;
end;
$$;

grant execute on function public.copy_week_meal(uuid, date, int, date[]) to authenticated;

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- ROLLBACK:
--   drop function if exists public.copy_week_meal(uuid, date, int, date[]);
