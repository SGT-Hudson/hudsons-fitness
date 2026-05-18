# Library Model Phase 1 — Implementation Plan (R-01 / D-A2, D-A3, D-A4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 1 of the ★ Library Contribution & Lifecycle Model
for `ingredients` and `recipes`: a shared pool + per-user reference rows
(private notes on the reference only), no user hard-delete (hide = drop your
ref; creator-hide transfers pool ownership to a reserved anon id), a
deterministic idempotent backfill of all existing data, a full RLS rewrite,
read-path rewrites per feature, and a reworked `delete-account` edge fn.
**No Phase-2 reaper.**

**Decision of record:** `docs/decisions.md` D-A2/D-A3/D-A4 +
`docs/data-model.md#library-model`. **Design spec (read first):**
`docs/superpowers/specs/2026-05-18-library-model-phase1-design.md` — it
resolves every open follow-up with justification; this plan only sequences
the build.

**Tech stack:** Postgres migrations (SQL), Supabase RLS, one Deno edge
function (`delete-account`), TypeScript client (`src/features/*`), Vitest
(Tier-1) + pgTAP (Tier-3, gated behind R-00). No new runtime deps.

**Blocked-by:** **R-00** (schema baseline into `supabase/migrations/`) — hard
prerequisite. R-01 cannot finalize its RLS replacement or the `auth.users`
sentinel insert without R-00's reproducible baseline of current policies and
`auth.users`/`profiles` NOT-NULL columns.

