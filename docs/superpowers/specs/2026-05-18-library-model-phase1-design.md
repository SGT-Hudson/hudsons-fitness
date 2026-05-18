# Library Contribution & Lifecycle Model — Phase 1 design spec (R-01 / D-A2, D-A3, D-A4)

**Status:** spec + plan — DESIGN ONLY. No product code, no applied migration.
SQL below is illustrative *design — staged, not applied*. Implementation is a
later sprint, blocked by R-00 (schema baseline into migrations), and applied
only at a Wave-3 prod checkpoint with explicit user sign-off.
**Decision of record:** `docs/decisions.md` D-A2, D-A3, D-A4 and the decided
★ model in `docs/data-model.md#library-model` (authoritative — the *model* is
already decided there; this spec only pins the *concrete, implementable
Phase-1 realization* and resolves the open follow-ups the rulings deferred to
design time). This spec does not re-open D-A2/D-A3/D-A4.
**Companion plan:** `docs/superpowers/plans/2026-05-18-library-model-phase1-plan.md`.

## Contents

- 1. What the ★ model already decided (not re-litigated here)
- 2. Reference-table shape decision
- 3. Pool vs reference column split
- 4. Reserved anon owner id
- 5. Backfill design
- 6. RLS rewrite
- 7. Read-path rewrite scope
- 8. `delete-account` rework
- 9. `recipe_ingredients ON DELETE RESTRICT` confirmation
- 10. Risks & edge cases
- 11. Interaction with other staged migrations (ordering)
- 12. Phase 2 explicitly out of scope
- 13. Open questions for the user (checkpoint)

---

## 1. What the ★ model already decided (not re-litigated here)

From `docs/data-model.md#library-model` and D-A2/D-A3/D-A4:

- **Pool + reference.** `ingredients` and `recipes` are shared-pool entities
  from creation. Creating one inserts a pool item **and** a per-user
  *reference* row for the creator. "My library" = my reference rows.
- **Private notes on the reference only** — the structural PII firewall.
- **No user hard-delete.** "Delete" = hide = drop your reference row.
- **Creator-hide transfers pool ownership to a reserved anon user id** — a
  fixed seeded row, **never `null`** (for `ingredients`,
  `created_by_user_id = null` already means "immutable system seed").
- **Name is public from creation** (UX/labeling only).
- **No adoption / claim / fork.** Anon-owned items are never re-owned.
- **Auto-GC is Phase 2**, gated on a non-existent ratings/voting feature —
  OUT OF SCOPE here (see §12).
- **GDPR account-delete reconciliation** replaces blanket CASCADE for
  `ingredients`/`recipes` in `delete-account`.
- **`recipe_ingredients ON DELETE RESTRICT` is kept as the DB backstop.**

Everything below is the implementable realization, with each open follow-up
decided and justified.

---

## 2. Reference-table shape decision

**Decision: two tables — `user_ingredient_refs` and `user_recipe_refs` — NOT
a single polymorphic `user_library_items`.**

```sql
-- design — staged, not applied
create table public.user_ingredient_refs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  note          text,                       -- PII; lives ONLY here
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, ingredient_id)
);

create table public.user_recipe_refs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  recipe_id  uuid not null references public.recipes(id) on delete cascade,
  note       text,                          -- PII; lives ONLY here
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, recipe_id)
);
```

**Why two tables, not one polymorphic table:**

1. **FK integrity.** Two tables get real, type-correct foreign keys
   (`ingredient_id → ingredients.id`, `recipe_id → recipes.id`) the database
   enforces. A polymorphic `(item_type, item_id)` table cannot have a single
   FK; integrity would devolve to triggers/CHECK or be unenforced — a
   regression on a public-repo app where the DB is the sole boundary.
2. **RLS simplicity.** Both tables share an identical, trivial policy
   (`auth.uid() = user_id`). One table buys nothing here; a polymorphic table
   would need the same policy *plus* per-type sub-conditions for any
   type-specific behavior, which is strictly more complex, not less.
3. **Query patterns.** "My ingredient library" and "my recipe library" are
   already separate features (`features/ingredients` vs `features/recipes`)
   with separate list/search queries. Each joins exactly one ref table; a
   polymorphic table would force a redundant `where item_type = …` on every
   query and prevent a clean composite FK index.
4. **The PII-notes column.** A per-type `note` column on a typed table is the
   cleanest PII firewall: the column physically cannot appear on the pooled
   table, and erasure is one `delete from user_ingredient_refs where
   user_id = …`. No polymorphic indirection to reason about for GDPR.
5. **Cost of the choice.** The only downside of two tables is mild DDL/policy
   duplication (two near-identical `create table` + 4 policies each). That is
   a one-time ~40-line migration cost, paid once, versus a permanent
   query/integrity tax on every read. Two tables wins decisively.

