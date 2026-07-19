-- R-36 — save_recipe writes structured steps instead of free text.
--
-- DROP then CREATE, not CREATE OR REPLACE: the parameter list changes, so
-- `create or replace` would register an OVERLOAD and PostgREST would refuse
-- the call as ambiguous. The old signature is dropped explicitly. Everything
-- else below is the R-33 wave 5 body (20260712120000), unchanged: SECURITY
-- INVOKER, pinned empty search_path, fully-qualified tables, creator ref
-- insert on CREATE, ownership check + replace-children on UPDATE.
--
-- recipes.instructions goes with it: R-36 starts recipe_steps empty for
-- everyone (the app has no production users yet, so there is nothing to
-- preserve) and leaves no dead column behind.

drop function if exists public.save_recipe(uuid, text, numeric, text, text, jsonb, text[], integer);

alter table public.recipes drop column if exists instructions;

create or replace function public.save_recipe(
  p_recipe_id         uuid,
  p_name              text,
  p_servings          numeric,
  p_description       text,
  p_ingredients       jsonb,
  p_steps             jsonb default '[]'::jsonb,
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
      (created_by_user_id, name, servings, description, meal_types,
       prep_time_minutes)
    values
      (v_user_id, p_name, p_servings, p_description,
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
    delete from public.recipe_steps       where recipe_id = v_recipe_id;
  end if;

  insert into public.recipe_ingredients
    (recipe_id, ingredient_id, quantity, per_serving, display_order)
  select v_recipe_id,
         (item->>'ingredient_id')::uuid,
         (item->>'quantity')::numeric,
         coalesce((item->>'per_serving')::boolean, false),
         coalesce((item->>'display_order')::int, 0)
  from jsonb_array_elements(p_ingredients) as item;

  insert into public.recipe_steps (recipe_id, display_order, text)
  select v_recipe_id,
         coalesce((item->>'display_order')::int, 0),
         item->>'text'
  from jsonb_array_elements(p_steps) as item
  where coalesce(btrim(item->>'text'), '') <> '';

  return v_recipe_id;
end;
$$;

grant execute on function
  public.save_recipe(uuid, text, numeric, text, jsonb, jsonb, text[], integer)
  to authenticated;

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- ROLLBACK:
--   drop function if exists public.save_recipe(uuid, text, numeric, text, jsonb, jsonb, text[], integer);
--   alter table public.recipes add column if not exists instructions text;
--   -- then re-create the 8-arg body from
--   -- 20260712120000_r33_recipe_prep_time.sql.