**STAGED-migration / Wave-3 discipline (non-negotiable):** every SQL object
and the `delete-account` redeploy is **STAGED — not applied**, exactly like
R-03/R-06/R-07/R-08/R-12/R-14/R-18 (see `docs/operations.md` "STAGED —
Wave-3"). Nothing touches the live DB/edge until the Wave-3 prod checkpoint
**with explicit user sign-off** (Task 11). Each migration ships with a
documented `-- ROLLBACK:` block.

**Mandatory user checkpoint:** the 5 open product questions in spec §13 must
be answered by the user **before Task 11 (Wave-3 apply)**. They do NOT block
Tasks 1–10 (staged code/SQL) but the staged SQL must be parameterised so the
answers slot in without a rewrite (e.g. owner-column name, sentinel UUID).

---

## Task 0 — Preconditions & audit

- [ ] Confirm R-00 has landed (a reproducible `supabase/migrations/`
      baseline incl. current `ingredients`/`recipes` RLS policies + the
      `recipes` partial unique index + `auth.users`/`profiles` columns).
      If not, **STOP — blocked-by R-00.**
- [ ] Grep audit `SECURITY DEFINER` across `supabase/migrations/` + record
      the current sanctioned exception(s) (expected: only
      `apply_template_to_week_admin`). This baseline lets Task 8 prove it
      added exactly one new documented DEFINER (the reconciliation RPC) and
      Task 5's `hide_owned_*` are INVOKER.
- [ ] Re-read spec §13; surface the 5 open questions to the user. Record
      answers (or "defaults accepted") in the PR / a scratch note. Defaults
      from the spec are usable for staging if the user is unavailable.
- **Verify:** `git log` shows R-00 merged; audit notes captured in the PR
  description.

## Task 1 — Seed the reserved anon owner id (staged migration)

- [ ] New migration `supabase/migrations/<ts>_r01_library_anon_seed.sql`
      (STAGED — Wave-3 header comment, like the existing staged files).
- [ ] Insert the sentinel `auth.users` row + matching minimal `public.profiles`
      row, idempotent (`on conflict (id) do nothing`), per spec §4. Use the
      **user-confirmed sentinel UUID** (default
      `00000000-0000-0000-0000-00000000a0a0`).
- [ ] Provide every NOT-NULL column required by the **R-00-baselined**
      `auth.users` / `profiles` schema (do not assume — verify against R-00).
      Keep the `profiles` insert column list **minimal** (`id, display_name,
      language, start_date`) so it survives R-03/R-14 column drops in any
      order (spec §11).
- [ ] Add a code constant `LIBRARY_ANON_OWNER_ID` (single source) — location
      at impl time (candidate: `src/lib/` or a `src/core/` constant; edge
      reuses the same literal). Document the value in `docs/data-model.md`.
- [ ] Include a `-- ROLLBACK:` block (delete the sentinel rows iff nothing
      points at them).
- **Verify:** migration is idempotent (running twice = no error/no dup);
  `tsc -b` clean for the new constant; **not applied** (no MCP/deploy).

## Task 2 — Reference tables (staged migration)

- [ ] New migration `<ts>_r01_user_refs.sql` (STAGED). Create
      `public.user_ingredient_refs` and `public.user_recipe_refs` exactly
      per spec §2 (real FKs, `note text`, `unique(user_id,*_id)`,
      `on delete cascade` on both FKs, timestamps).
- [ ] Add the btree implied by `unique(user_id,*_id)` (covers "my library"
      join + "in my library?" exists-checks; confirm no extra index needed).
- [ ] `-- ROLLBACK:` `drop table` both.
- **Verify:** DDL parses against R-00 baseline locally (`supabase db reset`
  on a *local* stack only — never prod); FKs/constraints present;
  **not applied to prod.**

## Task 3 — Backfill (staged migration, ordered after Tasks 1–2)

- [ ] New migration `<ts>_r01_backfill.sql` (STAGED). In one transaction,
      in this order (spec §5):
  - [ ] Create `_r01_recipes_owner_backup` (snapshot
        `id, user_id/owner, deleted_at` for rollback).
  - [ ] Insert creator `user_ingredient_refs` for every ingredient whose
        `created_by_user_id` is a **real user** (skip `null` seeds and the
        anon id), `on conflict do nothing`.
  - [ ] Insert creator `user_recipe_refs` for every recipe with
        `deleted_at is null`, `on conflict do nothing`.
  - [ ] `update recipes set <owner> = <ANON> where deleted_at is not null`
        (retro creator-hide of existing soft-deletes — they get no ref).
- [ ] `-- ROLLBACK:` truncate the two ref tables; restore owner/`deleted_at`
      from `_r01_recipes_owner_backup`.
- **Verify (on a LOCAL stack seeded with a prod-shaped fixture, never prod):**
  every non-seed ingredient/live recipe has exactly one creator ref;
  soft-deleted recipes are anon-owned with zero refs; re-running the whole
  migration is a no-op; row counts: `ingredients`/`recipes` unchanged, no
  nutrition value mutated. **Not applied to prod.**

## Task 4 — Drop `recipes.deleted_at` + partial unique index (staged, after Task 3)

- [ ] In a migration ordered **after** the backfill: drop the
      `recipes.deleted_at` partial unique index, then
      `alter table recipes drop column deleted_at`. Decide owner-column
      rename here per the **user-confirmed** spec §13 Q1 (default: rename
      `user_id` → `created_by_user_id`).
- [ ] `-- ROLLBACK:` re-add `deleted_at timestamptz` + the partial unique
      index + revert the rename (data restored from Task 3's backup table).
- **Verify:** no migration after this references `deleted_at`; **not
  applied.**

## Task 5 — `hide_owned_*` INVOKER RPCs (staged migration)

- [ ] New migration `<ts>_r01_hide_rpcs.sql` (STAGED). Create
      `public.hide_owned_ingredient(p_ingredient_id uuid)` and
      `public.hide_owned_recipe(p_recipe_id uuid)` exactly per spec §6:
      `language plpgsql security invoker set search_path = public`; body =
      delete caller's ref, then `update … set owner = ANON where
      owner = auth.uid()`.
- [ ] `-- ROLLBACK:` `drop function` both.
- **Verify:** both are `SECURITY INVOKER` + `set search_path = public`
  (re-run the Task 0 DEFINER grep — must show **zero** new DEFINER here);
  **not applied.**

## Task 6 — RLS rewrite (staged migration, ordered LAST among DDL)

- [ ] New migration `<ts>_r01_rls.sql` (STAGED), ordered after Tasks 2–5.
- [ ] Replace `ingredients` + `recipes` policies with the spec §6 set:
      open authenticated SELECT; self-tagged INSERT; UPDATE/DELETE gated on
      `auth.uid() = owner AND owner IS NOT NULL AND owner <> ANON`
      (null=seed immutable; anon immutable/never-re-owned).
- [ ] Add the trivial `auth.uid() = user_id` policy (all 4 ops) on both ref
      tables; enable RLS on both.
- [ ] `-- ROLLBACK:` restore the prior `ingredients`/`recipes` policies
      captured by R-00's baseline; drop the ref-table policies.
- **Verify:** policy predicates match spec §6 verbatim (this is the sole
  security boundary — public repo). Tier-3 pgTAP (Task 10) is the executable
  proof. **Not applied.**

## Task 7 — Client read-path rewrites (code, no migration)

Per spec §7 table. Each sub-step keeps the public fn name/signature where
possible; behavior changes only as the spec dictates.

- [ ] `src/features/ingredients/api.ts`: `listIngredients` → join
      `user_ingredient_refs` (my library); `searchLocalIngredients` stays
      pool search (optionally annotate "in my library"); `createManualIngredient`
      / `importIngredientFromOFF` also ensure a creator ref
      (`insert ref … on conflict do nothing`); **remove** `deleteIngredient`
      + `IngredientInUseError` + the `23503` copy path, replace callers with
      `supabase.rpc('hide_owned_ingredient', …)`.
- [ ] `src/features/recipes/api.ts`: `listRecipes` → join `user_recipe_refs`,
      drop `deleted_at` filter; `fetchRecipe` drop `deleted_at` filter;
      `softDeleteRecipe` → `hide_owned_recipe` RPC; extend `save_recipe`
      RPC call site (the RPC itself, Task 9, inserts the creator ref on
      create).
- [ ] `src/features/templates/api.ts`: recipe picker join — default to
      *my library* (`user_recipe_refs`) per spec §13 Q3 (user-confirmed).
- [ ] `src/features/diario/api.ts`: remove `deleted_at` from the
      `recipe:recipes(...)` select; verify joins still resolve for
      anon-owned items.
- [ ] `src/features/diario/components/MealLogEntry.tsx`,
      `src/features/ingredients/components/IngredientList.tsx`: rewire any
      "delete/remove" affordance to the hide RPC; remove "in use" error
      copy; update i18n (ES+EN) — labels become "Remove from my library"
      not "Delete".
- [ ] `src/types/database.ts`: add the two ref tables + two
      `hide_owned_*` RPCs; remove `recipes.deleted_at`; rename/redefine the
      owner column. (Hand-edit until R-04; note interim rule.)
- **Verify:** `node_modules/.bin/eslint .` 0 errors; `tsc -b` 0;
  `vite build` 0. No `deleted_at` / `IngredientInUseError` references remain
  (grep). Hooks/toasts unchanged in ownership layer (D-D2/D-D3 untouched).

## Task 8 — Create-form labeling copy (code + i18n)

- [ ] Add ES+EN copy on the ingredient/recipe **create** forms stating the
      item is contributed to the shared library and that private content
      goes in the (reference) note, not the title (★ model item 5). New i18n
      keys in the relevant namespace(s); register if a new namespace.
- **Verify:** ES/EN parity; `eslint`/`tsc -b`/`build` clean.

## Task 9 — Extend `save_recipe` + add reconciliation RPC (staged migration)

- [ ] New migration `<ts>_r01_save_recipe_ref.sql` (STAGED): extend the
      existing `save_recipe` RPC so that on **create** (new recipe) it also
      inserts the creator's `user_recipe_refs` row (it already mutates >1
      table; the ref insert belongs inside it per D-C5). Keep it
      `SECURITY INVOKER`. `-- ROLLBACK:` restore the prior `save_recipe`
      body (from R-00 baseline).
- [ ] New migration `<ts>_r01_account_delete_reconcile.sql` (STAGED):
      `private.reconcile_account_delete(p_user_id uuid)` —
      `SECURITY DEFINER`, `set search_path = ''`, granted to **no** role
      (service-role/edge only), per spec §8: delete the user's refs, reassign
      still-owned `ingredients`/`recipes` to ANON. Document it in
      `docs/operations.md` + `docs/decisions.md`-adjacent ops notes as the
      **second sanctioned DEFINER exception** (do NOT edit `decisions.md`
      itself — record in operations/handoff per repo convention).
      `-- ROLLBACK:` `drop function`.
- **Verify:** DEFINER grep now shows exactly *two* documented exceptions
  (`apply_template_to_week_admin` + `reconcile_account_delete`); the new RPC
  is granted to no role; `save_recipe` stays INVOKER. **Not applied.**

## Task 10 — `delete-account` edge rework (code, staged deploy)

- [ ] `supabase/functions/delete-account/index.ts`: before
      `admin.auth.admin.deleteUser`, call
      `reconcile_account_delete(p_user_id)` via the service-role client;
      **abort and do not delete the auth user if reconciliation fails** (no
      partial erasure). Per spec §8.
- [ ] Mark the redeploy **STAGED — Wave-3** in `docs/operations.md` (edge
      deploy applied only at the prod checkpoint, like R-07/R-18 staged
      deploys).
- **Verify:** `eslint`/`tsc -b`/`build` clean (edge fn isn't in the Vite
  build but the core constant import is — confirm cross-root import per
  R-17's Wave-3 validation note); logic reviewed against spec §8;
  **not deployed.**

## Task 11 — Tests (Tier-1 now; Tier-3 gated behind R-00)

- [ ] **Tier-1 (Vitest, now):** unit-test any new pure logic introduced
      (e.g. the `LIBRARY_ANON_OWNER_ID` constant usage, any ref-shaping
      helper). Mostly SQL-side, so Tier-1 surface is small but the
      "new pure logic ships with Vitest coverage" rule (R-16) applies to any
      added helper.
- [ ] **Tier-3 (pgTAP, gated behind R-00 — already a prerequisite):** RLS +
      RPC tests for: open pool SELECT; self-tagged INSERT only; system-seed
      immutability (`owner is null`); anon immutability + never-re-owned;
      ref-table per-user isolation (cannot read another user's note);
      `hide_owned_*` (creator-hide transfers owner + drops ref; non-owner
      only drops ref); `reconcile_account_delete` (refs erased, owned items
      → anon, idempotent); backfill idempotency; never-orphan
      (`recipe_ingredients`/`meal_logs` still resolve post-hide).
- **Verify:** `vitest run` all pass; pgTAP suite passes on the **local**
  stack (`supabase start`), never prod.

## Task 12 — Docs

- [ ] `docs/data-model.md#library-model`: keep the decided model text; once
      Wave-3 applies, flip the "this is the **target** model … do not yet
      work this way" preamble + remove the `> ⚠ Changing — see R-01` callout
      (per roadmap's "remove the matching callout when done" rule — do this
      at Wave-3, not at code-merge).
- [ ] `docs/operations.md`: add the R-01 staged migrations + the
      `delete-account` staged redeploy to the Wave-3 list, with ordering
      (R-00 → anon seed → ref tables → backfill → drop deleted_at → hide
      RPCs → save_recipe ext + reconcile RPC → RLS → edge deploy) and the
      mandatory user checkpoint; document `LIBRARY_ANON_OWNER_ID` + the
      second DEFINER exception + the rollback blocks.
- [ ] `docs/roadmap.md` R-01: at code-merge → already
      `spec+plan ready … awaiting user review`; at implementation-merge →
      `in-progress`; at Wave-3 apply → `done (<date>)` and remove the
      data-model callout. (This plan PR only sets spec+plan-ready — see
      "Doc bookkeeping" below.)
- **Verify:** no edit to `docs/decisions.md`; cross-refs by ID/anchor.

---

## Sequencing summary

```
R-00 (prereq, separate) ──► Task 0 audit + user-answers spec §13
  └─► T1 anon seed ─► T2 ref tables ─► T3 backfill ─► T4 drop deleted_at
        ─► T5 hide RPCs ─► T9 save_recipe ext + reconcile RPC ─► T6 RLS (last DDL)
  └─► T7 client reads ─► T8 create-form copy ─► T10 edge rework  (code, parallel-ish)
  └─► T11 tests (Tier-1 now; Tier-3 after R-00) ─► T12 docs
        ─► ★ USER CHECKPOINT (spec §13 answered) ─► Wave-3 prod apply (ordered, signed-off)
```

All Tasks 1–12 are **code/SQL staged only**. The single prod-apply happens
at the Wave-3 checkpoint, in the migration order above, **after** explicit
user sign-off on spec §13 — consistent with how every other staged
migration (R-03/R-06/R-07/R-08/R-12/R-14/R-18) is gated. No MCP, no
`apply_migration`, no edge deploy before that checkpoint.

## Doc bookkeeping (this spec+plan PR only)

This PR (design only, not merged until user-approved) does **only**:
- Adds the two docs above.
- `docs/roadmap.md` R-01 `status:` →
  `spec+plan ready (2026-05-18) — awaiting user review before implementation`,
  with pointers to the spec + plan paths.
- Touches no other roadmap entry, not `docs/decisions.md`, no code, no
  migrations, no live DB/edge.