`on delete cascade` on both FKs of each ref row means: deleting a user
(`auth.users`) drops their refs (handled explicitly + safely by the reworked
`delete-account`, §8); deleting a pooled item drops dangling refs (only
reachable in Phase 2's reaper, which independently guarantees zero refs
first). It never silently deletes a *live* pooled item.

---

## 3. Pool vs reference column split

**Principle:** the pooled row holds *objective, shareable* data; the
reference row holds *who-has-it-in-their-library* + *that user's private
note*. Personal data physically cannot enter the pool.

### `ingredients` (pooled) — columns unchanged

Keep every existing column on `ingredients`:
`id, name, brand, unit_type, kcal_per_unit, protein_g_per_unit,
carbs_g_per_unit, fat_g_per_unit, fiber_g_per_unit, fiber_g_per_unit,
is_verified, source, external_id, created_by_user_id, created_at,
updated_at`. All are objective nutrition facts or provenance — correctly
shared. `created_by_user_id` is **repurposed as the pool-owner pointer**
(see §4): `null` = system seed (immutable, unchanged meaning); a real user
id = that user owns/can edit it; the reserved anon id = creator-hidden,
immutable. No columns move off `ingredients`.

### `recipes` (pooled) — drop `deleted_at`, repurpose ownership

- `recipes.user_id` is **renamed `created_by_user_id`** (or kept as
  `user_id` but redefined as the pool-owner pointer — naming decided at impl
  time; spec recommends renaming to `created_by_user_id` for parity with
  `ingredients` and to make the semantic change loud). It becomes the same
  three-valued owner pointer as `ingredients.created_by_user_id`.
- `recipes.deleted_at` is **dropped** along with the partial unique index
  `where deleted_at is null`. Soft-delete is replaced by "drop your
  reference." (D-A3.) The partial unique index that enforced per-user unique
  recipe names among non-deleted recipes is **not recreated** — under the
  shared-pool model recipe names are not unique per user (the pool is
  crowdsourced; duplicates are tolerated exactly like ingredients, D-A4, and
  resolved by the Phase-2 reaper).
- All other `recipes` columns stay (`name, description, instructions,
  photo_url, servings, created_at, updated_at`) — objective recipe content,
  correctly shared.

### Reference rows — what lives there

Only: `user_id`, the FK to the pooled item, the **private `note`**, and
ref timestamps. The `note` is the *only* new user-content surface and it is
PII-isolated by construction.

### Query shape changes (conceptual; not rewritten here)

- **"My ingredient/recipe library"** changes from `select … from ingredients`
  / `from recipes where user_id = me and deleted_at is null` to
  `select i.* from ingredients i join user_ingredient_refs r on
  r.ingredient_id = i.id where r.user_id = auth.uid()` (and the recipe
  analogue). The user's private `note` is selected from the ref.
- **"Search the pool"** stays `select … from ingredients/recipes` with the
  existing `pg_trgm`/`ilike` predicates — but now legitimately returns items
  *not* in my library (discovery). Adding a found item = `insert into
  user_*_refs (user_id, *_id) values (auth.uid(), :id)
  on conflict do nothing`.
- **`recipe_ingredients` joins are unchanged** — they reference pooled
  `ingredients.id` directly and never went through refs.

---

## 4. Reserved anon owner id

**Decision: a fixed, seeded real `auth.users` row with a hard-coded
sentinel UUID constant, distinct from `null` and from every real user.**

- Sentinel constant:
  `LIBRARY_ANON_OWNER_ID = '00000000-0000-0000-0000-00000000a0a0'`
  (any fixed UUID that is provably not auto-generated; documented as a named
  constant in code and in `docs/data-model.md`). It must **not** be the
  nil UUID `000…000` (too easy to collide with "unset"); the chosen value is
  visibly a sentinel.
- **Why a real `auth.users` row and not just a bare uuid constant on a
  nullable column:** `ingredients.created_by_user_id` and
  `recipes.created_by_user_id` carry / will carry a real FK to
  `auth.users(id)`. A bare constant that is not a real auth row would either
  break that FK or force dropping it (losing referential integrity on the
  owner pointer — unacceptable on a public-repo, RLS-only app). Seeding a
  real row keeps the FK intact and lets RLS reference the constant safely.
- **Distinctness invariant (the crux of D-A model item 4):**
  - `created_by_user_id IS NULL` → **system seed**, immutable (unchanged
    meaning).
  - `created_by_user_id = LIBRARY_ANON_OWNER_ID` → **creator-hidden /
    anonymized**, immutable, never re-owned (no adoption — model item 6).
  - `created_by_user_id = <any other auth.users id>` → owned by that real
    user; only they may UPDATE/DELETE.
  These three are mutually exclusive and the anon id is provably neither
  `null` nor any real user (it has no email/identity, never authenticates).

