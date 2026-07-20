# RLS `WITH CHECK` uniformity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every UPDATE policy in schema `public` carries an explicit `WITH CHECK`, the two pgTAP `todo` blocks that have been silently *passing* are deleted, and one catalogue-wide assertion replaces them — so the day someone writes a `USING`-only UPDATE policy, CI says so.

**Architecture:** One migration of flat `alter policy … using (…) with check (…)` statements — 14 of them, each repeating the policy's existing `USING`. Behaviour is unchanged by construction: Postgres already applies `USING` to the new row when `WITH CHECK` is absent. The value is explicit intent plus insurance against a future edit that narrows `USING` and would otherwise silently stop covering the new row.

**Tech Stack:** Postgres 17 + Supabase CLI 2.101.0, pgTAP, migrations in `supabase/migrations/`, tests in `supabase/tests/*.test.sql`.

## Global Constraints

- **Worktree:** `/home/hudson/dev/hudsons-fitness/.claude/worktrees/rls-with-check`, branch `claude/rls-with-check`. Never push to `develop`/`main`.
- **No AI/Claude attribution anywhere** — commits, comments, PR text. Plain conventional commits.
- Commands run as `corepack pnpm …` (bare `pnpm` is a Windows shim that crashes on Node 20).
- **RLS is the sole security boundary and this repo is public.** A transcription error in a policy expression is a security bug, not a typo. Every `with check` written here must be semantically identical to its policy's existing `using` — Task 1 Step 5 verifies that against the catalogue rather than by eye.
- `ALTER POLICY`, never drop-and-recreate: no policy body is retyped, so no nuance can be lost.
- Migration filename convention: `YYYYMMDDHHMMSS_<slug>.sql`. Newest existing is `20260718100100`. Use `20260719120000_r22_update_with_check.sql`.
- Migration header house style: `-- <ID> — <one-line summary>.`, then `--`, then prose explaining *why*, especially any non-obvious mechanism. Lowercase SQL keywords.
- pgTAP files use `select * from no_plan();` … `select * from finish();` — **there is no `plan(N)` count to keep in sync.** Adding or removing assertions needs no arithmetic.
- The CI `db-test` job runs bare `supabase test db`; the CLI discovers `supabase/tests/*.test.sql` itself. A file that is not named `*.test.sql`, or lives elsewhere, is **silently skipped and CI stays green** — so the meta-test must go in an existing or correctly-named file in that directory.

## Ground truth (measured, do not re-derive)

Queried from `pg_policies` against the full migration history applied from zero. **26** UPDATE policies exist in `public`; **14** have `with_check IS NULL`; the other **12** already carry one and every one of those is character-for-character identical to its own `qual` — nothing deliberately diverges, so nothing must be excluded.

The 14, with the exact `USING` each must repeat:

| Table | Policy name | `USING` |
|---|---|---|
| `profiles` | `Users update own profile` | `auth.uid() = id` |
| `body_measurements` | `Users update own measurements` | `auth.uid() = user_id` |
| `goals` | `Users update own goals` | `auth.uid() = user_id` |
| `phases` | `Users update own phases` | `auth.uid() = user_id` |
| `meal_logs` | `Users update own meal logs` | `auth.uid() = user_id` |
| `daily_nutrition_history` | `Users update own daily history` | `auth.uid() = user_id` |
| `tdee_estimates` | `Users update own tdee` | `auth.uid() = user_id` |
| `meal_plan_templates` | `Users update own templates` | `auth.uid() = user_id` |
| `meal_plan_weeks` | `Users update own plan weeks` | `auth.uid() = user_id` |
| `meal_plan_template_day_times` | `Users update own template day times` | exists-join to `meal_plan_templates t` on `t.id = template_id and t.user_id = auth.uid()` |
| `meal_plan_template_slots` | `Users update own template slots` | exists-join to `meal_plan_templates t` on `t.id = template_id and t.user_id = auth.uid()` |
| `meal_plan_week_slots` | `Users update own plan week slots` | exists-join to `meal_plan_weeks w` on `w.id = plan_week_id and w.user_id = auth.uid()` |
| `workout_sets` | `User updates own workout sets` | exists-join to `workout_sessions s` on `s.id = session_id and s.user_id = auth.uid()` |
| `recipe_ingredients` | `Real owner updates own recipe ingredients` | exists-join to `recipes r` on `r.id = recipe_id and r.created_by_user_id = auth.uid() and r.created_by_user_id is not null and r.created_by_user_id <> '00000000-0000-0000-0000-00000000a0a0'` |

