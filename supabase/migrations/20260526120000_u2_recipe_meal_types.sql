-- U-2 recipe meal-type tags. Flat 5-tag vocabulary on the recipe pool item.
-- Spec: docs/superpowers/specs/2026-05-23-recipe-meal-types-design.md

-- 1. Column: optional, multi-valued, subset-checked array on the pool item.
alter table public.recipes
  add column if not exists meal_types text[] not null default '{}'::text[]
    check (meal_types <@ array['breakfast','lunch','snack','dinner','dessert']::text[]);

-- GIN index for U-3's "recipes tagged X" filter.
create index if not exists idx_recipes_meal_types on public.recipes using gin (meal_types);

-- 2. save_recipe: add p_meal_types. Adding a param changes the signature, so we
--    DROP the old 6-arg overload first (avoids PostgREST ambiguity), then
--    recreate with the new trailing arg. Body otherwise unchanged from
--    20260520120050 (SECURITY INVOKER, search_path '', fully-qualified tables,
--    creator ref insert on CREATE, replace-children).
drop function if exists public.save_recipe(uuid, text, numeric, text, text, jsonb);

create or replace function public.save_recipe(
  p_recipe_id    uuid,
  p_name         text,
  p_servings     numeric,
  p_description  text,
  p_instructions text,
  p_ingredients  jsonb,
  p_meal_types   text[] default '{}'::text[]
)
returns uuid
language plpgsql
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
      (created_by_user_id, name, servings, description, instructions, meal_types)
    values
      (v_user_id, p_name, p_servings, p_description, p_instructions,
       coalesce(p_meal_types, '{}'::text[]))
    returning id into v_recipe_id;

    insert into public.user_recipe_refs (user_id, recipe_id)
    values (v_user_id, v_recipe_id)
    on conflict (user_id, recipe_id) do nothing;
  else
    update public.recipes
       set name         = p_name,
           servings     = p_servings,
           description  = p_description,
           instructions = p_instructions,
           meal_types   = coalesce(p_meal_types, '{}'::text[]),
           updated_at   = now()
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