### Seeding migration (design — staged, not applied)

```sql
-- design — staged, not applied. Idempotent.
-- Insert a non-authenticatable sentinel auth user. No email, no identity
-- row, no password — it can never log in; it exists solely as an FK target
-- and an RLS sentinel.
insert into auth.users (id, instance_id, aud, role, created_at, updated_at)
values (
  '00000000-0000-0000-0000-00000000a0a0',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', now(), now()
)
on conflict (id) do nothing;

-- Matching profile row so any profile-join read path stays total
-- (display_name documents the role for any accidental UI surfacing).
insert into public.profiles (id, display_name, language, start_date)
values ('00000000-0000-0000-0000-00000000a0a0',
        'Biblioteca compartida', 'es', current_date)
on conflict (id) do nothing;
```

Notes / risks for impl time:
- Inserting directly into `auth.users` is supported in a migration run by
  the Supabase service role, but the exact required NOT-NULL columns vary by
  Supabase/GoTrue version. **Impl-time task:** verify the live `auth.users`
  required columns against R-00's schema baseline before finalizing this
  insert; the migration must be idempotent (`on conflict (id) do nothing`)
  and provide every NOT-NULL column for the live schema version.
- Alternative considered and rejected: a `public`-schema sentinel table
  instead of an `auth.users` row. Rejected because the owner pointer's FK
  target is `auth.users`; a non-`auth` sentinel reintroduces the
  broken-FK / drop-FK problem above.
- The profiles insert depends on `profiles` NOT-NULL columns at impl time
  (R-00 baseline confirms them; today: `id`, `start_date`, `language` have
  defaults/NOT-NULL — verify, do not assume).

---

## 5. Backfill design

Goal: convert every existing `ingredients` and `recipes` row into the
pool+reference model with **zero data loss**, **idempotently**, **safe on
live prod data**, ordered **after** R-00's baseline and the structural DDL
of this sprint.

### Ordering within the R-01 migration set

1. R-00 baseline lands first (prerequisite — `blocked-by: R-00`).
2. Seed reserved anon id (§4).
3. Create `user_ingredient_refs` / `user_recipe_refs` (§2).
4. **Backfill** (this section).
5. RLS rewrite (§6) — after backfill so no window where the new policies
   block the backfill (backfill runs as service role / migration, but RLS
   rewrite last keeps the migration linear and reviewable).
6. Drop `recipes.deleted_at` + its partial unique index (§3) — *after*
   backfill has consumed `deleted_at` (see recipe rule below).

### Backfill rules

**Ingredients** — every existing `ingredients` row is already a valid pool
item (objective data). For each row, create one creator reference for the
row's current owner, *if the owner is a real user*:

```sql
-- design — staged, not applied. Idempotent via the unique(user_id,
-- ingredient_id) constraint + on conflict do nothing.
insert into public.user_ingredient_refs (user_id, ingredient_id, note)
select i.created_by_user_id, i.id, null
from public.ingredients i
where i.created_by_user_id is not null               -- skip system seeds
  and i.created_by_user_id <> '00000000-0000-0000-0000-00000000a0a0'
on conflict (user_id, ingredient_id) do nothing;
```

- System-seed ingredients (`created_by_user_id is null`) get **no** ref —
  correct: nobody "added" them; they are pool-only discoverable items, just
  as today.
- Pre-existing OFF/BEDCA imported ingredients keep whatever
  `created_by_user_id` they have today; if it is a real user, that user gets
  the creator ref (they imported it into their library — matches today's
  behavior where it appeared in their list).

**Recipes** — today recipes are private per-user with `deleted_at`
soft-delete. Backfill maps that onto pool+ref:

```sql
-- design — staged, not applied. Run BEFORE dropping deleted_at.
-- Live (non-deleted) recipes: creator gets a reference.
insert into public.user_recipe_refs (user_id, recipe_id, note)
select r.user_id, r.id, null
from public.recipes r
where r.deleted_at is null
on conflict (user_id, recipe_id) do nothing;

-- Soft-deleted recipes: the recipe ROW is preserved as a pooled item
-- (it may be referenced by recipe_ingredients-free but by meal_logs /
-- plan slots — never orphan dependent data), but the owner is transferred
-- to the reserved anon id and NO reference is created (the user already
-- "deleted" it — they get no library entry, matching intent).
update public.recipes
set created_by_user_id = '00000000-0000-0000-0000-00000000a0a0'  -- or user_id col, per §3 naming
where deleted_at is not null;
```

Rationale: a soft-deleted recipe still has the user's intent ("I removed
this") so it must NOT reappear in their library (no ref). But it may be
referenced by historical `meal_logs` or by `meal_plan_*` slots, so the row
must survive — transferring ownership to anon preserves it as an immutable
pooled artifact exactly like a creator-hide. This *is* the model's
creator-hide path, applied retroactively to existing soft-deletes. After
this runs, `deleted_at` carries no remaining meaning and is dropped (§3).

