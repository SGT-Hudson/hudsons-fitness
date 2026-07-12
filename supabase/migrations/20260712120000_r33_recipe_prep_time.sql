-- R-33 wave 5 — a recipe records how long it takes to prepare.
-- Spec: docs/superpowers/specs/2026-07-12-r33-wave5-recetas.md §3
--
-- Nullable by design: every pre-existing recipe predates the column and there
-- is nothing truthful to backfill; "no time recorded" stays a legitimate
-- permanent state (the UI omits the stat entirely rather than rendering 0 or a
-- guess). Integer MINUTES — the form displays minutes and stores minutes, so
-- there is no unit conversion anywhere (invariant 6). The check constraint is
-- the sole gate on the value: a bad prep time is rejected by the DB, not by app
-- code. RLS on public.recipes is unchanged and remains the sole security
-- boundary.

alter table public.recipes
  add column if not exists prep_time_minutes integer
    check (prep_time_minutes is null or prep_time_minutes > 0);

-- ----------------------------------------------------------------------------
-- save_recipe — gains a trailing p_prep_time_minutes, written UNCONDITIONALLY
-- on both insert and update, so passing null clears the field (the user
-- emptying the input means "no time"). The editor therefore always sends the
-- current value and never omits it.
--
-- DROP then CREATE, not CREATE OR REPLACE: a trailing defaulted parameter
-- changes the signature, so `create or replace` would register an OVERLOAD,
-- leave the old 7-arg body callable and make PostgREST's function resolution
-- ambiguous. The old signature is dropped explicitly. Everything else below is
-- the U-2 body (20260526120000), unchanged: SECURITY INVOKER, pinned empty
-- search_path, fully-qualified tables, creator ref insert on CREATE,
-- replace-children.
-- ----------------------------------------------------------------------------
drop function if exists public.save_recipe(uuid, text, numeric, text, text, jsonb, text[]);

create or replace function public.save_recipe(
  p_recipe_id         uuid,
  p_name              text,
  p_servings          numeric,
  p_description       text,
  p_instructions      text,
  p_ingredients       jsonb,
  p_meal_types        text[] default '{}'::text[],
  p_prep_time_minutes integer default null
)
returns uuid
language plpgsql
security invoker
set search_path to ''
as $$
declare
  v_user_id   uuid;
  v_recipe_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if p_recipe_id is null then
    insert into public.recipes
      (created_by_user_id, name, servings, description, instructions, meal_types,
       prep_time_minutes)
    values
      (v_user_id, p_name, p_servings, p_description, p_instructions,
       coalesce(p_meal_types, '{}'::text[]), p_prep_time_minutes)
    returning id into v_recipe_id;

    insert into public.user_recipe_refs (user_id, recipe_id)
    values (v_user_id, v_recipe_id)
    on conflict (user_id, recipe_id) do nothing;
  else
    update public.recipes
       set name              = p_name,
           servings          = p_servings,
           description       = p_description,
           instructions      = p_instructions,
           meal_types        = coalesce(p_meal_types, '{}'::text[]),
           prep_time_minutes = p_prep_time_minutes,
           updated_at        = now()
     where id                  = p_recipe_id
       and created_by_user_id  = v_user_id
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

grant execute on function
  public.save_recipe(uuid, text, numeric, text, text, jsonb, text[], integer)
  to authenticated;

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- ROLLBACK:
--   drop function if exists public.save_recipe(uuid, text, numeric, text, text, jsonb, text[], integer);
--   alter table public.recipes drop column if exists prep_time_minutes;
--   -- then re-create the 7-arg body from
--   -- 20260526120000_u2_recipe_meal_types.sql.