**The spec undercounted.** It said "~11 tables" and treated `meal_plan_*` as one or two; it is five. All 14 above are in scope.

## A note on the local stack before you start

The worktree's `supabase/config.toml` (as it stands on `origin/develop`) pins only `[db] port = 54322` — the 543xx defaults. If another Supabase project is up on those ports, `supabase start` here will collide. The 553xx port block exists only as an **uncommitted** edit in the main checkout; it is not on `develop`. If you hit a collision, stop and say so — do not silently edit `config.toml` in this branch, that is a separate change.

Stop the stack with `supabase stop`, **never** `docker stop` — the latter leaves the CLI in a half-started state needing a stop/start cycle to clear.

---

### Task 1: The migration and the assertion that proves it

**Files:**
- Create: `supabase/migrations/20260719120000_r22_update_with_check.sql`
- Modify: `supabase/tests/02_rls_child.test.sql` (header lines 1-4; delete lines 64-72 and 83-89; the comment at line 91)

**Interfaces:**
- Consumes: nothing.
- Produces: the invariant "every UPDATE policy in `public` has a non-null `with_check`", asserted in the pgTAP suite. Task 2 documents it; nothing else depends on it in code.

- [ ] **Step 1: Write the failing assertion first**

Add to `supabase/tests/02_rls_child.test.sql`, immediately before `select * from finish();` (currently line 119). This replaces point-per-table assertions on purpose: those would have to be hand-added for every table created from now on — the same maintenance failure that produced this state.

```sql
-- ── Catalogue-wide: no USING-only UPDATE policy may exist ────────────────────
-- Postgres applies USING to the new row when WITH CHECK is absent, so a
-- missing clause is not a hole — but it is implicit, and it stops covering the
-- new row the moment someone narrows USING alone. This assertion covers every
-- table that exists now and every table added later.
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and cmd = 'UPDATE' and with_check is null),
  0, 'every UPDATE policy in public carries a WITH CHECK');
```

- [ ] **Step 2: Run the suite and watch it fail**

```bash
supabase --workdir . start -x studio,imgproxy,edge-runtime,logflare,vector
supabase --workdir . test db
```

Expected: the new assertion FAILS, reporting `have: 14, want: 0`. If it reports any number other than 14, **stop** — the ground-truth table above no longer matches the schema, and the migration below would be incomplete. Report the discrepancy rather than adjusting the number.

Also expect the two `todo` blocks (lines 64-72, 83-89) to report as **unexpectedly succeeded** in the TAP output. That is the bug being removed: they have been passing all along.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260719120000_r22_update_with_check.sql`:

```sql
-- R-22 follow-up — every UPDATE policy in public carries an explicit WITH CHECK.
--
-- This closes no hole. Postgres applies an UPDATE policy's USING expression to
-- the NEW row when WITH CHECK is absent, so all fourteen policies below were
-- already covered — the pgTAP `todo` blocks that claimed otherwise had been
-- silently passing for months.
--
-- The clause is written anyway for two reasons: it states the intent instead of
-- leaving it to a Postgres subtlety the next reader has to know, and it is
-- insurance against a future edit that narrows USING alone, which would
-- otherwise stop covering the new row without a word.
--
-- ALTER POLICY, not drop-and-recreate: no policy body is retyped, so no nuance
-- can be lost in transcription. Each WITH CHECK repeats that policy's existing
-- USING exactly.

-- Simple ownership: the row's own user column.
alter policy "Users update own profile" on public.profiles
  using (auth.uid() = id) with check (auth.uid() = id);