### Idempotency & safety

- Every insert uses `on conflict do nothing` against the
  `unique(user_id, *_id)` constraint → re-running the backfill is a no-op.
- The `update … where deleted_at is not null` is idempotent (setting an
  already-anon owner to anon again is a no-op; and after the column is
  dropped this statement is not re-run — it lives in the same migration as
  the drop, ordered before it, so re-running the *whole* migration is
  prevented by Supabase migration bookkeeping).
- No row is deleted; no nutrition value is mutated. Backfill is purely
  additive (refs) + an owner-pointer rewrite for already-soft-deleted
  recipes. Worst-case rollback (§10) is `truncate user_*_refs;` + restore
  `deleted_at` from a pre-migration snapshot — see §10.
- Safe on live prod: runs inside the migration transaction; the only
  pre-existing data mutation is the soft-deleted-recipe owner rewrite, which
  is reversible from a snapshot of `(id, user_id, deleted_at)` taken in the
  same migration into a temp/backup table (impl-time decision; spec
  recommends a `_r01_recipes_owner_backup` table created in the migration
  for a clean rollback path, dropped in a later cleanup migration once the
  Wave-3 apply is confirmed good).

---

## 6. RLS rewrite

Public repo ⇒ **RLS is the sole security boundary**. Policies stated
precisely. (Design — staged, not applied. Exact policy SQL finalized against
R-00's baseline of the *current* policies, which this replaces.)

### Pooled tables: `ingredients`, `recipes`

| Op | Policy | Predicate |
|----|--------|-----------|
| SELECT | open to authenticated | `true` (any authenticated user reads the whole pool — discovery) |
| INSERT | authenticated, self-tagged | `auth.uid() = created_by_user_id` (you may only insert a row you own; cannot insert pre-anon or pre-system rows) |
| UPDATE | owner only, real owner only | `auth.uid() = created_by_user_id AND created_by_user_id IS NOT NULL AND created_by_user_id <> LIBRARY_ANON_OWNER_ID` |
| DELETE | owner only, real owner only | same predicate as UPDATE |

Consequences, by design:
- `created_by_user_id IS NULL` (system seed): no UPDATE/DELETE policy ever
  matches → **immutable**, unchanged from today.
- `created_by_user_id = LIBRARY_ANON_OWNER_ID` (creator-hidden): no
  UPDATE/DELETE policy matches (the `<> ANON` clause) → **immutable, never
  re-owned** (enforces "no adoption", model item 6). The anon user itself
  never authenticates, so even "log in as anon" is impossible.
- A real owner can still edit/delete *their own* pooled row (e.g. fix a
  typo in a nutrition value). The "creator-hide" action is **not** a row
  DELETE — it is an UPDATE that sets `created_by_user_id =
  LIBRARY_ANON_OWNER_ID` *and simultaneously* drops the creator's ref. This
  ownership-transfer UPDATE is the one mutation that must flip the row out
  of the caller's ownership; it is done via a `SECURITY INVOKER` RPC (see
  below) so it is atomic and the row is still owned-by-caller at the moment
  the UPDATE is checked.

**Creator-hide is multi-table-atomic ⇒ an RPC (D-C5).** Hiding an
owned-and-referenced item must, in one transaction: (a) delete the caller's
ref row, and (b) reassign the pooled row's owner to anon. Two tables
mutated atomically → per D-C5 this **must** be a `SECURITY INVOKER` RPC with
`set search_path = public` (NOT client multi-statement):

```sql
-- design — staged, not applied
create function public.hide_owned_ingredient(p_ingredient_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Drop my reference (genuine erasure of my private note).
  delete from public.user_ingredient_refs
   where user_id = auth.uid() and ingredient_id = p_ingredient_id;
  -- If I am the real owner, transfer the pool item to anon.
  update public.ingredients
     set created_by_user_id = '00000000-0000-0000-0000-00000000a0a0',
         updated_at = now()
   where id = p_ingredient_id
     and created_by_user_id = auth.uid();   -- RLS-compatible: still mine here
end$$;
-- analogous public.hide_owned_recipe(p_recipe_id uuid)
```

Because the function is `SECURITY INVOKER`, the `update … where
created_by_user_id = auth.uid()` is itself bounded by the caller's rights
and the UPDATE RLS policy (which still matches because the row is *still*
caller-owned at evaluation time). A non-owner calling it only deletes their
own ref (the UPDATE no-ops) — exactly the "drop my reference" path. One RPC
serves both "I'm the creator hiding it" and "I just remove it from my
library" — the difference is purely whether the UPDATE matches.

