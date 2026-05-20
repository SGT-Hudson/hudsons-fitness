-- R-01 / D-A2, D-A3, D-A4: ★ Library Contribution & Lifecycle Model, Phase 1.
-- Step 4/8 — Drop `recipes.deleted_at` + its dependent partial indexes,
-- and rename `recipes.user_id` → `recipes.created_by_user_id` for parity
-- with `ingredients.created_by_user_id` (spec §13 Q1, user-decided
-- 2026-05-20: rename).
--
-- STAGED — DO NOT AUTO-APPLY.
--
-- Specced in `…/specs/2026-05-18-library-model-phase1-design.md` §3
-- (`recipes` column changes) and §11 (ordering). Sequenced by
-- `…/plans/2026-05-18-library-model-phase1-plan.md` Task 4. Runs AFTER
-- Task 3 (backfill consumed `deleted_at` in its WHERE clauses + snapshot).
--
-- ── Order matters within this file ─────────────────────────────────────────
-- Both pre-existing partial indexes on `recipes` are scoped
-- `WHERE deleted_at IS NULL`, so they MUST be dropped before the column
-- itself goes away — otherwise `DROP COLUMN deleted_at` errors. The two
-- indexes are NOT replaced under the ★ model: the new "my library" query
-- is a join through `user_recipe_refs` (which has its own
-- `unique(user_id, recipe_id)`-implied btree), and recipe names are no
-- longer per-user-unique under the shared pool (D-A4 — tolerated
-- duplicates, structurally resolved by the Phase-2 reaper).
--
-- ── RLS-policy interaction with the column rename ──────────────────────────
-- Postgres tracks policy column references by attribute number, not name,
-- so `ALTER TABLE … RENAME COLUMN user_id TO created_by_user_id`
-- automatically propagates into the existing policies on `recipes` (lines
-- 707-710 of the R-00 baseline) and the dependent policies on
-- `recipe_ingredients` (lines 713-720 — they subquery `recipes.user_id`).
-- No manual policy edit needed here; Task 6 (RLS rewrite) drops and
-- replaces them anyway.
--
-- Do not run this against any database from CI or from this PR.

begin;

-- 1. Drop both partial indexes that depend on `deleted_at`.
drop index if exists public.recipes_user_id_updated_at;
drop index if exists public.recipes_user_id_name_active;

-- 2. Drop the `deleted_at` column itself.
alter table public.recipes
  drop column if exists deleted_at;

-- 3. Rename the owner column so its semantic shift is loud.
-- `if exists` is not part of `RENAME COLUMN` syntax, so guard with a
-- catalog check for re-apply safety.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'recipes'
      and column_name  = 'user_id'
  ) then
    alter table public.recipes
      rename column user_id to created_by_user_id;
  end if;
end $$;

commit;

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- Reverses every step in the inverse order. The `deleted_at` column comes
-- back NULL on every row (the original values are in
-- `_r01_recipes_owner_backup` from Task 3 — restore them via that
-- backup's `update … from` if a full Task-3-and-after rollback is needed).
--
-- ROLLBACK:
--   begin;
--   do $$
--   begin
--     if exists (
--       select 1 from information_schema.columns
--       where table_schema = 'public' and table_name = 'recipes'
--         and column_name = 'created_by_user_id'
--     ) then
--       alter table public.recipes rename column created_by_user_id to user_id;
--     end if;
--   end $$;
--   alter table public.recipes add column if not exists deleted_at timestamptz;
--   -- (Optional) restore deleted_at values from the Task 3 backup:
--   -- update public.recipes r
--   --   set deleted_at = b.deleted_at
--   --   from public._r01_recipes_owner_backup b
--   --  where b.recipe_id = r.id;
--   create index if not exists recipes_user_id_updated_at
--     on public.recipes using btree (user_id, updated_at desc)
--     where (deleted_at is null);
--   create unique index if not exists recipes_user_id_name_active
--     on public.recipes using btree (user_id, name)
--     where (deleted_at is null);
--   commit;
