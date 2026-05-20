-- R-01 / D-A2, D-A3, D-A4: ★ Library Contribution & Lifecycle Model, Phase 1.
-- Step 5/8 — `hide_owned_ingredient(p_id)` + `hide_owned_recipe(p_id)`
-- INVOKER RPCs that atomically (a) drop the caller's reference row and
-- (b) transfer pool ownership to the anon sentinel iff the caller IS the
-- pool owner. The standard "Remove" / "Borrar" affordance in the UI calls
-- these — see spec §6.
--
-- STAGED — DO NOT AUTO-APPLY.
--
-- Specced in `…/specs/2026-05-18-library-model-phase1-design.md` §6.
-- Sequenced by `…/plans/2026-05-18-library-model-phase1-plan.md` Task 5.
-- Runs AFTER Task 4 (column rename `recipes.user_id` →
-- `created_by_user_id` is now in effect; this migration MUST use the new
-- name).
--
-- ── INVOKER rationale (D-C5 + invariant #3) ────────────────────────────────
-- Both functions are `SECURITY INVOKER` with `set search_path = public`.
-- The post-Task-6 RLS policies on `ingredients`/`recipes` permit UPDATE
-- only when `auth.uid() = created_by_user_id AND created_by_user_id IS
-- NOT NULL AND created_by_user_id <> ANON` — which still matches at the
-- moment the UPDATE statement runs (the row is still caller-owned then).
-- After the UPDATE, the row's owner is anon and no further UPDATE policy
-- matches → immutable, never re-owned. No new DEFINER is introduced
-- here — the impl-time audit (plan Task 0) baselined the existing 3
-- exceptions; Task 9 adds the one new sanctioned DEFINER
-- (`private.reconcile_account_delete`), nothing else does.
--
-- ── Unified "Remove" vs. spec §10 / §13 Q2 residual ────────────────────────
-- This RPC always transfers ownership to anon when the caller is the
-- owner. A user who wants to drop their ref WITHOUT anon-transfer can do
-- so via direct DELETE on `user_*_refs` (the table's RLS DELETE policy
-- permits it). That path is what produces the "real-owner, zero-reference"
-- Phase-1 residual called out in spec §10 (and confirmed by §13 Q2's
-- decided default). The standard UI "Remove" button calls THIS RPC, so
-- the residual is reachable only when a client deliberately bypasses the
-- RPC.
--
-- Do not run this against any database from CI or from this PR.

create or replace function public.hide_owned_ingredient(p_ingredient_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- (a) Drop my reference row. Genuine erasure of my private `note` (if
  -- any). Always runs; no-op when I don't actually have a ref for this
  -- ingredient (the unique-constrained DELETE matches zero rows).
  delete from public.user_ingredient_refs
   where user_id        = auth.uid()
     and ingredient_id  = p_ingredient_id;

  -- (b) If I AM the real owner, transfer the pool item to the anon
  -- sentinel. The WHERE clause's `created_by_user_id = auth.uid()` is
  -- both the ownership check AND what makes the UPDATE compatible with
  -- the post-Task-6 RLS policy (the row is still caller-owned at policy-
  -- evaluation time). If I'm NOT the owner, this UPDATE matches zero
  -- rows and the call is purely a "drop my reference" operation.
  update public.ingredients
     set created_by_user_id = '00000000-0000-0000-0000-00000000a0a0',
         updated_at         = now()
   where id                  = p_ingredient_id
     and created_by_user_id  = auth.uid();
end$$;

create or replace function public.hide_owned_recipe(p_recipe_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.user_recipe_refs
   where user_id    = auth.uid()
     and recipe_id  = p_recipe_id;

  update public.recipes
     set created_by_user_id = '00000000-0000-0000-0000-00000000a0a0',
         updated_at         = now()
   where id                  = p_recipe_id
     and created_by_user_id  = auth.uid();
end$$;

-- Grant EXECUTE to the authenticated role (per project convention; matches
-- the existing `save_recipe` / `save_template` grants in R-00 baseline).
grant execute on function public.hide_owned_ingredient(uuid) to authenticated;
grant execute on function public.hide_owned_recipe(uuid)     to authenticated;

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- Drop both functions. Safe at any time: no other DB object depends on
-- them; client code that calls them will fail loudly (40004 / "function
-- does not exist"), which is the correct visible failure mode if rollback
-- is needed mid-deploy.
--
-- ROLLBACK:
--   drop function if exists public.hide_owned_ingredient(uuid);
--   drop function if exists public.hide_owned_recipe(uuid);