> Naming note: there are existing `save_recipe` / `save_template` /
> `apply_template_to_week` / `save_week_as_template` INVOKER RPCs and the one
> documented `SECURITY DEFINER` exception `apply_template_to_week_admin`.
> The two new `hide_owned_*` RPCs are INVOKER; the impl-time grep audit
> (plan step) must confirm no new DEFINER was introduced.

### Reference tables: `user_ingredient_refs`, `user_recipe_refs`

Single trivial owner policy for all four ops:

| Op | Predicate |
|----|-----------|
| SELECT / INSERT / UPDATE / DELETE | `auth.uid() = user_id` |

`INSERT` additionally relies on the `unique(user_id, *_id)` constraint so
"add to my library" is `insert … on conflict do nothing` (re-adding is a
no-op, never an error). No user can see or touch another user's refs or
notes — the PII firewall is enforced by this one predicate plus the
physical column separation (§3).

---

## 7. Read-path rewrite scope

Enumerated, not rewritten. Each site changes from "private/soft-deleted
filter" to "join through my refs" (library views) or "search the pool"
(discovery). Files (absolute repo paths):

| Site | File | Current shape | Phase-1 change |
|------|------|---------------|----------------|
| Ingredient local search | `src/features/ingredients/api.ts` `searchLocalIngredients` | `from('ingredients')` ilike/order | Stays a **pool search** (discovery is intended). Optionally annotate "in my library" via a left-join/`exists` on `user_ingredient_refs`. |
| Ingredient list | `src/features/ingredients/api.ts` `listIngredients` | `from('ingredients').order('name')` | Becomes **my library**: join `user_ingredient_refs` on `auth.uid()`. |
| Create manual ingredient | `src/features/ingredients/api.ts` `createManualIngredient` | insert into `ingredients` | Also insert a `user_ingredient_refs` row for the creator (atomic — candidate for a small INSERT RPC, see plan; or `on conflict do nothing` two-step is acceptable because the second insert is the caller's own ref). |
| Import OFF ingredient | `src/features/ingredients/api.ts` `importIngredientFromOFF` | insert + `23505` recover | Same: ensure a creator ref exists (`insert ref … on conflict do nothing`) whether the pool row was just inserted or already existed. |
| Update ingredient | `src/features/ingredients/api.ts` `updateIngredient` | `update ingredients` | Unchanged in shape; now also gated by the new owner RLS (real-owner-only). |
| Delete ingredient | `src/features/ingredients/api.ts` `deleteIngredient` + `IngredientInUseError` | `delete from ingredients`; maps `23503` → error | **Replaced** by `hide_owned_ingredient` RPC (drop ref [+ transfer owner]). `IngredientInUseError` / the `23503` copy path is **removed** (D-A2: that error path disappears once user hard-delete is removed). |
| Recipe list | `src/features/recipes/api.ts` `listRecipes` | `from('recipes').eq('user_id',me).is('deleted_at',null)` | Becomes **my library**: join `user_recipe_refs` on `auth.uid()`; drop the `deleted_at` filter (column gone). |
| Fetch recipe | `src/features/recipes/api.ts` `fetchRecipe` | `from('recipes')…is('deleted_at',null)` + `recipe_ingredients(ingredient:ingredients(*))` | Drop the `deleted_at` filter; recipe is now pool-readable by anyone (open SELECT). The `recipe_ingredients → ingredients` join is unchanged. |
| Save recipe | `src/features/recipes/api.ts` `saveRecipe` (RPC `save_recipe`) | RPC mutates `recipes` + `recipe_ingredients` | On **create**, the RPC must also insert the creator's `user_recipe_refs` row. **Impl-time:** extend `save_recipe` (still INVOKER) — it already mutates >1 table so the ref insert belongs inside it (D-C5). |
| Soft-delete recipe | `src/features/recipes/api.ts` `softDeleteRecipe` | `update recipes set deleted_at` | **Replaced** by `hide_owned_recipe` RPC. |
| Recipe pick-lists in templates | `src/features/templates/api.ts` (`recipe:recipes (id, name)`) | join `recipes` | Pool is openly readable; if the picker should show "my library only", join `user_recipe_refs`. Decide UX at impl (spec recommends: template/plan recipe pickers show **my library**, not the whole pool, to avoid picking strangers' recipes by accident; pool search is a separate explicit "browse library" affordance). |
| Diario meal-log joins | `src/features/diario/api.ts` (`recipe:recipes(... deleted_at ...)`, `ingredient:ingredients(*)`) | selects `deleted_at` | Remove `deleted_at` from the select (column gone). Historical `meal_logs` referencing an item now-owned-by-anon still resolve (pool SELECT is open) — **this is the key never-orphan win**: a "deleted" recipe still renders correctly in past diary entries. |
| Meal-log entry display | `src/features/diario/components/MealLogEntry.tsx` | renders joined recipe/ingredient | No query change; verify it tolerates a recipe/ingredient whose owner is anon (it should — it only reads name/macros). |
| Ingredient list UI | `src/features/ingredients/components/IngredientList.tsx` | renders list | If "remove" affordance exists, rewire to the hide RPC; copy change (no "in use" error). |
| Types | `src/types/database.ts` | hand-written `recipes.deleted_at`, `recipes.user_id` | Remove `deleted_at`; rename/redefine owner column; add `user_ingredient_refs` / `user_recipe_refs` tables + `hide_owned_*` RPCs. Becomes automatic once R-04 generated-types lands; hand-edit until then. |
| Edge: `delete-account` | `supabase/functions/delete-account/index.ts` | blanket CASCADE | Reworked — see §8. |

**`pg_trgm` note.** The trigram gin indexes on `ingredients.name`/`brand`
stay on the pooled table (search is over the pool — correct). No new trigram
index is needed on refs. "My library search" = pool trigram search filtered
by an `exists (select 1 from user_ingredient_refs …)` — index strategy
(whether to add a btree on `user_ingredient_refs(user_id, ingredient_id)`,
already implied by the unique constraint) confirmed at impl time.

---

## 8. `delete-account` rework

Current `supabase/functions/delete-account/index.ts` calls
`admin.auth.admin.deleteUser(userId)` and relies on blanket
`auth.users → … CASCADE` to erase everything, **including the user's
contributed `ingredients`/`recipes`** — which under the ★ model is wrong:
it would destroy objective shared-pool data other users may reference and
silently corrupt their recipes/diary (the exact harm D-A2 guards against).

**New logic (design — staged, not applied):** before deleting the auth user,
run a reconciliation as the service role:

1. **Hard-delete the user's reference rows** (genuine erasure of personal
   notes — the PII):
   ```sql
   delete from public.user_ingredient_refs where user_id = :uid;
   delete from public.user_recipe_refs      where user_id = :uid;
   ```
   (These would also CASCADE-delete via the `auth.users` FK, but doing it
   explicitly first makes the erasure auditable and order-independent.)
2. **Reassign still-owned pooled items to the reserved anon id**
   (anonymized retention of objective shared data):
   ```sql
   update public.ingredients
     set created_by_user_id = '00000000-0000-0000-0000-00000000a0a0',
         updated_at = now()
    where created_by_user_id = :uid;
   update public.recipes
     set created_by_user_id = '00000000-0000-0000-0000-00000000a0a0',  -- owner col per §3
         updated_at = now()
    where created_by_user_id = :uid;
   ```
3. **Then** `admin.auth.admin.deleteUser(userId)`. With steps 1–2 done,
   the remaining CASCADE removes only genuinely user-private rows
   (`profiles`, `phases`, `meal_logs`, `body_measurements`, plan weeks,
   templates, tdee state, etc.) — `ingredients`/`recipes` are no longer
   owned by the user so nothing of theirs cascades there.

**Implementation choice for steps 1–2:** wrap them in a single
`SECURITY DEFINER` reconciliation RPC (e.g.
`private.reconcile_account_delete(p_user_id uuid)`) called by the edge fn
with the service role, OR run the four statements directly from the edge fn
via the service-role client. Spec recommends a **single
`security definer` RPC in the `private` schema** (same pattern as the
existing `private.invoke_edge_function` / `apply_template_to_week_admin`
exception, D-C5 / D-F5): it makes the reconciliation atomic, keeps the
ordering invariant in one place, is unit/pgTAP-testable (R-16 Tier-3), and
is explicitly documented as a *second* sanctioned DEFINER exception (the
plan's grep-audit step must record it as such — it is service-role / cron-
class, never user-callable; granted to no role, invoked only by the edge fn).
The edge fn must call the RPC and check its result **before**
`deleteUser`; if reconciliation fails, abort and do NOT delete the auth
user (no partial erasure).

**Idempotency / failure:** steps 1–2 are idempotent (re-running reassigns
already-anon rows to anon = no-op; deleting already-deleted refs = no-op),
so a retried `delete-account` after a mid-failure is safe.

---

## 9. `recipe_ingredients ON DELETE RESTRICT` confirmation

**Confirmed: `recipe_ingredients.ingredient_id → ingredients.id ON DELETE
RESTRICT` STAYS.** (`recipe_ingredients.recipe_id → recipes.id` likewise.)

Under the new model **no client/edge path ever hard-deletes an
`ingredients` or `recipes` row** — "delete" is now "drop your ref [+
transfer owner to anon]". So RESTRICT is *never hit in normal operation*.
It is retained purely as the **DB-level backstop for the Phase-2 reaper**
(D-A2): the reaper's safety predicate ("zero live references") is enforced
in app logic, and RESTRICT keeps that true *at the database* even if the
reaper logic has a bug — a bad reaper DELETE against a still-referenced
pooled ingredient/recipe is refused by Postgres rather than silently
corrupting another user's recipe macros (CASCADE) or orphaning recipe lines
(SET NULL). CASCADE/SET NULL remain rejected for exactly those reasons. The
constraint costs nothing while user hard-delete does not exist; it is cheap
insurance for Phase 2.