alter policy "Users update own measurements" on public.body_measurements
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter policy "Users update own goals" on public.goals
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter policy "Users update own phases" on public.phases
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter policy "Users update own meal logs" on public.meal_logs
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter policy "Users update own daily history" on public.daily_nutrition_history
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter policy "Users update own tdee" on public.tdee_estimates
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter policy "Users update own templates" on public.meal_plan_templates
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter policy "Users update own plan weeks" on public.meal_plan_weeks
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Child tables: ownership via a join to the parent. Without WITH CHECK these
-- were the ones the todo blocks claimed could be re-pointed into another
-- user's parent — they could not.
alter policy "Users update own template day times" on public.meal_plan_template_day_times
  using (
    exists (
      select 1 from public.meal_plan_templates t
      where t.id = meal_plan_template_day_times.template_id and t.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.meal_plan_templates t
      where t.id = meal_plan_template_day_times.template_id and t.user_id = auth.uid()
    )
  );

alter policy "Users update own template slots" on public.meal_plan_template_slots
  using (
    exists (
      select 1 from public.meal_plan_templates t
      where t.id = meal_plan_template_slots.template_id and t.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.meal_plan_templates t
      where t.id = meal_plan_template_slots.template_id and t.user_id = auth.uid()
    )
  );

alter policy "Users update own plan week slots" on public.meal_plan_week_slots
  using (
    exists (
      select 1 from public.meal_plan_weeks w
      where w.id = meal_plan_week_slots.plan_week_id and w.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.meal_plan_weeks w
      where w.id = meal_plan_week_slots.plan_week_id and w.user_id = auth.uid()
    )
  );

alter policy "User updates own workout sets" on public.workout_sets
  using (
    exists (
      select 1 from public.workout_sessions s
      where s.id = workout_sets.session_id and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workout_sessions s
      where s.id = workout_sets.session_id and s.user_id = auth.uid()
    )
  );

-- Recipes are a shared pool (R-01): writes are gated on the parent recipe's
-- real creator, and the LIBRARY_ANON_OWNER_ID sentinel never counts as one.
alter policy "Real owner updates own recipe ingredients" on public.recipe_ingredients
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.created_by_user_id = auth.uid()
        and r.created_by_user_id is not null
        and r.created_by_user_id <> '00000000-0000-0000-0000-00000000a0a0'::uuid
    )
  )
  with check (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.created_by_user_id = auth.uid()
        and r.created_by_user_id is not null
        and r.created_by_user_id <> '00000000-0000-0000-0000-00000000a0a0'::uuid
    )
  );
```

- [ ] **Step 4: Apply from zero and run the suite**

```bash
supabase --workdir . stop
supabase --workdir . start -x studio,imgproxy,edge-runtime,logflare,vector
supabase --workdir . test db
```

A full restart, not `db reset` alone, so the migration is exercised the same way CI exercises it: applied from zero as part of the whole history.

Expected: the new assertion PASSES. The two `todo` blocks still report as unexpectedly succeeded — they are deleted in Step 6.

- [ ] **Step 5: Verify no expression drifted (this is the security-relevant check)**

The migration retypes each expression in house style rather than pasting Postgres's normalised form, so a transcription error is possible and would be a real RLS bug. Do not eyeball it — ask the catalogue. Run against the local DB (`postgresql://postgres:postgres@127.0.0.1:<db port from config.toml>/postgres`), using the `pg` package from `node_modules` (there is no `psql` in this environment):

```sql
select tablename, policyname
from pg_policies
where schemaname = 'public' and cmd = 'UPDATE'
  and with_check is distinct from qual;
```

Expected: **zero rows.** Every UPDATE policy in this schema is meant to have `with_check` identical to `using`; a row here means an expression was mistyped and the two clauses now disagree. If any row comes back, fix that policy's `with check` to match its `using` and re-run before continuing.

Record the output in your report — this is the evidence that the migration is behaviour-neutral.

- [ ] **Step 6: Delete the two lying `todo` blocks**

In `supabase/tests/02_rls_child.test.sql`:

Delete lines 64-72 entirely — the three-line comment *and* the block it introduces:

```sql
-- R-22 gap: workout_sets UPDATE has USING but no WITH CHECK, so re-pointing a
-- child into another user's parent is not blocked yet. Asserted under todo so
-- it is visible and non-failing; flip to a hard assertion when R-22 lands.
select todo_start('R-22: workout_sets UPDATE lacks WITH CHECK');
select throws_ok(
  $q$ update workout_sets set session_id = '00000000-0000-0000-0000-00000000005a'
       where id = '00000000-0000-0000-0000-0000000000cb' $q$,
  '42501', NULL, 'B cannot re-point its own set into A''s session');
select todo_end();
```

