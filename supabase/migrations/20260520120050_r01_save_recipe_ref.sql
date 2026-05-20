-- R-01 / D-A2, D-A3, D-A4: ★ Library Contribution & Lifecycle Model, Phase 1.
-- Step 6/8 — Extend `save_recipe` to insert the creator's
-- `user_recipe_refs` row on CREATE, and switch its column references over
-- to the post-Task-4 schema (`created_by_user_id` not `user_id`, no
-- `deleted_at`).
--
-- STAGED — DO NOT AUTO-APPLY.
--
-- Specced in `…/specs/2026-05-18-library-model-phase1-design.md` §7 row
-- "Save recipe". Sequenced by
-- `…/plans/2026-05-18-library-model-phase1-plan.md` Task 9.
--
-- Why extend the RPC instead of adding a second client round-trip:
-- `save_recipe` already mutates >1 table (`recipes` + `recipe_ingredients`)
-- in one atomic INVOKER call; adding the creator ref insert keeps the
-- "create recipe + own it" guarantee atomic (project invariant #3 / D-C5).
-- The function STAYS `SECURITY INVOKER` — no DEFINER added (audit
-- checkpoint baselined in plan Task 0; only Task 9b adds the new sanctioned
-- DEFINER).
--
-- ── search_path is intentionally NOT changed ───────────────────────────────
-- The R-00-baselined `save_recipe` uses `set search_path to ''` (stricter
-- than the `= public` invariant pattern — every table is fully
-- qualified, immune to schema-hijacking). Keeping `''` here preserves the
-- existing per-function security stance; the modification is a body edit,
-- not a hardening regression. New R-01 RPCs (hide_owned_*) follow the
-- `= public` invariant pattern; this older function stays on `''` until a
-- dedicated invariant-compliance pass touches every legacy RPC.
--
-- Do not run this against any database from CI or from this PR.

create or replace function public.save_recipe(
  p_recipe_id    uuid,
  p_name         text,
  p_servings     numeric,
  p_description  text,
  p_instructions text,
  p_ingredients  jsonb
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
    -- CREATE: insert the pooled recipe owned by the caller, then ensure
    -- the caller's `user_recipe_refs` row exists (the "I have this in my
    -- library" reference). `on conflict do nothing` makes the ref insert
    -- safe under any future re-entry path.
    insert into public.recipes (created_by_user_id, name, servings, description, instructions)
    values (v_user_id, p_name, p_servings, p_description, p_instructions)
    returning id into v_recipe_id;

    insert into public.user_recipe_refs (user_id, recipe_id)
    values (v_user_id, v_recipe_id)
    on conflict (user_id, recipe_id) do nothing;
  else
    -- EDIT: classic update gated on real ownership (the post-Task-6 RLS
    -- UPDATE policy will already block non-owners; the WHERE clause keeps
    -- the function's error message useful when the row exists but isn't
    -- caller-owned). `deleted_at` is gone post-Task-4; no filter needed.
    update public.recipes
       set name         = p_name,
           servings     = p_servings,
           description  = p_description,
           instructions = p_instructions,
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

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- Restore the R-00-baselined function body verbatim. Note: this rollback
-- only works if Tasks 3/4 have ALSO been rolled back (the baselined body
-- references `user_id` and `deleted_at`); rollback ordering is documented
-- in `docs/operations.md` Wave-3 procedure.
--
-- ROLLBACK:
--   create or replace function public.save_recipe(
--     p_recipe_id uuid, p_name text, p_servings numeric,
--     p_description text, p_instructions text, p_ingredients jsonb
--   )
--   returns uuid
--   language plpgsql
--   set search_path to ''
--   as $$
--   declare
--     v_user_id uuid;
--     v_recipe_id uuid;
--   begin
--     v_user_id := auth.uid();
--     if v_user_id is null then
--       raise exception 'not authenticated';
--     end if;
--     if p_recipe_id is null then
--       insert into public.recipes (user_id, name, servings, description, instructions)
--       values (v_user_id, p_name, p_servings, p_description, p_instructions)
--       returning id into v_recipe_id;
--     else
--       update public.recipes
--         set name = p_name, servings = p_servings,
--             description = p_description, instructions = p_instructions,
--             updated_at = now()
--         where id = p_recipe_id
--           and user_id = v_user_id
--           and deleted_at is null
--         returning id into v_recipe_id;
--       if v_recipe_id is null then
--         raise exception 'recipe not found or not owned by user';
--       end if;
--       delete from public.recipe_ingredients where recipe_id = v_recipe_id;
--     end if;
--     insert into public.recipe_ingredients
--       (recipe_id, ingredient_id, quantity, per_serving, display_order)
--     select v_recipe_id,
--            (item->>'ingredient_id')::uuid,
--            (item->>'quantity')::numeric,
--            coalesce((item->>'per_serving')::boolean, false),
--            coalesce((item->>'display_order')::int, 0)
--     from jsonb_array_elements(p_ingredients) as item;
--     return v_recipe_id;
--   end;
--   $$;