---

## 10. Risks & edge cases

- **A user referencing their own + others' items.** Fully supported: refs
  are per-(user,item) with a unique constraint; a user can have a ref to an
  item they created *and* refs to items others created. "My library" is the
  union of all my refs regardless of pool ownership. No special-casing.
- **Creator-hide while others reference it.** Creator hides item X: their
  ref is deleted, X's owner → anon. Other users' refs to X are untouched;
  X stays pool-readable; their libraries are unaffected. X is now immutable
  (anon-owned) — nobody can edit it, including former creator (no adoption).
  This is the intended outcome and a core reason ownership transfers to anon
  rather than the row being deleted.
- **Orphan prevention.** No path deletes a pooled row in Phase 1.
  `meal_logs` / `meal_plan_*` slots / `recipe_ingredients` always resolve
  because the pooled row survives every "delete" (it only changes owner).
  The never-orphan-dependent-data invariant is structural, not policed.
- **Last reference dropped, real owner.** User drops their ref to an item
  they own and that nobody else references: row stays, still owned by them
  (they did *not* creator-hide — they just removed it from their list).
  It is still pool-discoverable and they can re-add it. (Whether "drop my
  ref while I'm the sole real owner" should auto-transfer to anon is a
  **product question — see §13**; spec default: it does NOT auto-transfer,
  to keep Phase-1 logic minimal and avoid surprising ownership loss.
  Phase-2's reaper handles eventual cleanup of unreferenced anon-able items.)
- **System-seed immutability preserved.** `created_by_user_id IS NULL`
  still matches no UPDATE/DELETE policy → unchanged behavior; backfill never
  creates refs or rewrites owners for seeds.
- **Migration rollback.** Phase-1 is reversible: (a) `truncate
  user_ingredient_refs, user_recipe_refs;` (b) restore `recipes.deleted_at`
  + owner from `_r01_recipes_owner_backup` (created in the migration); (c)
  drop the two ref tables + the `hide_owned_*` RPCs; (d) restore the prior
  RLS policies (captured by R-00's baseline) + the dropped partial unique
  index; (e) the seeded anon `auth.users`/`profiles` rows can stay (inert)
  or be deleted if no row points at them. Because nothing is hard-deleted
  and the only pre-existing mutation (soft-deleted-recipe owner rewrite) is
  snapshotted, rollback loses no user data. Rollback SQL ships *with* the
  migration as a documented `-- ROLLBACK:` block (staged-migration
  convention).
- **Concurrency.** "Add to library" double-fire (two tabs) is safe via
  `on conflict do nothing` on `unique(user_id,*_id)`. Creator-hide is a
  single RPC transaction. No read-then-write race introduced.
- **Public-repo / RLS-only.** Every boundary above is an RLS policy or a
  constraint, never client trust. The anon user cannot authenticate; the
  sentinel id is a compile-time constant in code and a documented value in
  `docs/data-model.md`.

---

## 11. Interaction with other staged migrations (ordering)

R-01's migration is **blocked-by R-00** (needs the schema baseline so the
ref tables, the RLS replacement, and the `auth.users` sentinel insert build
on a reproducible history). Relative to the other staged/pending work:

- **R-00 (baseline)** — hard prerequisite; must land first. R-01's RLS
  rewrite *replaces* policies that R-00 must first capture; the anon-seed
  migration needs R-00's confirmed `auth.users`/`profiles` NOT-NULL columns.
- **R-12 (`materialize_plan_for_date` RPC + partial unique index on
  `meal_logs`)** — independent table surface (`meal_logs`), but both touch
  `recipes` read paths and both are `SECURITY INVOKER`-RPC work. **No
  conflict**; sequence either order. Note: R-12's materialization reads
  plan slots → `recipes`; after R-01 those recipes may be anon-owned —
  still pool-readable, so R-12 is unaffected. The plan should land R-12 and
  R-01 in separate migrations; if both land same Wave-3, apply R-01's pool
  changes first so R-12's reads see the final model (order-tolerant either
  way since SELECT is open).
