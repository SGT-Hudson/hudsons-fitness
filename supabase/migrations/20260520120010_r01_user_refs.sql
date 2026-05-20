-- R-01 / D-A2, D-A3, D-A4: ★ Library Contribution & Lifecycle Model, Phase 1.
-- Step 2/8 — Per-user reference tables (`user_ingredient_refs`,
-- `user_recipe_refs`).
--
-- STAGED — DO NOT AUTO-APPLY.
--
-- Specced in
-- `docs/superpowers/specs/2026-05-18-library-model-phase1-design.md` §2
-- (two-table choice rationale) + §3 (column split: PII `note` lives ONLY
-- here, never on the pooled table). Sequenced by
-- `docs/superpowers/plans/2026-05-18-library-model-phase1-plan.md` Task 2.
-- Runs after Task 1 (anon seed) and before Task 3 (backfill).
--
-- Two tables, not a single polymorphic `user_library_items`, because:
--   1. Real, type-correct FKs (ingredient_id → ingredients.id, recipe_id →
--      recipes.id) — DB-enforced integrity on a public-repo / RLS-only app.
--   2. Identical trivial RLS policy on both (`auth.uid() = user_id`); a
--      polymorphic table would need that PLUS per-type sub-conditions —
--      strictly more complex.
--   3. The PII firewall: the `note` column physically cannot appear on the
--      pooled table; GDPR erasure for an `(ingredients|recipes)` reference
--      is one `delete from user_*_refs where user_id = …`.
--
-- RLS policies + `enable row level security` for these tables live in the
-- Task 6 RLS-rewrite migration, intentionally — that migration is the
-- single audited home of every RLS change in this sprint.
--
-- Do not run this against any database from CI or from this PR.

create table if not exists public.user_ingredient_refs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id)         on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  note          text,                                  -- PII; lives ONLY here
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, ingredient_id)
);

create table if not exists public.user_recipe_refs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id)     on delete cascade,
  recipe_id  uuid not null references public.recipes(id) on delete cascade,
  note       text,                                       -- PII; lives ONLY here
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, recipe_id)
);

-- Indexes: the `unique(user_id, *_id)` constraints already imply a btree on
-- `(user_id, *_id)`. That covers both "my library" joins (filter on
-- user_id, then lookup the pool id) and "is this item in my library?"
-- exists-checks. No additional index needed per spec §7's `pg_trgm` note.

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- Safe to drop unconditionally — these tables are net-new and Task 3
-- (backfill) is the only writer at apply time; rollback at this point
-- means the backfill never ran, so there is no user data to preserve.
-- After backfill has populated these tables in prod, restoration from the
-- backup snapshot Task 3 creates is the correct path (see Task 3).
--
-- ROLLBACK:
--   drop table if exists public.user_recipe_refs;
--   drop table if exists public.user_ingredient_refs;