Delete lines 83-89 entirely:

```sql
select todo_start('R-22: recipe_ingredients UPDATE lacks WITH CHECK');
select throws_ok(
  $q$ update recipe_ingredients set recipe_id = '00000000-0000-0000-0000-0000000000a1'
       where recipe_id = '00000000-0000-0000-0000-0000000000b1'
         and ingredient_id = '00000000-0000-0000-0000-0000000000d1' $q$,
  '42501', NULL, 'B cannot re-point its own recipe_ingredient into A''s recipe');
select todo_end();
```

They are deleted rather than converted to hard assertions because the meta-test from Step 1 now covers the property generally, and the surviving hard assertions on `routine_exercises` and `program_days` (lines 100-103 and 114-117) already cover the re-pointing behaviour itself.

- [ ] **Step 7: Correct the two comments that perpetuate the misunderstanding**

Replace the file header (lines 1-4):

```sql
-- Tier-3 / R-16 — RLS isolation on child tables (ownership via a join to the
-- parent). Covers workout_sets, recipe_ingredients, routine_exercises and
-- program_days, plus a catalogue-wide check that no UPDATE policy in public
-- is missing its WITH CHECK.
```

Replace the `routine_exercises` section comment (line 91 before your deletions shift it — find it by text, not by number):

```sql
-- ── routine_exercises (parent routines) ──────────────────────────────────────
```

The old text framed F-2 as having "closed the gap", which repeats the same misreading the whole change exists to correct.

- [ ] **Step 8: Prove the meta-test bites**

A migration that only adds redundancy is otherwise indistinguishable from one that does nothing. Strip the clause back off a single policy and watch the suite go red:

```bash
# against the running local DB
alter policy "Users update own goals" on public.goals using (auth.uid() = user_id);
```

Run `supabase --workdir . test db`. Expected: the meta-test FAILS with `have: 1, want: 0`.

Then restore it (`supabase --workdir . stop && supabase --workdir . start -x …`) and confirm the suite is green again. Record both outputs in your report.

- [ ] **Step 9: Stop the stack and commit**

```bash
supabase --workdir . stop
git add supabase/migrations/20260719120000_r22_update_with_check.sql supabase/tests/02_rls_child.test.sql
git commit -m "fix(rls): give every UPDATE policy an explicit WITH CHECK"
```

---

### Task 2: Retire the claim from the docs