- **R-08 (drop 4 dead `tdee_estimates` cols)** — disjoint table; order-free.
- **R-03 (drop `profiles.bone_kg`)** — disjoint column; but **R-01 inserts a
  `profiles` row for the anon sentinel**. Order constraint: the anon-profile
  insert must not reference `bone_kg` (it does not — §4 inserts only
  `id, display_name, language, start_date`), so R-01 and R-03 are
  order-free. If R-03 lands first, no change; if R-01 first, R-03's
  `DROP COLUMN bone_kg` does not touch the sentinel row.
- **R-14 (drop `profiles.units`)** — same reasoning as R-03; the sentinel
  insert does not set `units` (relies on the column default while it
  exists; after R-14 the column is gone and the insert still works). Order-
  free. Impl-time: ensure the sentinel `profiles` insert column list is
  *minimal* so it survives R-03/R-14 column drops regardless of order.
- **R-04 (generated `types/database.ts`)** — R-01 adds two tables + two
  RPCs + drops `recipes.deleted_at` + renames the owner column. If R-04
  lands after R-01's Wave-3 apply, regeneration picks all this up
  automatically; until then R-01 hand-edits `src/types/database.ts` (same
  interim rule R-03/R-08/R-14 follow).
- **R-16 Tier-3 (pgTAP RLS/RPC tests)** — unblocked by R-00; R-01's new
  policies + `hide_owned_*` + the reconciliation RPC are prime Tier-3
  targets. The plan lists pgTAP coverage as a task (gated behind R-00 like
  all Tier-3).

