-- R-01 / D-A2, D-A3, D-A4: ★ Library Contribution & Lifecycle Model, Phase 1.
-- Step 8/8 — RLS rewrite. The LAST DDL of the R-01 set.
--
-- STAGED — DO NOT AUTO-APPLY.
--
-- Specced in `…/specs/2026-05-18-library-model-phase1-design.md` §6.
-- Sequenced by `…/plans/2026-05-18-library-model-phase1-plan.md` Task 6.
-- Runs LAST among DDL — after Tasks 1–5 + 9 — so by this point the
-- column rename, the ref tables, and the new RPCs already exist and the
-- new policies reference the final shape directly.
--
-- ── Pool tables (`ingredients`, `recipes`) ─────────────────────────────────
-- The model:
--   SELECT     open to authenticated (pool is shared & discoverable)
--   INSERT     self-tagged (`created_by_user_id = auth.uid()`)
--   UPDATE     owner only, REAL owner only
--              (`auth.uid() = created_by_user_id
--                 AND created_by_user_id IS NOT NULL          -- not a seed
--                 AND created_by_user_id <> LIBRARY_ANON_OWNER_ID  -- not anonymized`)
--   DELETE     same predicate as UPDATE
--
-- Consequences (spec §6):
--   - `created_by_user_id IS NULL` (system seed): no UPDATE/DELETE policy
--     ever matches → immutable, unchanged from today.
--   - `created_by_user_id = ANON` (creator-hidden): no UPDATE/DELETE policy
--     matches → immutable, never re-owned (enforces "no adoption").
--   - A real owner can still edit/delete their own pooled row.
--   - "Creator-hide" is an UPDATE to anon owner via the `hide_owned_*`
--     RPC (Task 5); RLS-evaluates at the moment the row is STILL caller-
--     owned, so the UPDATE passes; afterward the row matches no policy
--     and is immutable.
--
-- ── Joined child tables (`recipe_ingredients`) ─────────────────────────────
-- Today's policies gate recipe_ingredients via `exists (… recipes r where
-- r.user_id = auth.uid())` — i.e. you only see ingredients of recipes
-- you own. Under the new pool model recipes are openly readable, so:
--   SELECT     open to authenticated (you can read any recipe's ingredients
--              because you can read any recipe; this is essential for diary
--              renders against anon-owned recipes — the never-orphan win)
--   INSERT/UPDATE/DELETE  remain owner-gated via subquery
--                          (`exists r where r.created_by_user_id = auth.uid()`)
--
-- ── Reference tables (`user_ingredient_refs`, `user_recipe_refs`) ──────────
-- Trivial owner policy for all four ops: `auth.uid() = user_id`. INSERT
-- additionally relies on `unique(user_id, *_id)` so "add to my library"
-- can be `insert … on conflict do nothing`. No user can see or touch
-- another user's refs or private `note` — the PII firewall is enforced
-- here.
--
-- Do not run this against any database from CI or from this PR.

begin;

-- ── 1. Drop obsolete policies on the pool tables ───────────────────────────

drop policy if exists "All users read ingredients"        on public.ingredients;
drop policy if exists "Users insert ingredients"          on public.ingredients;
drop policy if exists "Creator updates own ingredients"   on public.ingredients;
drop policy if exists "Creator deletes own ingredients"   on public.ingredients;

drop policy if exists "Users see own recipes"             on public.recipes;
drop policy if exists "Users insert own recipes"          on public.recipes;
drop policy if exists "Users update own recipes"          on public.recipes;
drop policy if exists "Users delete own recipes"          on public.recipes;

drop policy if exists "Users see own recipe ingredients"   on public.recipe_ingredients;
drop policy if exists "Users insert own recipe ingredients" on public.recipe_ingredients;
drop policy if exists "Users update own recipe ingredients" on public.recipe_ingredients;
drop policy if exists "Users delete own recipe ingredients" on public.recipe_ingredients;

-- ── 2. Pool policies: ingredients ──────────────────────────────────────────

create policy "Ingredients pool readable"
  on public.ingredients for select
  to authenticated
  using (true);

create policy "Self-tagged insert into ingredients pool"
  on public.ingredients for insert
  to authenticated
  with check (auth.uid() = created_by_user_id);

create policy "Real owner updates own ingredient"
  on public.ingredients for update
  to authenticated
  using (
    auth.uid() = created_by_user_id
    and created_by_user_id is not null
    and created_by_user_id <> '00000000-0000-0000-0000-00000000a0a0'
  )
  with check (
    auth.uid() = created_by_user_id
    and created_by_user_id is not null
    and created_by_user_id <> '00000000-0000-0000-0000-00000000a0a0'
  );

create policy "Real owner deletes own ingredient"
  on public.ingredients for delete
  to authenticated
  using (
    auth.uid() = created_by_user_id
    and created_by_user_id is not null
    and created_by_user_id <> '00000000-0000-0000-0000-00000000a0a0'
  );

-- ── 3. Pool policies: recipes ──────────────────────────────────────────────

create policy "Recipes pool readable"
  on public.recipes for select
  to authenticated
  using (true);

create policy "Self-tagged insert into recipes pool"
  on public.recipes for insert
  to authenticated
  with check (auth.uid() = created_by_user_id);

create policy "Real owner updates own recipe"
  on public.recipes for update
  to authenticated
  using (
    auth.uid() = created_by_user_id
    and created_by_user_id is not null
    and created_by_user_id <> '00000000-0000-0000-0000-00000000a0a0'
  )
  with check (
    auth.uid() = created_by_user_id
    and created_by_user_id is not null
    and created_by_user_id <> '00000000-0000-0000-0000-00000000a0a0'
  );

create policy "Real owner deletes own recipe"
  on public.recipes for delete
  to authenticated
  using (
    auth.uid() = created_by_user_id
    and created_by_user_id is not null
    and created_by_user_id <> '00000000-0000-0000-0000-00000000a0a0'
  );

-- ── 4. Joined-child policies: recipe_ingredients ──────────────────────────
-- SELECT opens to match the pool's readability; mutation stays owner-gated
-- (real-owner, the new owner-pointer predicate).

create policy "Recipe ingredients pool readable"
  on public.recipe_ingredients for select
  to authenticated
  using (true);

create policy "Real owner inserts own recipe ingredients"
  on public.recipe_ingredients for insert
  to authenticated
  with check (
    exists (
      select 1 from public.recipes r
       where r.id                  = recipe_ingredients.recipe_id
         and r.created_by_user_id  = auth.uid()
         and r.created_by_user_id  is not null
         and r.created_by_user_id  <> '00000000-0000-0000-0000-00000000a0a0'
    )
  );

create policy "Real owner updates own recipe ingredients"
  on public.recipe_ingredients for update
  to authenticated
  using (
    exists (
      select 1 from public.recipes r
       where r.id                  = recipe_ingredients.recipe_id
         and r.created_by_user_id  = auth.uid()
         and r.created_by_user_id  is not null
         and r.created_by_user_id  <> '00000000-0000-0000-0000-00000000a0a0'
    )
  );

create policy "Real owner deletes own recipe ingredients"
  on public.recipe_ingredients for delete
  to authenticated
  using (
    exists (
      select 1 from public.recipes r
       where r.id                  = recipe_ingredients.recipe_id
         and r.created_by_user_id  = auth.uid()
         and r.created_by_user_id  is not null
         and r.created_by_user_id  <> '00000000-0000-0000-0000-00000000a0a0'
    )
  );

-- ── 5. Reference-table RLS + policies ──────────────────────────────────────

alter table public.user_ingredient_refs enable row level security;
alter table public.user_recipe_refs     enable row level security;

create policy "User sees own ingredient refs"
  on public.user_ingredient_refs for select
  to authenticated
  using (auth.uid() = user_id);

create policy "User inserts own ingredient refs"
  on public.user_ingredient_refs for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "User updates own ingredient refs"
  on public.user_ingredient_refs for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "User deletes own ingredient refs"
  on public.user_ingredient_refs for delete
  to authenticated
  using (auth.uid() = user_id);

create policy "User sees own recipe refs"
  on public.user_recipe_refs for select
  to authenticated
  using (auth.uid() = user_id);

create policy "User inserts own recipe refs"
  on public.user_recipe_refs for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "User updates own recipe refs"
  on public.user_recipe_refs for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "User deletes own recipe refs"
  on public.user_recipe_refs for delete
  to authenticated
  using (auth.uid() = user_id);

commit;

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- Restore the R-00-baselined policies on ingredients / recipes /
-- recipe_ingredients (verbatim from the baseline file) and drop the
-- ref-table policies + RLS-enable. ASSUMES Task 4's column rename is also
-- being rolled back — the baselined policy text references `user_id`, not
-- `created_by_user_id` — so the rollback must run in the correct order:
-- (6 ← 5/9 ← 4 ← 3 ← 2 ← 1). Document the full sequence in
-- `docs/operations.md` Wave-3 procedure.
--
-- ROLLBACK:
--   begin;
--   -- Drop new policies
--   drop policy if exists "Ingredients pool readable"                 on public.ingredients;
--   drop policy if exists "Self-tagged insert into ingredients pool"  on public.ingredients;
--   drop policy if exists "Real owner updates own ingredient"         on public.ingredients;
--   drop policy if exists "Real owner deletes own ingredient"         on public.ingredients;
--   drop policy if exists "Recipes pool readable"                     on public.recipes;
--   drop policy if exists "Self-tagged insert into recipes pool"      on public.recipes;
--   drop policy if exists "Real owner updates own recipe"             on public.recipes;
--   drop policy if exists "Real owner deletes own recipe"             on public.recipes;
--   drop policy if exists "Recipe ingredients pool readable"          on public.recipe_ingredients;
--   drop policy if exists "Real owner inserts own recipe ingredients" on public.recipe_ingredients;
--   drop policy if exists "Real owner updates own recipe ingredients" on public.recipe_ingredients;
--   drop policy if exists "Real owner deletes own recipe ingredients" on public.recipe_ingredients;
--   -- Drop ref-table policies + disable RLS
--   drop policy if exists "User sees own ingredient refs"    on public.user_ingredient_refs;
--   drop policy if exists "User inserts own ingredient refs" on public.user_ingredient_refs;
--   drop policy if exists "User updates own ingredient refs" on public.user_ingredient_refs;
--   drop policy if exists "User deletes own ingredient refs" on public.user_ingredient_refs;
--   drop policy if exists "User sees own recipe refs"        on public.user_recipe_refs;
--   drop policy if exists "User inserts own recipe refs"     on public.user_recipe_refs;
--   drop policy if exists "User updates own recipe refs"     on public.user_recipe_refs;
--   drop policy if exists "User deletes own recipe refs"     on public.user_recipe_refs;
--   alter table public.user_ingredient_refs disable row level security;
--   alter table public.user_recipe_refs     disable row level security;
--   -- Restore baselined policies (assumes Task 4 column rename also rolled back)
--   create policy "All users read ingredients"
--     on public.ingredients for select to authenticated using (true);
--   create policy "Users insert ingredients"
--     on public.ingredients for insert to authenticated
--     with check (auth.uid() = created_by_user_id);
--   create policy "Creator updates own ingredients"
--     on public.ingredients for update to authenticated
--     using (auth.uid() = created_by_user_id)
--     with check (auth.uid() = created_by_user_id);
--   create policy "Creator deletes own ingredients"
--     on public.ingredients for delete to authenticated
--     using (auth.uid() = created_by_user_id);
--   create policy "Users see own recipes"    on public.recipes for select using (auth.uid() = user_id);
--   create policy "Users insert own recipes" on public.recipes for insert with check (auth.uid() = user_id);
--   create policy "Users update own recipes" on public.recipes for update using (auth.uid() = user_id);
--   create policy "Users delete own recipes" on public.recipes for delete using (auth.uid() = user_id);
--   create policy "Users see own recipe ingredients" on public.recipe_ingredients for select
--     using (exists (select 1 from public.recipes r where r.id = recipe_ingredients.recipe_id and r.user_id = auth.uid()));
--   create policy "Users insert own recipe ingredients" on public.recipe_ingredients for insert
--     with check (exists (select 1 from public.recipes r where r.id = recipe_ingredients.recipe_id and r.user_id = auth.uid()));
--   create policy "Users update own recipe ingredients" on public.recipe_ingredients for update
--     using (exists (select 1 from public.recipes r where r.id = recipe_ingredients.recipe_id and r.user_id = auth.uid()));
--   create policy "Users delete own recipe ingredients" on public.recipe_ingredients for delete
--     using (exists (select 1 from public.recipes r where r.id = recipe_ingredients.recipe_id and r.user_id = auth.uid()));
--   commit;