**Files:**
- Modify: `docs/roadmap.md` (two passages: ~826-830 and ~596-600)
- Modify: `docs/data-model.md` (line ~511, and hoist the semantics note out of ~528)
- Modify: `docs/decisions.md` (append `D-F27`)
- Modify: `CLAUDE.md` (the routing line's decision-ID range)

**Interfaces:**
- Consumes: the invariant established in Task 1.
- Produces: nothing.

Four documents currently assert a gap that does not exist, and two of them contradict each other. Find each passage by its text, not by line number — Task 1 does not touch these files, but quoted line numbers age badly.

- [ ] **Step 1: Roadmap — the R-22 follow-up claim**

Replace the bullet under `## R-22` that begins "**RLS hardening follow-up:**":

```markdown
- **RLS hardening follow-up (done, 2026-07-19):** every UPDATE policy in
  `public` now carries an explicit `with check` (migration
  `20260719120000_r22_update_with_check`). This closed no hole — Postgres
  already applies `using` to the new row when `with check` is absent, so the
  older `using`-only policies were never re-pointable. The clause states the
  intent and guards against a future edit that narrows `using` alone. A pgTAP
  assertion over `pg_policies` now fails if a `using`-only UPDATE policy is
  ever added.
```

The old text's parenthetical — "a user could re-point a child row into another user's parent" — was factually wrong under Postgres semantics. Do not preserve it.

- [ ] **Step 2: Roadmap — the R-16 Tier-3 entry**

In the R-16 entry, replace the sentence that ends "…only the R-22 UPDATE WITH-CHECK gap remains as a pgTAP `todo` test (visible, non-failing) so it flips green when fixed." with:

```markdown
  blocked by the pool UPDATE WITH CHECK (now **R-25**). R-25 was fixed (#151,
  migration `20260603120000_r25_hide_drops_ref_only`). The suite carries no
  `todo` tests: the two that tracked the R-22 WITH-CHECK gap were deleted in
  2026-07-19's uniformity pass, having silently *passed* for months.
```

Missing this one leaves the roadmap contradicting itself.

- [ ] **Step 3: Data model — hoist the semantics, fix the contradiction**

Two edits in `docs/data-model.md`, under `## Row-Level Security`.

First, immediately after the line `Every table is RLS-enabled.`, add a standalone statement so it governs every pattern paragraph below instead of hiding inside one of them:

```markdown
**UPDATE policies and `WITH CHECK`.** Under Postgres, an UPDATE policy with no
`WITH CHECK` applies its `USING` expression to the new row as well — an absent
clause is not an open door. Every UPDATE policy in `public` nonetheless carries
both clauses, written identically (`20260719120000_r22_update_with_check`): the
pair states the intent, and it means a future edit that narrows `USING` cannot
silently stop covering the new row. A pgTAP assertion over `pg_policies` keeps
it that way.
```

Second, the paragraph describing `routine_exercises` / `program_days` currently says F-2 "closes this gap" and that `workout_sets` and `recipe_ingredients` carry `using`-only policies with a follow-up noted in R-22. That is now both false and stale — rewrite it to state only that those tables' policies carry both clauses, with no gap language.

Then shorten the trailing explanation in the `recipe_steps` paragraph (it currently carries the full semantics digression) to a pointer back to the new standalone statement, so the explanation lives in exactly one place.

- [ ] **Step 4: Decisions — add `D-F27`**

The highest existing ID is **`D-F26`** (not `D-F24` as CLAUDE.md's routing line claims). Append:

```markdown
## D-F27 — Every UPDATE policy carries an explicit WITH CHECK, though none was missing

**Ruling:** All fourteen `using`-only UPDATE policies in `public` were given a `with check` identical to their `using` (`20260719120000_r22_update_with_check`), and the pgTAP suite gained one assertion over `pg_policies` that fails if a `using`-only UPDATE policy is ever added. The two `todo` blocks that tracked the supposed gap were deleted.

**Why:** the gap never existed. Postgres applies an UPDATE policy's `USING` to the new row when `WITH CHECK` is absent, so the policies were already closed — proven when a reviewer deleted the `with check` from `recipe_steps` during R-36 and the suite stayed green. The `todo` blocks had therefore been *passing* for months, reporting as "unexpectedly succeeded": coverage that read as tracked debt while asserting nothing. The clause is written anyway because implicit protection is one careless `USING` narrowing away from disappearing, and because the next reader should not have to know the subtlety to audit the schema. The label was wrong too — R-22 is Training Routines, closed in May; no roadmap entry ever described this gap.

**Status:** decided · done (`fix(rls): give every UPDATE policy an explicit WITH CHECK`)
```

- [ ] **Step 5: CLAUDE.md — correct the stale ID range**

The routing line reads `docs/decisions.md` (IDs `D-A1…D-F24`). It is two behind before this change and three after. Update it to `D-A1…D-F27`.

- [ ] **Step 6: Verify and commit**

No code changed, so there is nothing to typecheck — but run the suite once more to confirm Task 1 is still green and the tree is clean:

```bash
supabase --workdir . start -x studio,imgproxy,edge-runtime,logflare,vector
supabase --workdir . test db
supabase --workdir . stop
git add docs/roadmap.md docs/data-model.md docs/decisions.md CLAUDE.md
git commit -m "docs: retire the phantom RLS with-check gap"
```

- [ ] **Step 7: Open the PR**

Only once both tasks are green. `develop` auto-merges a `claude/*` PR the moment CI passes, so do not open it while anything is still in flight.

The PR body must say plainly that **this changes no behaviour** — a reviewer seeing fourteen RLS policies altered in a public repo will otherwise reasonably assume it is a security fix. State that the gap never existed, that the value is explicit intent plus the catalogue assertion, and cite the Step 5 verification (`with_check is distinct from qual` returns zero rows) as the evidence.