**Wave-3 discipline:** every R-01 SQL object (anon seed, ref tables,
backfill, RLS replacement, `hide_owned_*` RPCs, the reconciliation RPC,
`delete-account` redeploy) is **STAGED — not applied**, consistent with how
R-03/R-06/R-07/R-08/R-12/R-14/R-18 are handled (`docs/operations.md`
"STAGED — Wave-3"). Nothing touches the live DB/edge until the Wave-3 prod
checkpoint with explicit user sign-off (see plan + §13).

---

## 12. Phase 2 explicitly out of scope

**The auto-reaper / garbage-collector is NOT built in Phase 1 and is NOT
specced here.** Per `docs/data-model.md#library-model` item 7, D-A4, and
R-01 scope:

- Phase 2 deletes a pooled item only if **all three** hold: `owner =
  LIBRARY_ANON_OWNER_ID` **AND** zero live references (no
  `recipe_ingredients` for an ingredient; no `meal_logs`/plan slots for a
  recipe) **AND** negative community signal (downvotes / no likes).
- The third predicate **depends on a ratings/voting feature that does not
  exist** and is not on the current roadmap. Until it ships, there is no
  reaper, no scheduled GC job, no deletion of pooled rows at all.
- Tolerated ingredient/recipe duplicates (D-A4) remain tolerated through
  Phase 1; they are the *structural* responsibility of the Phase-2 reaper,
  not a Phase-1 dedup feature. (`pg_trgm` is already enabled, so a future
  one-RPC trigram-similarity dedup-at-insert is the recorded escape hatch —
  but it is **not** Phase 1.)
- `recipe_ingredients ON DELETE RESTRICT` is retained now precisely so the
  Phase-2 reaper has its DB backstop ready (§9) — but the reaper itself is
  future work.

Phase-1 deliverable boundary: the pool/reference structure, backfill, RLS,
read rewrites, anon seed, `delete-account` rework, and create-form labeling
copy — **and nothing that deletes a pooled row**.

---

## 13. Open questions for the user (checkpoint)

To resolve **before** any Wave-3 apply (the plan calls a mandatory user
checkpoint here):

1. **Owner-column rename on `recipes`.** Spec recommends renaming
   `recipes.user_id` → `created_by_user_id` for parity with `ingredients`
   and to make the semantic shift loud. Acceptable, or keep `user_id` as the
   redefined owner pointer (less migration churn, more semantic ambiguity)?
2. **Sole-owner ref-drop behavior.** When a real owner drops their *only*
   ref and nobody else references the item — spec default: row stays,
   still owned by them, re-addable (no auto-anon-transfer). Confirm, or
   prefer auto-transfer-to-anon on sole-owner ref-drop (more aggressive
   cleanup, but surprising ownership loss)?
3. **Template/plan recipe pickers: my-library vs whole-pool.** Spec
   recommends pickers default to *my library* (join refs), with pool browse
   as a separate explicit affordance. Confirm the UX stance.
4. **Reconciliation RPC as a second `SECURITY DEFINER` exception.** Spec
   recommends `private.reconcile_account_delete` (DEFINER, service-role-
   only, documented exception). Confirm acceptable vs. running the four
   statements inline from the edge fn (no new DEFINER, but reconciliation
   not atomic in one DB call).
5. **Sentinel UUID value.** Spec proposes
   `00000000-0000-0000-0000-00000000a0a0`. Confirm or substitute a
   project-preferred fixed sentinel.

These do not block writing/merging the spec+plan (design only); they block
the *implementation sprint's* Wave-3 apply.
