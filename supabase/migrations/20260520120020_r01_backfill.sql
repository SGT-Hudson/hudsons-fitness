-- R-01 / D-A2, D-A3, D-A4: ★ Library Contribution & Lifecycle Model, Phase 1.
-- Step 3/8 — Backfill existing ingredients/recipes into the pool+reference
-- model, idempotently, in one transaction, with a snapshot table for
-- rollback.
--
-- STAGED — DO NOT AUTO-APPLY.
--
-- Specced in `…/specs/2026-05-18-library-model-phase1-design.md` §5.
-- Sequenced by `…/plans/2026-05-18-library-model-phase1-plan.md` Task 3.
-- Runs AFTER Task 1 (anon seed exists) + Task 2 (ref tables exist) and
-- BEFORE Task 4 (`recipes.deleted_at` still exists; `recipes.user_id`
-- not yet renamed to `created_by_user_id`).
--
-- Backfill rules:
--   1. Snapshot `recipes.(id, user_id, deleted_at)` into a private table
--      so the rollback can restore both the owner pointer AND the
--      soft-delete marker exactly.
--   2. Every NON-SEED, NON-ANON ingredient gets a creator ref for its
--      current owner.
--   3. Every LIVE recipe (`deleted_at IS NULL`) gets a creator ref for its
--      current owner.
--   4. Every SOFT-DELETED recipe (`deleted_at IS NOT NULL`) has its owner
--      reassigned to the anon sentinel and receives NO ref — equivalent to
--      a retro creator-hide of the pre-existing soft-delete.
--
-- Idempotency: the ref inserts are `on conflict do nothing` against the
-- unique constraints; the owner-reassign is a self-anchoring UPDATE
-- (subsequent runs are no-ops because `deleted_at` is already gone for
-- the affected rows by then, and the WHERE clause is conditioned on
-- `deleted_at IS NOT NULL`); the snapshot insert is `on conflict do
-- nothing` too. Re-running the whole migration produces no errors and no
-- duplicate rows.
--
-- Do not run this against any database from CI or from this PR.

begin;

-- 1. Snapshot for rollback. Keep ONLY what we are about to mutate so the
-- table is small (recipes count) and rollback is unambiguous.
create table if not exists public._r01_recipes_owner_backup (
  recipe_id   uuid primary key,
  user_id     uuid,
  deleted_at  timestamptz
);

insert into public._r01_recipes_owner_backup (recipe_id, user_id, deleted_at)
select id, user_id, deleted_at
from public.recipes
on conflict (recipe_id) do nothing;

-- 2. Ingredient creator refs. Skip immutable system seeds
-- (`created_by_user_id IS NULL`) and the anon sentinel (won't have a real
-- user to back-ref). OFF/BEDCA-imported ingredients keep whatever
-- `created_by_user_id` they have today — if it is a real user, that user
-- gets the creator ref (matches today's behavior where the ingredient
-- appeared in their list).
insert into public.user_ingredient_refs (user_id, ingredient_id, note)
select i.created_by_user_id, i.id, null
from public.ingredients i
where i.created_by_user_id is not null
  and i.created_by_user_id <> '00000000-0000-0000-0000-00000000a0a0'
on conflict (user_id, ingredient_id) do nothing;

-- 3. Recipe creator refs for live recipes (today these are per-user
-- private with `deleted_at IS NULL`; tomorrow they become pool items the
-- creator references). Soft-deleted recipes get NO ref and are handled in
-- step 4.
insert into public.user_recipe_refs (user_id, recipe_id, note)
select r.user_id, r.id, null
from public.recipes r
where r.deleted_at is null
on conflict (user_id, recipe_id) do nothing;

-- 4. Retro creator-hide of pre-existing soft-deletes: reassign owner to
-- the anon sentinel. These get no creator ref (consistent with "a
-- soft-deleted recipe was already hidden from the user's library").
-- Subsequent runs are no-ops because (a) the rows targeted by this WHERE
-- already have the anon owner, and (b) Task 4 drops `deleted_at`
-- thereafter so the predicate becomes vacuously false on later replays.
update public.recipes
set user_id    = '00000000-0000-0000-0000-00000000a0a0',
    updated_at = now()
where deleted_at is not null
  and user_id <> '00000000-0000-0000-0000-00000000a0a0';

commit;

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- Truncate the two ref tables (they were empty before backfill) and
-- restore the snapshotted `(user_id, deleted_at)` onto every recipe so the
-- soft-delete state and creator pointer are byte-for-byte identical to
-- pre-backfill. The `_r01_recipes_owner_backup` table is left in place
-- intentionally — it documents the rollback boundary.
--
-- ROLLBACK:
--   begin;
--   truncate public.user_ingredient_refs;
--   truncate public.user_recipe_refs;
--   update public.recipes r
--      set user_id    = b.user_id,
--          deleted_at = b.deleted_at,
--          updated_at = now()
--     from public._r01_recipes_owner_backup b
--    where b.recipe_id = r.id;
--   commit;
