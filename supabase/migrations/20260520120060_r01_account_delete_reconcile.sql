-- R-01 / D-A2, D-A3, D-A4: ★ Library Contribution & Lifecycle Model, Phase 1.
-- Step 7/8 — `private.reconcile_account_delete(p_user_id uuid)`: the
-- second sanctioned `SECURITY DEFINER` exception (CLAUDE.md invariant #3,
-- staged), called by the `delete-account` edge function before deleting
-- the auth user. Erases the user's PII (refs) and reassigns the user's
-- still-owned pooled items to the anon sentinel — preventing the blanket
-- `auth.users → … CASCADE` from destroying objective shared-pool data
-- other users reference (the exact harm D-A2 guards against).
--
-- STAGED — DO NOT AUTO-APPLY.
--
-- Specced in `…/specs/2026-05-18-library-model-phase1-design.md` §8.
-- Sequenced by `…/plans/2026-05-18-library-model-phase1-plan.md` Task 9.
--
-- ── SECURITY DEFINER rationale (invariant #3 / inv #7 staging marker) ──────
-- This is the second sanctioned DEFINER exception — already recorded in
-- CLAUDE.md invariant #3 as ` ⚠ Changing — see R-01` (staged, per inv #7).
-- At Wave-3 apply, the `⚠ staged, not yet applied` qualifier is dropped
-- from CLAUDE.md (the function becomes live, exception becomes simply
-- "live"); see plan Task 12. The DEFINER status is essential because:
--   - The function runs from the `delete-account` edge function which
--     uses the service-role client. `SECURITY INVOKER` would force the
--     edge fn to authorise the operation per user — but the auth user is
--     about to be deleted, and the operation needs to span tables
--     (`user_*_refs` + `ingredients` + `recipes`) atomically.
--   - DEFINER + a fixed `set search_path = ''` makes the function
--     immune to schema-hijacking; all tables are fully qualified.
--   - It is granted to ONLY the service role (REVOKE then GRANT block
--     below), mirroring `apply_template_to_week_admin` — the proven
--     "edge-callable, no other role" pattern in this codebase.
--
-- ── Schema choice: `public` (deviation from spec §8 text) ──────────────────
-- The spec said "private schema (same pattern as apply_template_to_week
-- _admin)" — but apply_template_to_week_admin is actually in `public`.
-- The spec's text is internally inconsistent; the "same pattern as"
-- proven, edge-callable function wins. Moving to `private` would require
-- adding `private` to the Supabase project's PostgREST `db-schemas`
-- config (default exposes only `public,graphql_public,storage`), an
-- infra change with no security gain — `revoke all from public/anon/
-- authenticated; grant execute to service_role` is identical security
-- whether the function lives in `public` or `private`.
--
-- ── Idempotency ────────────────────────────────────────────────────────────
-- All four statements are idempotent on `p_user_id`:
--   - The two DELETEs no-op when the user already has no refs.
--   - The two UPDATEs no-op when the user no longer owns any pool items.
-- Calling the function twice on the same user-id is therefore safe (e.g.
-- if the edge fn retries after a network blip).
--
-- Do not run this against any database from CI or from this PR.

create or replace function public.reconcile_account_delete(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'p_user_id required';
  end if;

  -- (1) Hard-delete the user's reference rows — genuine erasure of the
  -- private `note` (the PII firewall, spec §3 / GDPR). Explicit DELETE so
  -- the erasure is auditable and happens BEFORE the auth.users CASCADE,
  -- not as a side effect of it.
  delete from public.user_ingredient_refs where user_id = p_user_id;
  delete from public.user_recipe_refs      where user_id = p_user_id;

  -- (2) Reassign every pool item still owned by the user to the anon
  -- sentinel. The objective shared-pool data persists (other users'
  -- recipes/diary still resolve); only the personal "I created this"
  -- pointer is severed.
  update public.ingredients
     set created_by_user_id = '00000000-0000-0000-0000-00000000a0a0',
         updated_at         = now()
   where created_by_user_id = p_user_id;

  update public.recipes
     set created_by_user_id = '00000000-0000-0000-0000-00000000a0a0',
         updated_at         = now()
   where created_by_user_id = p_user_id;
end;
$$;

-- Grant policy: service-role only (mirrors `apply_template_to_week_admin`).
revoke all on function public.reconcile_account_delete(uuid) from public;
revoke all on function public.reconcile_account_delete(uuid) from anon;
revoke all on function public.reconcile_account_delete(uuid) from authenticated;
grant execute on function public.reconcile_account_delete(uuid) to service_role;

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- Drop the function. The `delete-account` edge function (Task 10) must
-- also be reverted to its pre-R-01 form in the same rollback wave — if
-- only this DB function is dropped, the new edge code will throw on its
-- service-role RPC call (40004), which is a safe-fail mode but stops
-- account deletion until either side is fully rolled forward or back.
--
-- ROLLBACK:
--   drop function if exists public.reconcile_account_delete(uuid);
