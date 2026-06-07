# Catalog Ingestion from free-exercise-db (Project B1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow the shared `exercises` pool from 34 hand-tagged system rows to the full free-exercise-db catalog (873 public-domain exercises), each carrying our fine muscle tags, bilingual names, equipment, and rich metadata (level/mechanic/force/category + image references), plus a group-level muscle filter in the picker.

**Architecture:** A dev-only TypeScript ingest pipeline (mirroring the existing `scripts/whole-foods/` precedent exactly) reads a SHA-pinned vendored copy of `free-exercise-db`, runs a pure unit-tested coarse→fine muscle mapper + low-confidence linter, and emits an idempotent `on conflict (external_id) do update` SQL seed migration. The taxonomy grows 22→24 fine muscles (+neck, +abductors) and equipment 8→12 values; a separate schema migration adds the new columns and widens the equipment/source CHECKs (the original CHECKs are *anonymous table-level* constraints, so the migration drops them by `pg_constraint` introspection, not by a guessed name). The picker's group filter uses the typed `.overlaps()` builder (serializes to `primary_muscles=ov.{…}`). All real-DB verification (migration apply, the `ov`/`cs` operator wire-forms, pgTAP) happens on develop's `db-test` CI because WSL has no Docker/Supabase.

**Tech Stack:** React 18 + Vite + TS SPA → Supabase (Postgres + RLS + PostgREST). pnpm 10, Node 20+. Vitest (Tier-1 pure / Tier-2 jsdom). pgTAP (Tier-3, CI-only). `tsx` runs the dev ingest scripts (not CI, not typechecked, not linted — vitest is the only automated gate on `scripts/**`).

---

## Pre-flight

1. **Branch.** Project A merged to `develop` as PR #155 (`38d4d91`). The worktree `/mnt/d/dev/hudsons-fitness/.claude/worktrees/project-b-catalog` is already rebased onto develop at/after that commit. Create a short-lived branch off the current tip:

   ```bash
   git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/project-b-catalog checkout -b claude/project-b1-catalog-ingestion
   ```

   Ship flow: `claude/*` → PR into `develop` → CI → auto-merge (squash). Never push to `main`/`develop` directly. Conventional commits, **no AI attribution** anywhere.

2. **No local Supabase / Docker in WSL.** `supabase start` needs Docker, which this dev box lacks. Consequence: the **first real-DB run** of the new schema migration, the generated seed migration, every new `*.test.sql` assert, and every new PostgREST `.ov.{…}`/`.cs.{…}` filter string is the **`develop` `db-test` CI job** (`runs-on: ubuntu-latest`, pinned `supabase/setup-cli@v2` `version: 2.101.0`). `pnpm typecheck` and Tier-1 Vitest (mocked) cannot catch a malformed PostgREST filter or a migration-order bug. Treat the CI round-trip as the verification checkpoint for those — locally green ≠ correct for SQL/PostgREST.

3. **Dataset.** `yuhonas/free-exercise-db` — **Unlicense (public domain)**, so vendoring data and image references in our public repo is license-clean. **Pin a specific commit SHA.** Fetch the current default-branch SHA once at the start of **Task 5, Step 1** (the `curl … /commits` call) and use it verbatim everywhere (the README, `build-seed.ts` `PINNED_SHA`, and the image-URL helper base). The plan refers to it as `<PINNED_SHA>`; replace every literal occurrence with the real 40-char SHA you pin. **Treat `873` the same way:** it is "whatever the pinned SHA yields." After fetching, run the count check in Task 5 Step 1 — if the upstream count has drifted from 873, update every hardcoded `873` in this plan's asserts (Task 9 pgTAP, Task 12 line-count, the build-output sanity check) to the actual count rather than forcing 873.

4. **Verify the starting point** before any edits:

   ```bash
   cd /mnt/d/dev/hudsons-fitness/.claude/worktrees/project-b-catalog
   pnpm install
   pnpm lint && pnpm build && pnpm test
   ```

   Expected: all three green (this is the Project-A baseline you build on).

---

## File Structure

**Modified (existing):**
- `src/core/muscles.ts` — +2 `MuscleDef` rows (`neck`, `abductors`); doc-comment 22→24.
- `src/core/muscles.test.ts` — `EXPECTED_FINE` +2 codes; "22"→"24" in test name; +group/slug asserts for the new codes.
- `supabase/migrations/20260604120000_fine_muscle_taxonomy.sql` — append `neck`/`abductors` to the `muscles` INSERT (the anti-drift unit test reads this exact file path). Edited in place (no prod users → reshape allowed).
- `src/i18n/es/entrenamiento.json` / `src/i18n/en/entrenamiento.json` — `exerciseDialog.muscle` +2 keys; `exerciseDialog.equipment` +4 keys; `picker.*` +1 group-filter label.
- `src/features/training/exercises/api.ts` — `Equipment` union 8→12; `EQUIPMENT_VALUES` 8→12.
- `src/core/training.ts` — `incrementByEquipment` +`ez_curl_bar: 1.0`; vocab doc-comment.
- `src/features/training/components/ExercisePicker.tsx` — per-group "<Group> — todos" `<option>` + group→codes overlap filter wiring.
- `src/features/training/exercises/api.test.ts` — **already exists** (Tier-1 supabase-builder mock); extend it with a `searchExercises` group-overlap test (do NOT overwrite).
- `src/features/training/exercises/hooks.ts` — thread `groupMuscles` through `useExerciseSearch`.
- `supabase/tests/05_muscles.test.sql` — 23→25 codes in `set_eq`; new CHECK / unique / seed asserts.
- `package.json` — `"exercises:build"` script.

**Created (new):**
- `supabase/migrations/20260604120100_b1_catalog_schema.sql` — exercises new columns + CHECKs + unique index + widened equipment/source CHECKs (the muscles seed delta lands in the existing taxonomy migration, not here). (Hand-written schema migration; timestamp `> 20260604120000`.)
- `supabase/migrations/20260604120200_b1_catalog_seed.sql` — **generated** 873-row idempotent seed (written by the build script; DO NOT hand-edit).
- `scripts/exercise-catalog/build-seed.ts` — pure exported mapper + linter + `buildRow`; module-private `main()`.
- `scripts/exercise-catalog/build-seed.test.ts` — Tier-1 unit tests (mapper branches, 1:1, linter flags, `buildRow`).
- `scripts/exercise-catalog/exercises.json` — SHA-pinned vendored dataset input (committed).
- `scripts/exercise-catalog/es-names.json` — committed `{ "<external_id>": "<name_es>" }` ES name map (~873 entries).
- `scripts/exercise-catalog/ingest-report.csv` — **generated** low-confidence review report (committed for review trail).
- `scripts/exercise-catalog/README.md` — operator runbook.
- `src/features/training/components/muscleBody.shading.test.ts` — Tier-1 assertion that neck/abductors shade via `codesForBodyRegion` (no render change).
- `src/features/training/components/ExercisePicker.test.tsx` — Tier-2 render test: the per-group "todos/all" option renders (spec §12).

**Out of scope (deferred to B2 / later — do NOT build):** instruction storage/render, image rendering, group-name text search, lay-term aliases, category/equipment/level filters.

---

### Task 1: Extend the fine muscle taxonomy (+neck, +abductors)

**Files:**
- Test: `src/core/muscles.test.ts`
- Modify: `src/core/muscles.ts`

- [ ] **Step 1: Update the failing test first**

Replace the `EXPECTED_FINE` array (lines 12–17) in `src/core/muscles.test.ts` so it lists the 24 shadeable codes:

```ts
const EXPECTED_FINE = [
  'delt_front','delt_side','delt_rear','pec_upper','pec_lower','lat','trap',
  'rhomboids','lower_back','neck','biceps','tri_long','tri_lateral','forearms',
  'abs_upper','abs_lower','obliques','quads','hamstrings','glutes','abductors',
  'adductors','calves','tibialis',
];
```

Rename the first `it(...)` (line 20) from "22 shadeable fine codes" to "24":

```ts
  it('MUSCLE_CODES is exactly the 24 shadeable fine codes (no full_body)', () => {
```

Add a new test inside the `describe('muscles taxonomy', ...)` block, immediately after the `codesForBodyRegion inverts the map` test (after line 43):

```ts
  it('neck and abductors are wired with the right group and slug', () => {
    const neck = MUSCLES.find((m) => m.code === 'neck');
    expect(neck?.group).toBe('back');
    expect(neck?.bodyRegionSlug).toBe('neck');
    expect(neck?.isFullBody).toBe(false);

    const abd = MUSCLES.find((m) => m.code === 'abductors');
    expect(abd?.group).toBe('legs');
    expect(abd?.bodyRegionSlug).toBe('gluteal'); // co-shades on glutes (no abductors art region)
    expect(abd?.isFullBody).toBe(false);
  });

  it('abductors co-shades the gluteal region alongside glutes', () => {
    expect([...codesForBodyRegion('gluteal')].sort()).toEqual(['abductors', 'glutes']);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/core/muscles.test.ts`
Expected: FAIL — `MUSCLE_CODES` is the 22-code set (missing `neck`, `abductors`); the new asserts fail because the codes don't exist yet.

- [ ] **Step 3: Add the two rows + update the doc-comment in `src/core/muscles.ts`**

Insert the `neck` row after the `lower_back` row (line 26) — keeps it in the `back` group block:

```ts
  { code: 'lower_back',  group: 'back',      bodyRegionSlug: 'lower-back', displayOrder: 9,  isFullBody: false },
  { code: 'neck',        group: 'back',      bodyRegionSlug: 'neck',       displayOrder: 23, isFullBody: false },
```

Insert the `abductors` row immediately before the `adductors` row (line 37) — keeps it in the `legs` group block, adjacent to its near-twin:

```ts
  { code: 'abductors',   group: 'legs',      bodyRegionSlug: 'gluteal',    displayOrder: 24, isFullBody: false },
  { code: 'adductors',   group: 'legs',      bodyRegionSlug: 'adductors',  displayOrder: 20, isFullBody: false },
```

(`displayOrder` 23/24 append cleanly without renumbering; `full_body` stays at 99. Group membership — not `displayOrder` — drives optgroup placement via `codesInGroup`, which sorts by `displayOrder`, so `neck` sorts last within `back` and `abductors` last within `legs`. That ordering is acceptable.)

Update the doc-comment on line 43 from `/** The 22 shadeable fine codes (excludes full_body). */` to:

```ts
/** The 24 shadeable fine codes (excludes full_body). */
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/core/muscles.test.ts`
Expected: PASS (all 7 tests, including the new two). Note: the existing "the migration muscles seed matches the canonical taxonomy" test will now FAIL because the migration seed still lists 23 codes — that is expected and fixed in Task 2; do not commit until Task 2 lands. If you must commit Task 1 alone, temporarily expect that single test to fail and note it in the commit body. Preferred: commit Tasks 1+2 together so the suite is green.

- [ ] **Step 5: Stage (commit happens after Task 2)**

```bash
git add src/core/muscles.ts src/core/muscles.test.ts
```

---

### Task 2: DB migration — muscles seed delta + exercises new columns/CHECKs + widened equipment/source CHECKs

**Files:**
- Modify: `supabase/migrations/20260604120000_fine_muscle_taxonomy.sql` (append 2 muscle seed rows — the anti-drift unit test reads this exact path)
- Create: `supabase/migrations/20260604120100_b1_catalog_schema.sql`

- [ ] **Step 1: Append the two muscle rows to the existing taxonomy migration**

The `muscles.test.ts` anti-drift test hardcodes the path `20260604120000_fine_muscle_taxonomy.sql` and parses its `insert into public.muscles … on conflict` block, asserting the seeded codes equal `MUSCLES.map(m => m.code)` (all 25 incl. `full_body`). So the two new codes MUST be added to **this** file's INSERT. No prod users → editing the merged migration in place is sanctioned.

In `supabase/migrations/20260604120000_fine_muscle_taxonomy.sql`, change the `lower_back` and `adductors` VALUES lines (lines 32 and 43) to insert the new rows alongside them (the `on conflict (code) do update` block already makes this idempotent — no other change needed):

```sql
  ('lower_back','back','lower-back',9,false),
  ('neck','back','neck',23,false),
```

and

```sql
  ('abductors','legs','gluteal',24,false),
  ('adductors','legs','adductors',20,false),
```

(Place them to mirror the TS order from Task 1. The trailing `('full_body','full_body',null,99,true)` row and the whole `on conflict … do update set` clause stay exactly as-is.)

- [ ] **Step 2: Run the anti-drift unit test to verify it passes now**

Run: `pnpm test src/core/muscles.test.ts`
Expected: PASS for all 7 tests, including "the migration muscles seed matches the canonical taxonomy" (now 25 codes on both sides).

- [ ] **Step 3: Create the B1 schema migration**

Create `supabase/migrations/20260604120100_b1_catalog_schema.sql` with exactly this content:

```sql
-- Project B1 — catalog ingestion schema (free-exercise-db).
-- Adds the rich-metadata columns the 873-row import needs, widens the equipment
-- and source CHECKs, and adds the external_id unique key the seed upserts on.
-- The data seed lands in a separate generated migration (…_b1_catalog_seed.sql).
-- No production users yet → reshape freely; no backfill.

-- 1) new metadata columns (all nullable except images, which defaults to '{}').
alter table public.exercises
  add column if not exists level       text,
  add column if not exists mechanic    text,
  add column if not exists force       text,
  add column if not exists category    text,
  add column if not exists images      text[] not null default '{}',
  add column if not exists external_id text;

-- 2) idempotency key for the seed upsert (partial — manual rows keep external_id null).
create unique index if not exists idx_exercises_external_id
  on public.exercises (external_id) where external_id is not null;

-- 3) metadata CHECKs (values verified against the dataset, design §2).
alter table public.exercises drop constraint if exists exercises_level_check;
alter table public.exercises add constraint exercises_level_check
  check (level is null or level = any (array['beginner','intermediate','expert']));

alter table public.exercises drop constraint if exists exercises_mechanic_check;
alter table public.exercises add constraint exercises_mechanic_check
  check (mechanic is null or mechanic = any (array['compound','isolation']));

alter table public.exercises drop constraint if exists exercises_force_check;
alter table public.exercises add constraint exercises_force_check
  check (force is null or force = any (array['push','pull','static']));

alter table public.exercises drop constraint if exists exercises_category_check;
alter table public.exercises add constraint exercises_category_check
  check (category is null or category = any (array[
    'strength','stretching','plyometrics','powerlifting',
    'olympic weightlifting','strongman','cardio'
  ]));

-- 4) widen the equipment CHECK 8 -> 12 values.
--    IMPORTANT: the original equipment CHECK is a *table-level anonymous* CHECK
--    inside `create table` (20260522120000_training_exercises.sql lines 40-46).
--    Postgres auto-names table-level CHECKs `exercises_check`, `exercises_check1`,
--    … in declaration order — NOT `exercises_<col>_check` (that form is only for
--    column-inline CHECKs). So `drop constraint if exists exercises_equipment_check`
--    would be a silent no-op and the old 8-value CHECK would survive and reject the
--    seed. We instead introspect pg_constraint and drop the anonymous CHECK whose
--    definition references `equipment`, then add a stably-named replacement.
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'exercises'
      and con.contype = 'c'
      and con.conname <> 'exercises_equipment_check'      -- skip our own (re-runs)
      and pg_get_constraintdef(con.oid) ilike '%equipment%'
  loop
    execute format('alter table public.exercises drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.exercises drop constraint if exists exercises_equipment_check;
alter table public.exercises add constraint exercises_equipment_check
  check (
    equipment is null
    or equipment = any (array[
      'barbell','dumbbell','kettlebell','ez_curl_bar','machine','cable',
      'bodyweight','band','medicine_ball','exercise_ball','foam_roller','other'
    ])
  );

-- 5) widen the source CHECK to allow the import provenance. Same anonymous-CHECK
--    situation as equipment — drop the inline CHECK that references `source` by
--    introspection, then add a stably-named replacement.
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'exercises'
      and con.contype = 'c'
      and con.conname <> 'exercises_source_check'         -- skip our own (re-runs)
      and pg_get_constraintdef(con.oid) ilike '%source%'
  loop
    execute format('alter table public.exercises drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.exercises drop constraint if exists exercises_source_check;
alter table public.exercises add constraint exercises_source_check
  check (source = any (array['manual','system','free-exercise-db']));

-- ── ROLLBACK ─────────────────────────────────────────────────────────────────
-- ROLLBACK:
--   alter table public.exercises drop constraint if exists exercises_level_check;
--   alter table public.exercises drop constraint if exists exercises_mechanic_check;
--   alter table public.exercises drop constraint if exists exercises_force_check;
--   alter table public.exercises drop constraint if exists exercises_category_check;
--   drop index if exists public.idx_exercises_external_id;
--   alter table public.exercises drop column if exists external_id;
--   alter table public.exercises drop column if exists images;
--   alter table public.exercises drop column if exists category;
--   alter table public.exercises drop column if exists force;
--   alter table public.exercises drop column if exists mechanic;
--   alter table public.exercises drop column if exists level;
--   alter table public.exercises drop constraint if exists exercises_source_check;
--   alter table public.exercises add constraint exercises_source_check
--     check (source = any (array['manual','system']));
--   alter table public.exercises drop constraint if exists exercises_equipment_check;
--   alter table public.exercises add constraint exercises_equipment_check
--     check (equipment is null or equipment = any (array[
--       'barbell','dumbbell','kettlebell','machine','cable','bodyweight','band','other']));
-- (Rollback re-adds the narrowed CHECKs under our stable names. The original
--  anonymous names cannot be exactly reproduced and do not need to be — a fresh
--  `supabase start` rebuilds them from the baseline DDL; rollback only matters on
--  a live DB, where the named replacement is equivalent.)
```

Note: the original equipment and source CHECKs were created as **table-level anonymous** CHECKs inside `create table` (training_exercises.sql lines 40-48), so Postgres auto-named them `exercises_check`, `exercises_check1`, `exercises_check2`, `exercises_check3`, `exercises_check4` in declaration order — equipment is `exercises_check2`, source is `exercises_check4`. The `<table>_<col>_check` naming applies ONLY to column-inline CHECKs, so a literal `drop constraint if exists exercises_equipment_check` matches nothing and is a silent no-op (the Project-A migration's `drop constraint if exists exercises_primary_muscle_check` on line 58 has the same latent no-op — it only "works" because line 132 separately drops the whole `primary_muscle` column, cascading the anonymous CHECK away; B1 has no column-drop safety net for equipment/source). The introspection `do $$ … $$` blocks above drop the real anonymous CHECKs by querying `pg_constraint`, then re-add stably-named ones — robust against the exact ordinal and re-runnable. Do not "simplify" them back to a literal `drop … if exists exercises_equipment_check`.

- [ ] **Step 4: Re-run the full Tier-1 suite (no DB locally — this only confirms TS↔migration drift is fixed)**

Run: `pnpm test`
Expected: PASS. (The schema migration itself is not exercised by any Tier-1 test; it first runs on the `db-test` CI. The Task-9 pgTAP asserts are its real gate.)

- [ ] **Step 5: Typecheck + build + commit Tasks 1+2 together**

Run: `pnpm typecheck && pnpm build`
Expected: both green.

```bash
git add src/core/muscles.ts src/core/muscles.test.ts \
  supabase/migrations/20260604120000_fine_muscle_taxonomy.sql \
  supabase/migrations/20260604120100_b1_catalog_schema.sql
git commit -m "feat(training): taxonomy +neck/+abductors and B1 catalog schema (level/mechanic/force/category/images/external_id, widen equipment+source CHECKs)"
```

---

### Task 3: i18n — muscle +neck/+abductors and equipment +4

**Files:**
- Modify: `src/i18n/es/entrenamiento.json`
- Modify: `src/i18n/en/entrenamiento.json`

There is no automated i18n key test, so this task has no failing-test step; correctness is verified by `pnpm build` (JSON parse) and at render time. Match the rendered taxonomy order from Task 1 (neck after lower_back, abductors before adductors).

- [ ] **Step 1: ES muscle keys — add `neck` and `abductors`**

In `src/i18n/es/entrenamiento.json`, in the `exerciseDialog.muscle` block: add `"neck"` after the `"lower_back"` line (line 101), and `"abductors"` before the `"adductors"` line (line 112):

```json
      "lower_back": "Lumbares",
      "neck": "Cuello",
```

```json
      "abductors": "Abductores",
      "adductors": "Aductores",
```

- [ ] **Step 2: EN muscle keys — add `neck` and `abductors`**

In `src/i18n/en/entrenamiento.json`, same positions in `exerciseDialog.muscle`:

```json
      "lower_back": "Lower back",
      "neck": "Neck",
```

```json
      "abductors": "Abductors",
      "adductors": "Adductors",
```

- [ ] **Step 3: ES equipment keys — add the 4 new values before `other`**

In `src/i18n/es/entrenamiento.json`, in `exerciseDialog.equipment`, replace the block so `ez_curl_bar` sits after `kettlebell`, and the three ball/roller values sit before `other` (keeping `other` last as the catch-all):

```json
    "equipment": {
      "barbell": "Barra",
      "dumbbell": "Mancuerna",
      "kettlebell": "Kettlebell",
      "ez_curl_bar": "Barra Z",
      "machine": "Máquina",
      "cable": "Polea",
      "bodyweight": "Peso corporal",
      "band": "Goma",
      "medicine_ball": "Balón medicinal",
      "exercise_ball": "Pelota de ejercicio",
      "foam_roller": "Rodillo de espuma",
      "other": "Otro"
    }
```

- [ ] **Step 4: EN equipment keys — add the 4 new values**

In `src/i18n/en/entrenamiento.json`, in `exerciseDialog.equipment`:

```json
    "equipment": {
      "barbell": "Barbell",
      "dumbbell": "Dumbbell",
      "kettlebell": "Kettlebell",
      "ez_curl_bar": "EZ curl bar",
      "machine": "Machine",
      "cable": "Cable",
      "bodyweight": "Bodyweight",
      "band": "Band",
      "medicine_ball": "Medicine ball",
      "exercise_ball": "Exercise ball",
      "foam_roller": "Foam roller",
      "other": "Other"
    }
```

- [ ] **Step 5: Verify JSON parses + commit**

Run: `pnpm build`
Expected: green (Vite would fail on malformed JSON).

```bash
git add src/i18n/es/entrenamiento.json src/i18n/en/entrenamiento.json
git commit -m "feat(i18n): muscle labels +neck/+abductors and equipment labels +ez_curl_bar/medicine_ball/exercise_ball/foam_roller (ES/EN)"
```

---

### Task 4: api.ts equipment vocabulary 8→12 + increment map

**Files:**
- Modify: `src/features/training/exercises/api.ts:8-27`
- Modify: `src/core/training.ts:361-376`

The order of `Equipment`/`EQUIPMENT_VALUES`/the DB CHECK must agree. Use the same order as the DB CHECK from Task 2: `barbell, dumbbell, kettlebell, ez_curl_bar, machine, cable, bodyweight, band, medicine_ball, exercise_ball, foam_roller, other`.

- [ ] **Step 1: Widen the `Equipment` union and `EQUIPMENT_VALUES`**

In `src/features/training/exercises/api.ts`, replace lines 8–27 with:

```ts
export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'kettlebell'
  | 'ez_curl_bar'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'band'
  | 'medicine_ball'
  | 'exercise_ball'
  | 'foam_roller'
  | 'other';

export const EQUIPMENT_VALUES: Equipment[] = [
  'barbell',
  'dumbbell',
  'kettlebell',
  'ez_curl_bar',
  'machine',
  'cable',
  'bodyweight',
  'band',
  'medicine_ball',
  'exercise_ball',
  'foam_roller',
  'other',
];
```

- [ ] **Step 2: Add the `ez_curl_bar` increment + update the vocab comment**

In `src/core/training.ts`, update the doc-comment on line 365 and add the `ez_curl_bar` entry to `incrementByEquipment` (lines 367–376). The other three new values (`medicine_ball`, `exercise_ball`, `foam_roller`) intentionally have no entry — `suggestIncrementForEquipment` resolves them to `fallbackIncrementKg` (2.5) via `?? fallback`, which is the desired behavior. Replace the comment line and the map:

```ts
   * Vocab: barbell/dumbbell/kettlebell/ez_curl_bar/machine/cable/bodyweight/band/
   * medicine_ball/exercise_ball/foam_roller/other. Values without an explicit
   * entry fall back to fallbackIncrementKg via `?? fallback` (medicine_ball,
   * exercise_ball, foam_roller).
   */
  incrementByEquipment: {
    barbell: 2.5,
    dumbbell: 1.0,
    kettlebell: 4.0, // KBs come in fixed-weight singles (8/12/16/20/24/28/32 kg standard)
    ez_curl_bar: 1.0, // small fixed plates, like dumbbells
    machine: 2.5,
    cable: 2.5, // covers pulley exercises (§0.13)
    bodyweight: 0,
    band: 0,
    other: 2.5,
  } as Record<string, number>,
```

- [ ] **Step 3: Typecheck + build + test**

Run: `pnpm typecheck && pnpm build && pnpm test`
Expected: all green. The `Equipment` union widening is safe: `Tables<'exercises'>['equipment']` is `string | null` (generated, confirmed `src/types/database.ts:156`), so the new values don't fight the generated types. Note `incrementByEquipment` is typed `as Record<string, number>` (not a keyed-by-`Equipment` map), so adding `ez_curl_bar` and omitting the three ball/roller keys both compile — there is no exhaustiveness check forcing all 12 keys; the omission is intentional and resolves via `?? fallback`. The existing `api.test.ts` `suggestIncrementForEquipment` block still passes unchanged (it asserts the 8 original values + null); no new increment test is required.

- [ ] **Step 4: Commit**

```bash
git add src/features/training/exercises/api.ts src/core/training.ts
git commit -m "feat(training): equipment vocabulary 8->12 (ez_curl_bar/medicine_ball/exercise_ball/foam_roller) + ez_curl_bar increment"
```

---

### Task 5: Vendor the dataset + create the ES name map (committed build inputs)

**Files:**
- Create: `scripts/exercise-catalog/exercises.json` (vendored, SHA-pinned)
- Create: `scripts/exercise-catalog/es-names.json` (committed ES name map)

These are committed inputs — there is no code to test here; the build script (Task 6/7) consumes them and the linter (Task 7) flags any record lacking an ES name. Generating them is an operator step.

- [ ] **Step 1: Pin a SHA and fetch the dataset**

Resolve the SHA via `git ls-remote` (no API rate limit, no default-branch
assumption) with an API fallback. The 40-char SHA this records is `<PINNED_SHA>` —
replace every literal `<PINNED_SHA>` in the plan (README Task 8, `PINNED_SHA` in
`build-seed.ts` Task 6) with it.

```bash
cd /mnt/d/dev/hudsons-fitness/.claude/worktrees/project-b-catalog
# Default branch is `main` for this repo; ls-remote avoids API rate limits.
SHA=$(git ls-remote https://github.com/yuhonas/free-exercise-db.git HEAD | cut -f1)
test -n "$SHA" || SHA=$(curl -fsSL https://api.github.com/repos/yuhonas/free-exercise-db/commits/HEAD | python3 -c 'import sys,json;print(json.load(sys.stdin)["sha"])')
echo "PINNED_SHA=$SHA"
mkdir -p scripts/exercise-catalog
curl -fsSL "https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@${SHA}/dist/exercises.json" \
  -o scripts/exercise-catalog/exercises.json
```

(JSON cannot carry a provenance header, so record `<PINNED_SHA>` in the README
(Task 8) and the build script's `PINNED_SHA` constant (Task 6).) Verify the file
parses and report the record count + the distinct equipment strings:

```bash
python3 -c 'import json;d=json.load(open("scripts/exercise-catalog/exercises.json"));print(len(d),"records");print(sorted({e.get("equipment") for e in d}, key=lambda x:(x is None,x)))'
```

Expected: `873 records` and the 12 equipment strings + `None`: `[None, 'bands',
'barbell', 'body only', 'cable', 'dumbbell', 'e-z curl bar', 'exercise ball',
'foam roll', 'kettlebells', 'machine', 'medicine ball', 'other']`. **If the count
is not 873, that's fine — record the actual count and propagate it** to every
hardcoded `873` (Task 9 pgTAP asserts, Task 12 line-count). If any equipment
string is NOT in `EQUIPMENT_MAP` (Task 6), add the mapping before building.

Confirm the dataset's muscle vocabulary matches the mapper. Every distinct
`primaryMuscles`/`secondaryMuscles` value must be either a key in `ONE_TO_ONE`
(Task 6) or one of the four ambiguous coarse codes (`chest`, `shoulders`,
`triceps`, `abdominals`); any other value would silently map to `null` and drop a
tag:

```bash
python3 -c 'import json;d=json.load(open("scripts/exercise-catalog/exercises.json"));one={"abductors","adductors","biceps","calves","forearms","glutes","hamstrings","lats","lower back","middle back","neck","quadriceps","traps"};amb={"chest","shoulders","triceps","abdominals"};vocab=sorted({m for e in d for m in e["primaryMuscles"]+e["secondaryMuscles"]});print("vocab:",vocab);print("UNMAPPED:",[m for m in vocab if m not in one and m not in amb])'
```

Expected: `UNMAPPED: []`. If any value appears (casing/spacing drift), reconcile
`ONE_TO_ONE`/the ambiguous set in Task 6 (and its tests) before trusting the
Task-6 test literals.

Spot-check the `images` relative paths — they must be bare `Dir/N.jpg` with NO
leading `exercises/` prefix (the B2 URL helper supplies that prefix). If any
include the prefix, `imagePaths` (Task 6) must strip it:

```bash
python3 -c 'import json;d=json.load(open("scripts/exercise-catalog/exercises.json"));bad=[p for e in d for p in e.get("images",[]) if p.startswith("exercises/")];print("with-prefix:",len(bad));print([e["images"][:1] for e in d[:3]])'
```

Expected: `with-prefix: 0` and sample paths like `[['Barbell_Curl/0.jpg'], …]`.

- [ ] **Step 2: Generate the ES name map**

`es-names.json` is a committed object keyed by the dataset `id` (which becomes `external_id`): `{ "<id>": "<name_es>", ... }`. Generate it once with LLM assistance, then commit it for review. HOW:

1. Extract `id` + `name` pairs from `exercises.json`:

   ```bash
   python3 -c 'import json;d=json.load(open("scripts/exercise-catalog/exercises.json"));print(json.dumps({e["id"]:e["name"] for e in d}, ensure_ascii=False, indent=2))' > /tmp/en-names.json
   ```

2. Translate each English name to a natural Spanish exercise name (LLM-assisted, reviewed by the operator). Produce `scripts/exercise-catalog/es-names.json` with the **same keys**, Spanish values, 2-space indent, trailing newline, `ensure_ascii=False` (keep accents).
3. **Missing entries are NOT silently shipped** — the build linter (Task 7) emits an `es_missing` flag for any dataset `id` absent from `es-names.json`, and `buildRow` falls back to the English name for `name_es` only when flagged (so the row still imports but is surfaced for review). Aim for full coverage; the report tells you what's left.

Validate the map has the same key set as the dataset and parses:

```bash
python3 -c 'import json;ex={e["id"] for e in json.load(open("scripts/exercise-catalog/exercises.json"))};es=set(json.load(open("scripts/exercise-catalog/es-names.json")));print("dataset",len(ex),"es",len(es),"missing",len(ex-es))'
```

Expected: `missing 0` (or a small number you accept and that the linter will report).

- [ ] **Step 3: Commit the build inputs**

```bash
git add scripts/exercise-catalog/exercises.json scripts/exercise-catalog/es-names.json
git commit -m "chore(catalog): vendor free-exercise-db dataset (SHA-pinned) + ES name map"
```

---

### Task 6: Ingest pipeline — pure mapper + buildRow (TDD, mirrors scripts/whole-foods)

**Files:**
- Create: `scripts/exercise-catalog/build-seed.ts`
- Test: `scripts/exercise-catalog/build-seed.test.ts`

`scripts/**` is NOT typechecked (`tsconfig.json` `include: ["src"]`) and NOT linted (eslint `files: ['src/**/*.{ts,tsx}']`); the **only** automated gate is `scripts/**/*.test.ts` via Vitest (`vitest.config.ts` line 31), Node env, Tier-1 (pure-logic, no DOM/network/Supabase). The test imports only the pure exported surface; `main()` is module-private and gated. Mirror `scripts/whole-foods/build-seed.ts` idioms exactly: `import.meta.dirname` anchoring, `pathToFileURL` run-as-main guard, constant columns in the outer SELECT/INSERT not the per-row tuple, hardcoded output migration path, `console.log` count+path on completion.

- [ ] **Step 1: Write the failing test**

Create `scripts/exercise-catalog/build-seed.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  mapEquipment,
  mapFineMuscle,
  imagePaths,
  buildRow,
  type RawExercise,
} from './build-seed';

// ── equipment map (§5, 1:1 lossless) ──────────────────────────────────────────
describe('mapEquipment', () => {
  it('maps each dataset value to ours', () => {
    expect(mapEquipment('body only')).toBe('bodyweight');
    expect(mapEquipment('bands')).toBe('band');
    expect(mapEquipment('kettlebells')).toBe('kettlebell');
    expect(mapEquipment('e-z curl bar')).toBe('ez_curl_bar');
    expect(mapEquipment('medicine ball')).toBe('medicine_ball');
    expect(mapEquipment('exercise ball')).toBe('exercise_ball');
    expect(mapEquipment('foam roll')).toBe('foam_roller');
    expect(mapEquipment('barbell')).toBe('barbell');
    expect(mapEquipment('dumbbell')).toBe('dumbbell');
    expect(mapEquipment('cable')).toBe('cable');
    expect(mapEquipment('machine')).toBe('machine');
    expect(mapEquipment('other')).toBe('other');
  });
  it('returns null for missing equipment', () => {
    expect(mapEquipment(null)).toBeNull();
  });
});

// ── fine-muscle map (§7) ──────────────────────────────────────────────────────
describe('mapFineMuscle', () => {
  it('1:1 maps pass straight through', () => {
    expect(mapFineMuscle('biceps', 'Barbell Curl')).toBe('biceps');
    expect(mapFineMuscle('lats', 'Pull-up')).toBe('lat');
    expect(mapFineMuscle('lower back', 'Good Morning')).toBe('lower_back');
    expect(mapFineMuscle('middle back', 'Seated Row')).toBe('rhomboids');
    expect(mapFineMuscle('quadriceps', 'Leg Extension')).toBe('quads');
    expect(mapFineMuscle('traps', 'Shrug')).toBe('trap');
    expect(mapFineMuscle('neck', 'Neck Curl')).toBe('neck');
    expect(mapFineMuscle('abductors', 'Hip Abduction')).toBe('abductors');
    expect(mapFineMuscle('adductors', 'Hip Adduction')).toBe('adductors');
    expect(mapFineMuscle('calves', 'Calf Raise')).toBe('calves');
    expect(mapFineMuscle('forearms', 'Wrist Curl')).toBe('forearms');
    expect(mapFineMuscle('glutes', 'Hip Thrust')).toBe('glutes');
    expect(mapFineMuscle('hamstrings', 'Leg Curl')).toBe('hamstrings');
  });

  it('chest disambiguates by incline/decline, else pec_lower', () => {
    expect(mapFineMuscle('chest', 'Incline Bench Press')).toBe('pec_upper');
    expect(mapFineMuscle('chest', 'Decline Bench Press')).toBe('pec_lower');
    expect(mapFineMuscle('chest', 'Bench Press')).toBe('pec_lower');
  });

  it('shoulders disambiguates by keyword, else delt_side', () => {
    expect(mapFineMuscle('shoulders', 'Dumbbell Lateral Raise')).toBe('delt_side');
    expect(mapFineMuscle('shoulders', 'Lateral To Front Raise')).toBe('delt_side');
    expect(mapFineMuscle('shoulders', 'Reverse Fly')).toBe('delt_rear');
    expect(mapFineMuscle('shoulders', 'Rear Delt Raise')).toBe('delt_rear');
    expect(mapFineMuscle('shoulders', 'Face Pull')).toBe('delt_rear');
    expect(mapFineMuscle('shoulders', 'Front Raise')).toBe('delt_front');
    expect(mapFineMuscle('shoulders', 'Overhead Press')).toBe('delt_front');
    expect(mapFineMuscle('shoulders', 'Military Press')).toBe('delt_front');
    expect(mapFineMuscle('shoulders', 'Arnold Press')).toBe('delt_front');
    expect(mapFineMuscle('shoulders', 'Cable Shoulder Thing')).toBe('delt_side');
  });

  it('triceps disambiguates by keyword, else tri_lateral', () => {
    expect(mapFineMuscle('triceps', 'Overhead Triceps Extension')).toBe('tri_long');
    expect(mapFineMuscle('triceps', 'Skullcrusher')).toBe('tri_long');
    expect(mapFineMuscle('triceps', 'French Press')).toBe('tri_long');
    expect(mapFineMuscle('triceps', 'Lying Triceps Press')).toBe('tri_long');
    expect(mapFineMuscle('triceps', 'Triceps Pushdown')).toBe('tri_lateral');
    expect(mapFineMuscle('triceps', 'Triceps Kickback')).toBe('tri_lateral');
    expect(mapFineMuscle('triceps', 'Bench Dip')).toBe('tri_lateral');
    expect(mapFineMuscle('triceps', 'Cable Triceps Thing')).toBe('tri_lateral');
  });

  it('abdominals disambiguates lower vs upper', () => {
    expect(mapFineMuscle('abdominals', 'Hanging Leg Raise')).toBe('abs_lower');
    expect(mapFineMuscle('abdominals', 'Reverse Crunch')).toBe('abs_lower');
    expect(mapFineMuscle('abdominals', 'Hanging Knee Raise')).toBe('abs_lower');
    expect(mapFineMuscle('abdominals', 'Crunch')).toBe('abs_upper');
    expect(mapFineMuscle('abdominals', 'Cable Crunch')).toBe('abs_upper');
  });

  it('returns null for an unknown coarse code', () => {
    expect(mapFineMuscle('bogus', 'Whatever')).toBeNull();
  });
});

// ── image relative paths (§6) ─────────────────────────────────────────────────
describe('imagePaths', () => {
  it('passes the dataset relative paths through verbatim', () => {
    expect(imagePaths(['Barbell_Curl/0.jpg', 'Barbell_Curl/1.jpg'])).toEqual([
      'Barbell_Curl/0.jpg',
      'Barbell_Curl/1.jpg',
    ]);
  });
  it('tolerates a missing images array', () => {
    expect(imagePaths(undefined)).toEqual([]);
  });
});

// ── buildRow (the seed VALUES tuple) ──────────────────────────────────────────
const raw: RawExercise = {
  id: 'Barbell_Curl',
  name: 'Barbell Curl',
  force: 'pull',
  level: 'beginner',
  mechanic: 'isolation',
  equipment: 'barbell',
  primaryMuscles: ['biceps'],
  secondaryMuscles: ['forearms'],
  category: 'strength',
  images: ['Barbell_Curl/0.jpg', 'Barbell_Curl/1.jpg'],
};

describe('buildRow', () => {
  it('emits a data-only VALUES tuple with ES name, fine tags, arrays, escaped quotes', () => {
    expect(buildRow(raw, 'Curl con barra')).toBe(
      "  ('Curl con barra', 'Barbell Curl', array['biceps'], array['forearms'], " +
        "'barbell', 'beginner', 'isolation', 'pull', 'strength', " +
        "array['Barbell_Curl/0.jpg','Barbell_Curl/1.jpg'], 'Barbell_Curl')",
    );
  });

  it('escapes single quotes in names and emits empty arrays/nulls correctly', () => {
    const r: RawExercise = {
      id: "Farmer's_Walk",
      name: "Farmer's Walk",
      force: null,
      level: 'beginner',
      mechanic: null,
      equipment: null,
      primaryMuscles: ['forearms'],
      secondaryMuscles: [],
      category: 'strongman',
      images: [],
    };
    expect(buildRow(r, "Paseo del granjero")).toBe(
      "  ('Paseo del granjero', 'Farmer''s Walk', array['forearms'], array[]::text[], " +
        "null, 'beginner', null, null, 'strongman', array[]::text[], 'Farmer''s_Walk')",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test scripts/exercise-catalog/build-seed.test.ts`
Expected: FAIL — `./build-seed` does not exist / exports undefined.

- [ ] **Step 3: Write the pure mapper + buildRow (linter + main come in Task 7)**

Create `scripts/exercise-catalog/build-seed.ts`:

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// free-exercise-db pinned at <PINNED_SHA> (Unlicense). Images served via jsDelivr;
// only the relative path is stored — the URL helper (B2) builds the full CDN URL:
//   https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@<PINNED_SHA>/exercises/<path>
export const PINNED_SHA = '<PINNED_SHA>';

export interface RawExercise {
  id: string;
  name: string;
  force: string | null;
  level: string;
  mechanic: string | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  category: string;
  images?: string[];
  instructions?: string[]; // present in source, deferred to B2 — not imported in B1
}

// ── equipment map (§5): dataset string -> our snake_case value, 1:1 lossless ──
const EQUIPMENT_MAP: Record<string, string> = {
  'body only': 'bodyweight',
  bands: 'band',
  kettlebells: 'kettlebell',
  'e-z curl bar': 'ez_curl_bar',
  'medicine ball': 'medicine_ball',
  'exercise ball': 'exercise_ball',
  'foam roll': 'foam_roller',
  barbell: 'barbell',
  dumbbell: 'dumbbell',
  cable: 'cable',
  machine: 'machine',
  other: 'other',
};

export function mapEquipment(eq: string | null): string | null {
  if (eq == null) return null;
  return EQUIPMENT_MAP[eq] ?? null;
}

// ── 1:1 coarse -> fine maps (§7) ──────────────────────────────────────────────
const ONE_TO_ONE: Record<string, string> = {
  abductors: 'abductors',
  adductors: 'adductors',
  biceps: 'biceps',
  calves: 'calves',
  forearms: 'forearms',
  glutes: 'glutes',
  hamstrings: 'hamstrings',
  lats: 'lat',
  'lower back': 'lower_back',
  'middle back': 'rhomboids',
  neck: 'neck',
  quadriceps: 'quads',
  traps: 'trap',
};

// ── the four ambiguous coarse codes — disambiguate by name keyword (§7) ───────
// NOTE: keyword precedence follows the §7 rule order. Because checks are ordered,
// a confident-but-wrong hit is possible (e.g. a name containing both "lateral"
// and "rear" returns delt_side — "lateral" is tested first per §7). Such rows do
// NOT trip the linter's `ambiguous_default` flag (they hit a branch, not the
// else-default), so they ship is_verified=false but unflagged. This is the
// accepted §7/§8 approximation; see the README caveat.
function mapChest(name: string): string {
  if (name.includes('incline')) return 'pec_upper';
  if (name.includes('decline')) return 'pec_lower';
  return 'pec_lower';
}
function mapShoulders(name: string): string {
  if (name.includes('lateral')) return 'delt_side';
  if (name.includes('rear') || name.includes('reverse') || name.includes('face pull')) {
    return 'delt_rear';
  }
  if (
    name.includes('front raise') ||
    name.includes('press') ||
    name.includes('overhead') ||
    name.includes('military')
  ) {
    return 'delt_front';
  }
  return 'delt_side';
}
function mapTriceps(name: string): string {
  if (
    name.includes('overhead') ||
    name.includes('skull') ||
    name.includes('french') ||
    name.includes('lying')
  ) {
    return 'tri_long';
  }
  if (name.includes('pushdown') || name.includes('kickback') || name.includes('dip')) {
    return 'tri_lateral';
  }
  return 'tri_lateral';
}
function mapAbdominals(name: string): string {
  if (name.includes('leg raise') || name.includes('reverse') || name.includes('hanging')) {
    return 'abs_lower';
  }
  return 'abs_upper';
}

/** Maps one dataset coarse muscle to our fine code, using the exercise name for
 *  the four ambiguous codes. Returns null for an unrecognized coarse code. */
export function mapFineMuscle(coarse: string, exerciseName: string): string | null {
  const name = exerciseName.toLowerCase();
  switch (coarse) {
    case 'chest':
      return mapChest(name);
    case 'shoulders':
      return mapShoulders(name);
    case 'triceps':
      return mapTriceps(name);
    case 'abdominals':
      return mapAbdominals(name);
    default:
      return ONE_TO_ONE[coarse] ?? null;
  }
}

/** Image relative paths pass through verbatim (host decoupled — §6). */
export function imagePaths(images: string[] | undefined): string[] {
  return images ?? [];
}

// ── SQL emission helpers ──────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/'/g, "''");
const sqlText = (s: string | null) => (s == null ? 'null' : `'${esc(s)}'`);
const sqlTextArray = (xs: string[]) =>
  xs.length === 0 ? `array[]::text[]` : `array[${xs.map((x) => `'${esc(x)}'`).join(',')}]`;

/** One generated VALUES tuple. Constant columns (is_verified/source/created_by)
 *  live in the migration footer's SELECT-less VALUES list cast — see Task 7 —
 *  so they are NOT part of this tuple. `nameEs` is the reviewed ES name (falls
 *  back to the English name upstream when es-names.json lacks the id). */
export function buildRow(raw: RawExercise, nameEs: string): string {
  const primary = raw.primaryMuscles
    .map((m) => mapFineMuscle(m, raw.name))
    .filter((c): c is string => c != null);
  const secondary = raw.secondaryMuscles
    .map((m) => mapFineMuscle(m, raw.name))
    .filter((c): c is string => c != null);
  return (
    `  (${sqlText(nameEs)}, ${sqlText(raw.name)}, ` +
    `${sqlTextArray(primary)}, ${sqlTextArray(secondary)}, ` +
    `${sqlText(mapEquipment(raw.equipment))}, ${sqlText(raw.level)}, ` +
    `${sqlText(raw.mechanic)}, ${sqlText(raw.force)}, ${sqlText(raw.category)}, ` +
    `${sqlTextArray(imagePaths(raw.images))}, ${sqlText(raw.id)})`
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test scripts/exercise-catalog/build-seed.test.ts`
Expected: PASS (all describe blocks). If `buildRow` string mismatches, the assertion prints the exact diff — fix the emission, not the test.

- [ ] **Step 5: Commit**

```bash
git add scripts/exercise-catalog/build-seed.ts scripts/exercise-catalog/build-seed.test.ts
git commit -m "feat(catalog): pure coarse->fine muscle mapper, equipment map, image paths, buildRow (Tier-1)"
```

---

### Task 7: Ingest pipeline — linter + main() + emit the seed migration

**Files:**
- Modify: `scripts/exercise-catalog/build-seed.ts` (add linter + `main()` + run-guard)
- Modify: `scripts/exercise-catalog/build-seed.test.ts` (add linter tests)
- Modify: `package.json` (add the `exercises:build` script)
- Create (generated by running the script): `supabase/migrations/20260604120200_b1_catalog_seed.sql`, `scripts/exercise-catalog/ingest-report.csv`

The linter (design §8) flags only **low-confidence** rows for human review. Flag conditions: ambiguous-default hit (chest/shoulders/triceps/abdominals fell through to the `else`), big compound (≥4 secondaries — a co-primary-promotion candidate), sanity mismatch (name contains "curl" but no `biceps` primary/secondary), empty `primary_muscles` on a non-cardio/non-stretching exercise, and missing ES name. The linter is pure and unit-tested.

- [ ] **Step 1: Add the failing linter tests**

Append to `scripts/exercise-catalog/build-seed.test.ts` (add `lintRow` to the import on line 2):

```ts
import { lintRow } from './build-seed';

describe('lintRow', () => {
  const base: RawExercise = {
    id: 'X', name: 'Cable Crunch', force: null, level: 'beginner',
    mechanic: 'isolation', equipment: 'cable', primaryMuscles: ['abdominals'],
    secondaryMuscles: [], category: 'strength', images: [],
  };

  it('flags an ambiguous default (chest with no incline/decline keyword)', () => {
    const flags = lintRow({ ...base, name: 'Bench Press', primaryMuscles: ['chest'] }, 'Press de banca');
    expect(flags).toContain('ambiguous_default');
  });
  it('does NOT flag chest when the keyword is explicit', () => {
    const flags = lintRow({ ...base, name: 'Incline Bench Press', primaryMuscles: ['chest'] }, 'Press inclinado');
    expect(flags).not.toContain('ambiguous_default');
  });
  it('flags a big compound (>=4 secondaries)', () => {
    const flags = lintRow(
      { ...base, name: 'Deadlift', primaryMuscles: ['lower back'],
        secondaryMuscles: ['hamstrings', 'glutes', 'quadriceps', 'traps', 'forearms'] },
      'Peso muerto',
    );
    expect(flags).toContain('big_compound');
  });
  it('flags a curl with no biceps', () => {
    const flags = lintRow({ ...base, name: 'Leg Curl', primaryMuscles: ['hamstrings'] }, 'Curl femoral');
    expect(flags).toContain('curl_no_biceps');
  });
  it('does NOT flag a biceps curl', () => {
    const flags = lintRow({ ...base, name: 'Barbell Curl', primaryMuscles: ['biceps'] }, 'Curl con barra');
    expect(flags).not.toContain('curl_no_biceps');
  });
  it('flags empty primaries on a strength exercise', () => {
    const flags = lintRow({ ...base, name: 'Foam Roll IT-Band', primaryMuscles: [], category: 'strength' }, 'Rodillo');
    expect(flags).toContain('empty_primary');
  });
  it('does NOT flag empty primaries on stretching/cardio', () => {
    const stretch = lintRow({ ...base, name: 'Calf Stretch', primaryMuscles: [], category: 'stretching' }, 'Estiramiento');
    expect(stretch).not.toContain('empty_primary');
    const cardio = lintRow({ ...base, name: 'Rowing', primaryMuscles: [], category: 'cardio' }, 'Remo');
    expect(cardio).not.toContain('empty_primary');
  });
  it('flags a missing ES name (empty string passed)', () => {
    const flags = lintRow({ ...base, name: 'Barbell Curl', primaryMuscles: ['biceps'] }, '');
    expect(flags).toContain('es_missing');
  });
  it('returns no flags for a clean row', () => {
    expect(lintRow({ ...base, name: 'Barbell Curl', primaryMuscles: ['biceps'] }, 'Curl con barra')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test scripts/exercise-catalog/build-seed.test.ts`
Expected: FAIL — `lintRow` is not exported.

- [ ] **Step 3: Add `lintRow`, `main()`, the migration header/footer, and the run-guard to `build-seed.ts`**

Append to `scripts/exercise-catalog/build-seed.ts`:

```ts
// ── low-confidence linter (§8). Returns the flags that fired for one row. ─────
const AMBIGUOUS_COARSE = new Set(['chest', 'shoulders', 'triceps', 'abdominals']);

/** True when an ambiguous coarse code fell through to its `else` default. */
function hitAmbiguousDefault(raw: RawExercise): boolean {
  const name = raw.name.toLowerCase();
  for (const coarse of raw.primaryMuscles) {
    if (!AMBIGUOUS_COARSE.has(coarse)) continue;
    if (coarse === 'chest' && !name.includes('incline') && !name.includes('decline')) return true;
    if (
      coarse === 'shoulders' &&
      !name.includes('lateral') &&
      !name.includes('rear') &&
      !name.includes('reverse') &&
      !name.includes('face pull') &&
      !name.includes('front raise') &&
      !name.includes('press') &&
      !name.includes('overhead') &&
      !name.includes('military')
    ) {
      return true;
    }
    if (
      coarse === 'triceps' &&
      !name.includes('overhead') &&
      !name.includes('skull') &&
      !name.includes('french') &&
      !name.includes('lying') &&
      !name.includes('pushdown') &&
      !name.includes('kickback') &&
      !name.includes('dip')
    ) {
      return true;
    }
    if (
      coarse === 'abdominals' &&
      !name.includes('leg raise') &&
      !name.includes('reverse') &&
      !name.includes('hanging')
    ) {
      return true;
    }
  }
  return false;
}

export function lintRow(raw: RawExercise, nameEs: string): string[] {
  const flags: string[] = [];
  const name = raw.name.toLowerCase();
  const primary = raw.primaryMuscles
    .map((m) => mapFineMuscle(m, raw.name))
    .filter((c): c is string => c != null);
  const secondary = raw.secondaryMuscles
    .map((m) => mapFineMuscle(m, raw.name))
    .filter((c): c is string => c != null);

  if (hitAmbiguousDefault(raw)) flags.push('ambiguous_default');
  if (secondary.length >= 4) flags.push('big_compound');
  if (name.includes('curl') && !primary.includes('biceps') && !secondary.includes('biceps')) {
    flags.push('curl_no_biceps');
  }
  if (primary.length === 0 && raw.category !== 'cardio' && raw.category !== 'stretching') {
    flags.push('empty_primary');
  }
  if (nameEs.trim() === '') flags.push('es_missing');
  return flags;
}

// ── SQL migration header/footer (constant columns in the outer INSERT, not the
//    per-row VALUES tuple — mirrors the whole-foods precedent to avoid VALUES
//    type-inference on null::uuid). ────────────────────────────────────────────
const MIGRATION_HEADER = `-- Project B1 step 2/2 — free-exercise-db catalog seed (873 exercises).
-- Generated by scripts/exercise-catalog/build-seed.ts from the SHA-pinned
-- scripts/exercise-catalog/exercises.json + es-names.json. DO NOT hand-edit —
-- re-run \`pnpm exercises:build\`. Idempotent: on conflict (external_id) do update.
-- Every imported row is is_verified=false, source='free-exercise-db'.

insert into public.exercises
  (name_es, name_en, primary_muscles, secondary_muscles, equipment, level,
   mechanic, force, category, images, external_id, is_verified, source,
   created_by_user_id)
select v.name_es, v.name_en, v.primary_muscles, v.secondary_muscles, v.equipment,
       v.level, v.mechanic, v.force, v.category, v.images, v.external_id,
       false, 'free-exercise-db', null
from (values
`;

const MIGRATION_FOOTER = `
) as v(name_es, name_en, primary_muscles, secondary_muscles, equipment, level,
       mechanic, force, category, images, external_id)
-- DELIBERATELY does NOT update is_verified / source / created_by_user_id: a
-- re-run must preserve operator-flipped is_verified=true on reviewed rows. Do
-- NOT add \`is_verified = excluded.is_verified\` — that would silently un-verify
-- every reviewed row on the next build.
on conflict (external_id) do update set
  name_es = excluded.name_es, name_en = excluded.name_en,
  primary_muscles = excluded.primary_muscles,
  secondary_muscles = excluded.secondary_muscles,
  equipment = excluded.equipment, level = excluded.level,
  mechanic = excluded.mechanic, force = excluded.force,
  category = excluded.category, images = excluded.images;
`;

async function main(): Promise<void> {
  const dir = resolve(import.meta.dirname);
  const raws = JSON.parse(
    readFileSync(resolve(dir, 'exercises.json'), 'utf8'),
  ) as RawExercise[];
  const esNames = JSON.parse(
    readFileSync(resolve(dir, 'es-names.json'), 'utf8'),
  ) as Record<string, string>;

  const rows: string[] = [];
  const report: string[] = ['external_id,name_en,name_es,primary_fine,secondary_count,flags'];

  for (const raw of raws) {
    const nameEs = (esNames[raw.id] ?? '').trim() || raw.name; // fallback to EN, flagged below
    const flags = lintRow(raw, esNames[raw.id] ?? '');
    rows.push(buildRow(raw, nameEs));
    if (flags.length > 0) {
      const primary = raw.primaryMuscles
        .map((m) => mapFineMuscle(m, raw.name))
        .filter((c): c is string => c != null)
        .join('|');
      const csvEsc = (s: string) => `"${s.replace(/"/g, '""')}"`;
      report.push(
        [
          csvEsc(raw.id),
          csvEsc(raw.name),
          csvEsc(nameEs),
          csvEsc(primary),
          String(raw.secondaryMuscles.length),
          csvEsc(flags.join('|')),
        ].join(','),
      );
    }
  }

  const sql = MIGRATION_HEADER + rows.join(',\n') + MIGRATION_FOOTER;
  const outSql = resolve(dir, '../../supabase/migrations/20260604120200_b1_catalog_seed.sql');
  writeFileSync(outSql, sql);
  const outCsv = resolve(dir, 'ingest-report.csv');
  writeFileSync(outCsv, report.join('\n') + '\n');
  console.log(`wrote ${rows.length} rows -> ${outSql}`);
  console.log(`flagged ${report.length - 1} low-confidence rows -> ${outCsv}`);
}

// Run main() only when invoked directly, never on import (keeps the test pure).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test scripts/exercise-catalog/build-seed.test.ts`
Expected: PASS (mapper + linter + buildRow blocks).

- [ ] **Step 5: Add the build script to package.json**

In `package.json`, add the line after the `whole-foods:build` script (line 17), keeping valid JSON:

```json
    "whole-foods:build": "tsx scripts/whole-foods/build-seed.ts",
    "exercises:build": "tsx scripts/exercise-catalog/build-seed.ts"
```

- [ ] **Step 6: Run the build to generate the seed migration + report**

Run: `pnpm exercises:build`
Expected output (counts will vary with ES coverage):

```
wrote 873 rows -> .../supabase/migrations/20260604120200_b1_catalog_seed.sql
flagged NNN low-confidence rows -> .../scripts/exercise-catalog/ingest-report.csv
```

Sanity-check the generated SQL: it begins with the header, has 873 `(...)` tuples joined by `,\n`, and ends with the `on conflict (external_id) do update set …;` footer:

```bash
grep -c "external_id" supabase/migrations/20260604120200_b1_catalog_seed.sql   # >= 1 (footer + per-row none)
python3 -c 'import re;s=open("supabase/migrations/20260604120200_b1_catalog_seed.sql").read();print("tuples", s.count("\n  ("))'
```

Expected: `tuples 873`.

- [ ] **Step 7: Operator review of the report, then commit**

Review `scripts/exercise-catalog/ingest-report.csv` — this is the low-confidence subset for human review (NOT all 873). Address any `es_missing` rows by filling `es-names.json` and re-running `pnpm exercises:build`. The user later flips reviewed rows to `is_verified=true` post-merge; that is out of B1 scope. Commit the generated artifacts + the script change:

```bash
git add scripts/exercise-catalog/build-seed.ts scripts/exercise-catalog/build-seed.test.ts \
  scripts/exercise-catalog/ingest-report.csv package.json \
  supabase/migrations/20260604120200_b1_catalog_seed.sql
git commit -m "feat(catalog): linter + seed generator; generate 873-row idempotent catalog seed migration"
```

---

### Task 8: Ingest README (operator runbook)

**Files:**
- Create: `scripts/exercise-catalog/README.md`

- [ ] **Step 1: Write the README**

Create `scripts/exercise-catalog/README.md`:

```markdown
# Exercise catalog seed (Project B1)

Ingests the public-domain **free-exercise-db** (`yuhonas/free-exercise-db`,
Unlicense) into our shared `exercises` pool. Dev-only build — NOT run in CI; the
committed artifacts (the generated seed migration, `es-names.json`, and
`ingest-report.csv`) are what gets reviewed and shipped.

**Dataset pin:** `exercises.json` is vendored from
`cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@<PINNED_SHA>/dist/exercises.json`.
Images are served from the same SHA via jsDelivr; only relative paths are stored
(`exercises.images text[]`), and the full URL is built by the B2 helper:
`https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@<PINNED_SHA>/exercises/<path>`.

1. Vendor the dataset at a pinned SHA into `exercises.json` (873 records). Record
   the SHA here, in `build-seed.ts` `PINNED_SHA`, and as the image-URL base.
2. Generate/maintain `es-names.json` — `{ "<dataset id>": "<name_es>" }`, same
   keys as the dataset. LLM-assisted, operator-reviewed. A record with no ES
   entry is **flagged** (`es_missing`) by the linter and falls back to the English
   name for `name_es` — it is NOT silently shipped; fill it and re-run.
3. Build: `pnpm exercises:build` — runs the pure mapper (§7), the low-confidence
   linter (§8), writes `ingest-report.csv`, and emits the idempotent seed
   migration `supabase/migrations/20260604120200_b1_catalog_seed.sql`.
4. Review `ingest-report.csv` (the low-confidence subset only — ambiguous
   defaults, big compounds, curl-without-biceps, empty primaries, missing ES).
   Fix inputs and re-run as needed. Spot-check ~10 generated rows, then commit
   `exercises.json`, `es-names.json`, `ingest-report.csv`, and the migration.

**Mapper accuracy caveat.** The four ambiguous coarse codes (chest/shoulders/
triceps/abdominals) disambiguate by name keyword in a fixed precedence order
(§7). A name that matches an earlier keyword wins even if a later one is more
correct (e.g. "lateral" is tested before "rear"), so a confident-but-wrong fine
tag can ship. These rows do NOT trip `ambiguous_default` (they hit a branch, not
the else-default) and so are not necessarily in `ingest-report.csv` — they ride
the general `is_verified=false` review flow instead. Accepted per §7/§8.

Mapper + linter logic is pure and unit-tested in `build-seed.test.ts` (Tier-1,
the only automated gate on `scripts/**`). `scripts/**` is not typechecked or
linted by the repo's `pnpm typecheck`/`pnpm lint`.
```

- [ ] **Step 2: Commit**

```bash
git add scripts/exercise-catalog/README.md
git commit -m "docs(catalog): exercise-catalog ingest runbook"
```

---

### Task 9: Tier-3 pgTAP — 25 codes + new CHECKs + external_id unique + post-seed asserts

**Files:**
- Modify: `supabase/tests/05_muscles.test.sql`

This is the real gate for the schema migration, the widened CHECKs, and the seed. It runs ONLY on the `db-test` CI job (`supabase start` applies the full migration history from zero, then `supabase test db` runs `supabase/tests/*.test.sql`). There is no local run; verify on develop CI. Keep every new function `SECURITY INVOKER` (this task adds no functions) and preserve the existing wrapper (`begin; / no_plan(); / … / finish(); / rollback;`).

- [ ] **Step 1: Update the muscle set_eq to 25 codes**

In `supabase/tests/05_muscles.test.sql`, the comment to change is line 7 (currently `-- 23 codes seeded (22 shadeable + full_body), exactly matching src/core/muscles.ts.`) and the `set_eq` `values` list spans lines 10–14 (currently 23 codes). Replace the comment + the whole `select set_eq( … );` block to include `neck` and `abductors` (place to mirror `src/core/muscles.ts`):

```sql
-- 25 codes seeded (24 shadeable + full_body), exactly matching src/core/muscles.ts.
select set_eq(
  $$ select code from public.muscles $$,
  $$ values ('delt_front'),('delt_side'),('delt_rear'),('pec_upper'),('pec_lower'),
            ('lat'),('trap'),('rhomboids'),('lower_back'),('neck'),('biceps'),
            ('tri_long'),('tri_lateral'),('forearms'),('abs_upper'),('abs_lower'),
            ('obliques'),('quads'),('hamstrings'),('glutes'),('abductors'),
            ('adductors'),('calves'),('tibialis'),('full_body') $$,
  'muscles seed == src/core/muscles.ts code set'
);
```

- [ ] **Step 2: Add the catalog-schema asserts before `select * from finish();`**

Insert this block immediately before `select * from finish();` (line 38 in the current file). These asserts use the same idioms already in the file (`throws_ok` 2-arg, `is` scalar-subquery `::int`, plain `insert` for the accept-path which auto-rolls-back at `rollback;`):

```sql
-- ── B1 catalog schema ─────────────────────────────────────────────────────────

-- equipment CHECK accepts all 12 values (a single multi-row insert; rolls back).
insert into public.exercises (name_es, equipment) values
  ('eq1','barbell'),('eq2','dumbbell'),('eq3','kettlebell'),('eq4','ez_curl_bar'),
  ('eq5','machine'),('eq6','cable'),('eq7','bodyweight'),('eq8','band'),
  ('eq9','medicine_ball'),('eq10','exercise_ball'),('eq11','foam_roller'),('eq12','other');
select is(
  (select count(*)::int from public.exercises where name_es like 'eq%'),
  12, 'equipment CHECK accepts all 12 values');

-- equipment CHECK rejects a bogus value.
select throws_ok(
  $$ insert into public.exercises (name_es, equipment) values ('bad','sledgehammer') $$,
  '23514');  -- check_violation

-- level / mechanic / force / category CHECKs reject bogus values.
select throws_ok(
  $$ insert into public.exercises (name_es, level) values ('bad','novice') $$, '23514');
select throws_ok(
  $$ insert into public.exercises (name_es, mechanic) values ('bad','hybrid') $$, '23514');
select throws_ok(
  $$ insert into public.exercises (name_es, force) values ('bad','twist') $$, '23514');
select throws_ok(
  $$ insert into public.exercises (name_es, category) values ('bad','calisthenics') $$, '23514');

-- level / category accept verified values.
insert into public.exercises (name_es, level, category) values ('ok1','expert','olympic weightlifting');
select is(
  (select count(*)::int from public.exercises where name_es = 'ok1'),
  1, 'level=expert + category=olympic weightlifting accepted');

-- external_id is unique (partial index — the second insert must throw 23505).
insert into public.exercises (name_es, external_id) values ('ux1','dup_ext');
select throws_ok(
  $$ insert into public.exercises (name_es, external_id) values ('ux2','dup_ext') $$,
  '23505');  -- unique_violation

-- source CHECK now allows the import provenance.
insert into public.exercises (name_es, source) values ('src1','free-exercise-db');
select is(
  (select source from public.exercises where name_es = 'src1'),
  'free-exercise-db', 'source free-exercise-db accepted');

-- ── B1 catalog seed (applied by 20260604120200_b1_catalog_seed.sql) ──────────
-- the seed imported exactly <COUNT> rows, all is_verified=false + source
-- provenance. <COUNT> = the record count Task 5 Step 1 reported (873 at the
-- pinned SHA). If the pin yields a different count, use that number in all three
-- asserts below — these are coupled to the exact generated row count.
select is(
  (select count(*)::int from public.exercises where source = 'free-exercise-db'),
  873, 'catalog seed imported 873 rows');
select is(
  (select count(*)::int from public.exercises
     where source = 'free-exercise-db' and is_verified),
  0, 'every imported row is is_verified=false');
select is(
  (select count(*)::int from public.exercises
     where source = 'free-exercise-db' and external_id is null),
  0, 'every imported row carries an external_id');
```

Note on `throws_ok` arg: the existing trigger asserts pass the **message text** (`'primary_muscles contains unknown code'`); CHECK/unique violations have less stable messages, so these new asserts use the **SQLSTATE** form (`'23514'` check_violation, `'23505'` unique_violation), which `throws_ok` also accepts as its second arg. Keep the trigger asserts (lines 29–36) on message text as-is.

- [ ] **Step 3: Local sanity (no DB) — confirm the file still parses as the suite expects**

Run: `pnpm test src/core/muscles.test.ts`
Expected: PASS — the unit anti-drift test does not read `05_muscles.test.sql`, but re-running confirms nothing else broke. The pgTAP file itself is verified only on CI.

- [ ] **Step 4: Commit**

```bash
git add supabase/tests/05_muscles.test.sql
git commit -m "test(catalog): pgTAP 25 codes + equipment/level/mechanic/force/category CHECKs, external_id unique, post-seed row asserts"
```

---

### Task 10: Picker — group-level "<Group> — todos" filter (PostgREST overlap)

**Files:**
- Modify: `src/features/training/exercises/api.ts` (add a group-overlap branch to `searchExercises` + extend `ExerciseSearchOptions`)
- Modify: `src/features/training/exercises/hooks.ts` (thread `groupMuscles` through `useExerciseSearch`)
- Modify: `src/features/training/components/ExercisePicker.tsx` (add a per-group "todos" `<option>` and wire it)
- Modify: `src/i18n/es/entrenamiento.json` / `src/i18n/en/entrenamiento.json` (`picker.allInGroup` label)
- Modify (NOT create — the file already exists with a supabase-builder mock harness): `src/features/training/exercises/api.test.ts`

The group-level filter uses PostgREST array **overlap** (`primary_muscles=ov.{code1,code2,…}`). Per the spec §11, `.ov.{…}`/`.cs.{…}` operator wire-forms escape the typecheck — verify the actual filter on the `db-test` CI. Tier-1 here only asserts the typed builder is called with the right column + array (mocked).

> **Spec divergence to confirm (already greenlit in this plan):** spec §11 literally writes the filter as the raw string `primary_muscles.ov.{delt_front,delt_side,delt_rear}`. This plan instead uses the **typed builder** `builder.overlaps('primary_muscles', groupMuscles)`, which serializes to the same `=ov.{…}` wire form but keeps `searchExercises` type-checking (the raw string is only needed inside `.or(...)`, which B1 does not use for groups). The spec text is now stale on the mechanism, not the behavior; this is the intended approach.

- [ ] **Step 1: Extend the existing api.test.ts with the group-overlap test**

`src/features/training/exercises/api.test.ts` **already exists** — do NOT overwrite it. It mocks supabase via a `from = vi.fn()` and a `searchBuilder()` factory that captures chained calls on a typed `SearchBuilder`. Extend it in two surgical edits matching that style:

1. Add `overlaps` to the `SearchBuilder` interface and the `searchBuilder()` factory's captured calls. Replace the existing `SearchBuilder` interface + `searchBuilder()` function (the block currently spanning the interface declaration through the `return { builder, captured };`) with:

```ts
interface SearchBuilder {
  select: () => SearchBuilder;
  contains: (col: string, val: unknown) => SearchBuilder;
  overlaps: (col: string, val: unknown) => SearchBuilder;
  or: (s: string) => SearchBuilder;
  order: () => SearchBuilder;
  limit: () => Promise<{ data: unknown[]; error: null }>;
}

function searchBuilder() {
  const captured = {
    contains: [] as unknown[][],
    overlaps: [] as unknown[][],
    or: [] as string[],
  };
  const builder: SearchBuilder = {
    select: () => builder,
    contains: (col, val) => {
      captured.contains.push([col, val]);
      return builder;
    },
    overlaps: (col, val) => {
      captured.overlaps.push([col, val]);
      return builder;
    },
    or: (s) => {
      captured.or.push(s);
      return builder;
    },
    order: () => builder,
    limit: () => Promise.resolve({ data: [], error: null }),
  };
  return { builder, captured };
}
```

2. Add two tests inside the existing `describe('searchExercises (fine-taxonomy array operators)', …)` block (after the `primary_muscles.cs.{code}` test):

```ts
  it('a group filter becomes an overlaps-on-array filter', async () => {
    const { builder, captured } = searchBuilder();
    from.mockReturnValue(builder);
    await searchExercises('', { groupMuscles: ['delt_front', 'delt_side', 'delt_rear'] });
    expect(captured.overlaps).toContainEqual([
      'primary_muscles',
      ['delt_front', 'delt_side', 'delt_rear'],
    ]);
  });

  it('no group filter issues no overlaps call', async () => {
    const { builder, captured } = searchBuilder();
    from.mockReturnValue(builder);
    await searchExercises('', {});
    expect(captured.overlaps).toEqual([]);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/features/training/exercises/api.test.ts`
Expected: FAIL — `searchExercises` doesn't accept `groupMuscles` / never calls `overlaps` (the existing tests still pass).

- [ ] **Step 3: Extend the API — `ExerciseSearchOptions` + `searchExercises`**

In `src/features/training/exercises/api.ts`, NO new `@/core/muscles` import is needed — the picker computes the group's codes and passes them in, so `searchExercises` only consumes a `PrimaryMuscle[]`. Leave the line-3 import (`import { MUSCLE_CODES, MUSCLES } from '@/core/muscles';`) unchanged. (Do NOT add a `groupCodes` helper or re-export `MUSCLE_GROUPS` from here — the picker already imports `MUSCLE_GROUPS`/`codesInGroup` from `@/core/muscles`; an api-side re-export would be dead code.)

Extend `ExerciseSearchOptions` (lines 50–54) to add `groupMuscles`:

```ts
export interface ExerciseSearchOptions {
  limit?: number;
  muscle?: PrimaryMuscle | null; // hard AND filter from the dropdown
  textMuscles?: PrimaryMuscle[]; // muscle codes the typed text matched (OR'd with name)
  groupMuscles?: PrimaryMuscle[]; // a whole group's fine codes — AND overlap filter
}
```

In `searchExercises`, replace the destructure line (line 76):

```ts
  const { limit = 20, muscle = null, textMuscles = [], groupMuscles = [] } = opts;
```

and, after the existing `if (muscle) { builder = builder.contains('primary_muscles', [muscle]); }` block (lines 82–84), add:

```ts
  if (groupMuscles.length > 0) {
    // ⚠ PostgREST array OVERLAP — primary_muscles && {codes}. The operator wire
    // form escapes the typecheck; verified on the db-test CI, not locally.
    builder = builder.overlaps('primary_muscles', groupMuscles);
  }
```

(`.overlaps(col, array)` is the typed supabase-js builder for the `ov` operator — it serializes to `primary_muscles=ov.{…}`. Using the typed builder keeps `searchExercises` compiling while still hitting the overlap operator the spec calls for. The string-literal `.ov.{…}` form is only needed inside `.or(...)`, which B1 does not use for groups.)

- [ ] **Step 4: Run the api test to verify it passes**

Run: `pnpm test src/features/training/exercises/api.test.ts`
Expected: PASS — `captured.overlaps` contains `['primary_muscles', [...]]` for the group filter and is empty otherwise; the existing `suggestIncrementForEquipment` / `exerciseDisplayName` / `contains` / `cs.{code}` / `createExercise` tests still pass.

- [ ] **Step 5: Add the picker UI — a "<Group> — todos" option per optgroup**

In `src/features/training/components/ExercisePicker.tsx`:

The import on line 13 is **already** `import { MUSCLE_GROUPS, codesInGroup } from '@/core/muscles';` — leave it as-is (no change). `PrimaryMuscle` is already imported from `../exercises/api` (line 11).

Change the selected-muscle state (line 40, currently `useState<PrimaryMuscle | ''>('')`) to also represent a group selection. Use a `group:` prefix sentinel so one `<select>` carries both fine codes and group selections:

```ts
  const [selectedMuscle, setSelectedMuscle] = useState<string>(''); // '' | <fineCode> | `group:<group>`
```

Derive the search options from the sentinel. Replace the `useExerciseSearch` call (lines 50–53):

```ts
  const isGroup = selectedMuscle.startsWith('group:');
  const groupKey = isGroup ? (selectedMuscle.slice('group:'.length) as (typeof MUSCLE_GROUPS)[number]) : null;
  const search = useExerciseSearch(debounced, {
    muscle: isGroup || selectedMuscle === '' ? null : (selectedMuscle as PrimaryMuscle),
    groupMuscles: groupKey ? (codesInGroup(groupKey) as PrimaryMuscle[]) : [],
    textMuscles,
  });
```

In the `<select>`, change the `onChange` cast (line 113) to store the raw string, and add a "<Group> — todos" `<option>` as the first child of each `<optgroup>` (replace the optgroup map block, lines 119–127):

```tsx
          onChange={(e) => {
            setSelectedMuscle(e.target.value);
            setOpen(true);
          }}
```

```tsx
          {MUSCLE_GROUPS.map((g) => (
            <optgroup key={g} label={t(`exerciseDialog.muscleGroup.${g}`)}>
              <option value={`group:${g}`}>
                {t('picker.allInGroup', { group: t(`exerciseDialog.muscleGroup.${g}`) })}
              </option>
              {codesInGroup(g).map((code) => (
                <option key={code} value={code}>
                  {t(`exerciseDialog.muscle.${code}`)}
                </option>
              ))}
            </optgroup>
          ))}
```

(`useExerciseSearch` (hooks.ts) destructures options **explicitly** — confirmed `hooks.ts:13` — so it does NOT thread `groupMuscles` automatically. Step 6 below is REQUIRED: extend the destructure, the `queryKey`, and the `queryFn` call to include `groupMuscles`, mirroring `textMuscles`. Without it the picker's `groupMuscles` would be silently dropped before reaching `searchExercises`.)

- [ ] **Step 6: Update `useExerciseSearch` to pass `groupMuscles` through**

In `src/features/training/exercises/hooks.ts`, extend the `useExerciseSearch` destructure + key + call to thread `groupMuscles` (mirrors how `textMuscles` is handled):

```ts
export function useExerciseSearch(query: string, opts: ExerciseSearchOptions = {}) {
  const { limit = 20, muscle = null, textMuscles = [], groupMuscles = [] } = opts;
  return useQuery({
    queryKey: ['exercises', 'search', query, limit, muscle, textMuscles, groupMuscles] as const,
    queryFn: () => searchExercises(query, { limit, muscle, textMuscles, groupMuscles }),
    placeholderData: (prev) => prev,
  });
}
```

- [ ] **Step 7: Add the `picker.allInGroup` i18n label (both locales)**

In both locale files the `picker` block ends with `"allMuscles": …` as its **last** key (no trailing comma) — ES line 58, EN line 58. Add a comma to that line and append `allInGroup` after it (interpolates the group name).

In `src/i18n/es/entrenamiento.json` the `picker` block becomes:

```json
  "picker": {
    "placeholder": "Buscar ejercicio…",
    "searching": "Buscando…",
    "noResults": "Sin resultados",
    "createNew": "Crear \"{{name}}\"",
    "change": "Cambiar",
    "allMuscles": "Todos los músculos",
    "allInGroup": "{{group}} — todos"
  },
```

In `src/i18n/en/entrenamiento.json` the `picker` block becomes:

```json
  "picker": {
    "placeholder": "Search exercises…",
    "searching": "Searching…",
    "noResults": "No matches",
    "createNew": "Create \"{{name}}\"",
    "change": "Change",
    "allMuscles": "All muscles",
    "allInGroup": "{{group}} — all"
  },
```

- [ ] **Step 8: Tier-2 render test — the group-level option renders (spec §12)**

Spec §12 asks for a Tier-2 check that "the group-level option renders." Add a focused render test of the real `ExercisePicker`. To stay CI-safe (rendering a supabase-importing component fails in CI without env unless mocked — see the component-test-supabase-env gotcha), mock both `@/lib/supabase` (the transitive `api` import) and `../exercises/hooks` (`useExerciseSearch`, so no real query fires), then assert the per-group "todos/all" `<option>`s render with the right `value="group:<g>"`. Create `src/features/training/components/ExercisePicker.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@/i18n';
import i18n from '@/i18n';
import { render, screen } from '@testing-library/react';

// Component transitively imports `../exercises/api`, which imports `@/lib/supabase`
// (throws on load without VITE_SUPABASE_* env). Stub it. Mock the hooks module so
// no real query runs — note ExercisePicker always renders <ExerciseDialog>, whose
// body calls useCreateExercise(), so BOTH hooks must be mocked or the render
// crashes on an undefined hook.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('../exercises/hooks', () => ({
  useExerciseSearch: () => ({ data: [], isLoading: false }),
  useCreateExercise: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

import { ExercisePicker } from './ExercisePicker';
import { MUSCLE_GROUPS } from '@/core/muscles';

beforeEach(async () => {
  await i18n.changeLanguage('es');
});

describe('ExercisePicker group-level options', () => {
  it('renders a "<Group> — todos" option per group with a group: value', () => {
    render(<ExercisePicker selected={null} onSelect={() => {}} onClear={() => {}} />);
    for (const g of MUSCLE_GROUPS) {
      const label = i18n.t(`entrenamiento:exerciseDialog.muscleGroup.${g}`);
      const opt = screen.getByRole('option', {
        name: i18n.t('entrenamiento:picker.allInGroup', { group: label }),
      });
      expect(opt).toHaveValue(`group:${g}`);
    }
  });
});
```

Run: `pnpm test src/features/training/components/ExercisePicker.test.tsx`
Expected: PASS — six group-level options render (one per group), each with `value="group:<g>"`. (`.tsx` tests run in jsdom via `environmentMatchGlobs` and `src/test/setup.ts` auto-imports `@testing-library/jest-dom/vitest`, so `toHaveValue` is globally available — no per-test matcher import needed, confirmed `vitest.config.ts:25-26` + `src/test/setup.ts:6`.)

- [ ] **Step 9: Typecheck + build + test**

Run: `pnpm typecheck && pnpm build && pnpm test`
Expected: all green. The `.overlaps()` filter compiles (typed builder); the actual `ov.{…}` wire behavior is verified on the `db-test` CI.

- [ ] **Step 10: Commit**

```bash
git add src/features/training/exercises/api.ts src/features/training/exercises/api.test.ts \
  src/features/training/exercises/hooks.ts \
  src/features/training/components/ExercisePicker.tsx \
  src/features/training/components/ExercisePicker.test.tsx \
  src/i18n/es/entrenamiento.json src/i18n/en/entrenamiento.json
git commit -m "feat(training): group-level muscle filter in the picker (PostgREST array overlap)"
```

---

### Task 11: Confirm neck/abductors shade automatically (no render change)

**Files:**
- Test: `src/features/training/components/muscleBody.shading.test.ts`

The render layer needs NO change: `MuscleBody` iterates the skin's art regions and for each sums `codesForBodyRegion(part.slug)`. The MIT skin already has a `neck` art region (slug `"neck"`, confirmed in `muscleMap/skins/mitSkin/bodyBack.ts`) — before B1 no fine code maps to it, so it never shaded; after Task 1 the `neck` code's `bodyRegionSlug: 'neck'` makes it shade. `gluteal` already exists (shared by `glutes`). Adding the two `MuscleDef` rows (Task 1) is sufficient: `neck` shades its own region; `abductors` co-shades `gluteal` additively alongside `glutes`. This task adds a pure unit assertion of that contract (Tier-1, no DOM) — proving the data wiring without touching `MuscleBody.tsx`, `mitSkin/index.ts`, or any art file.

- [ ] **Step 1: Write the failing assertion**

Create `src/features/training/components/muscleBody.shading.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { codesForBodyRegion, bodyRegionSlugForCode } from '@/core/muscles';

describe('neck/abductors shading wiring (no render change needed)', () => {
  it('neck shades its own art region', () => {
    expect(bodyRegionSlugForCode('neck')).toBe('neck');
    expect(codesForBodyRegion('neck')).toEqual(['neck']);
  });

  it('abductors co-shades the gluteal region additively with glutes', () => {
    expect(bodyRegionSlugForCode('abductors')).toBe('gluteal');
    expect([...codesForBodyRegion('gluteal')].sort()).toEqual(['abductors', 'glutes']);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm test src/features/training/components/muscleBody.shading.test.ts`
Expected: PASS (the codes/slugs were wired in Task 1). If it FAILS, Task 1 is incomplete — fix the `MuscleDef` rows, not this test.

- [ ] **Step 3: Commit**

```bash
git add src/features/training/components/muscleBody.shading.test.ts
git commit -m "test(training): assert neck/abductors shade via codesForBodyRegion (no render change)"
```

---

### Task 12: Generated types note + final verification

**Files:**
- Modify: `docs/operations.md` (regen note — append a short subsection)
- (verification only — no other code)

`src/types/database.ts` (import alias `@/types/database`) is the generated Supabase types file. The new exercises columns (`level/mechanic/force/category/images/external_id`) are **not yet present** in the generated `exercises` Row block (confirmed `src/types/database.ts` — the existing block has only the pre-B1 columns; `equipment` is `string | null`). B1 still compiles without a regen because nothing in B1 reads the new columns — the picker and api touch only existing columns, and `searchExercises` uses `.overlaps()` on `primary_muscles` (already typed `string[]`). The columns are first consumed in B2. WSL cannot run `supabase gen types` (no Docker/CLI stack here). Document the manual/CI regen path.

- [ ] **Step 1: Append the regen note to docs/operations.md**

Add this subsection under the existing Supabase/types section of `docs/operations.md` (place near other type/migration notes; create a "### Regenerating database types" heading if none exists):

```markdown
### Regenerating database types (after a schema migration)

`src/types/database.ts` is generated from the live schema. WSL dev has no local
Supabase/Docker stack, so regenerate against the linked project (or a develop
branch DB) from a machine with the CLI:

```bash
supabase gen types typescript --project-id <PROJECT_ID> --schema public > src/types/database.ts
```

B1 (level/mechanic/force/category/images/external_id) does not require a regen to
compile — the picker and api read only existing columns; the new columns are
consumed in B2. Regenerate when B2 starts reading them, or opportunistically.
```

- [ ] **Step 2: Final full verification**

Run, in order, and confirm each is green before claiming completion:

```bash
cd /mnt/d/dev/hudsons-fitness/.claude/worktrees/project-b-catalog
pnpm lint
pnpm build
pnpm test
```

Expected:
- `pnpm lint` — clean (note: `scripts/**` is not linted; only `src/**`).
- `pnpm build` — `tsc -b && vite build` succeeds (all JSON valid, types compile).
- `pnpm test` — all Tier-1/2 green, including `src/core/muscles.test.ts` (25/24 codes), `scripts/exercise-catalog/build-seed.test.ts` (mapper + linter + buildRow), `src/features/training/exercises/api.test.ts` (overlap filter), and `muscleBody.shading.test.ts`.

Then confirm a clean tree and the generated seed is present:

```bash
git status --porcelain        # expect empty (all committed)
wc -l supabase/migrations/20260604120200_b1_catalog_seed.sql   # ~900 lines (873 tuple lines joined by ,\n + ~13-line header + ~16-line footer); exact count tracks the record count from Task 5
```

**Not verifiable locally (CI checkpoint):** the schema migration applying cleanly + idempotently, the seed importing 873 rows, the equipment/level/mechanic/force/category CHECKs, `external_id` uniqueness, and the `.overlaps()` `primary_muscles=ov.{…}` filter on a real DB — all first run on the `develop` `db-test` job after the PR opens. Budget for one CI round-trip; if pgTAP reports a CHECK SQLSTATE or seed-count mismatch, fix and push again.

- [ ] **Step 3: Smoke notes (manual, post-merge to develop preview)**

After the PR merges to develop and the Vercel preview rebuilds, smoke-check in the picker:
- The muscle `<select>` shows each optgroup with a leading "<Group> — todos" row; selecting "Piernas — todos" returns leg-tagged exercises (overlap), and an individual fine code still narrows further.
- A handful of imported names render (ES first, EN subtitle); imported rows sort below the verified 34.
- The heatmap shades the `neck` region for a neck exercise and `gluteal` shows for both glute and abductor exercises.

- [ ] **Step 4: Commit the docs note**

```bash
git add docs/operations.md
git commit -m "docs(ops): note database-types regen path after the B1 schema migration"
```

---

## Self-Review checklist (run before opening the PR)

- **Spec §4** (taxonomy 22→24): Tasks 1, 2 (TS + migration seed + anti-drift test), 3 (i18n), 9 (pgTAP 25), 11 (shading). ✔
- **Spec §5** (equipment 8→12): Tasks 2 (CHECK), 3 (i18n), 4 (Equipment union + increment), 9 (pgTAP CHECK). ✔
- **Spec §6** (images relative path): Task 2 (`images text[]`), Task 6 (`imagePaths` passthrough), README image-URL helper note. Render deferred to B2. ✔
- **Spec §7** (fine-muscle mapper, 4 disambiguations + 1:1): Task 6 (`mapFineMuscle` + tests). ✔
- **Spec §8** (`is_verified=false` + linter): Tasks 7 (`lintRow` + report), 9 (pgTAP `is_verified=false`). ✔
- **Spec §9/§10** (pipeline + schema + idempotent seed): Tasks 2 (schema), 5 (inputs), 6/7 (build + generated seed migration), README. ✔
- **Spec §11** (picker group-level overlap filter): Task 10. ✔
- **Spec §12** (Tier-1 mapper + muscles.test, Tier-2 picker render, Tier-3 pgTAP): Tasks 6/7 (mapper+linter), 1 (muscles.test), 10 Step 1 (Tier-1 overlap mock) + Step 8 (Tier-2 `ExercisePicker.test.tsx` group-option render), 9 (pgTAP). ✔
- **Deferred (not built):** instructions, image render, group-name search, aliases, category/equipment/level filters. None have tasks. ✔
- **Type consistency:** `RawExercise`, `mapEquipment`, `mapFineMuscle`, `imagePaths`, `buildRow`, `lintRow`, `groupMuscles` option name, `selectedMuscle: string` `group:` sentinel — used identically across Tasks 6/7/10. (No `groupCodes` helper / no `MUSCLE_GROUPS` re-export in api.ts — the picker computes group codes via `codesInGroup` and passes the array.) ✔
- **CHECK constraint names:** equipment/source widening drops the real *anonymous* table-level CHECKs by `pg_constraint` introspection (NOT the non-existent `exercises_equipment_check`/`exercises_source_check` literals), then adds stably-named replacements — Task 2 Step 3. ✔
- **No AI attribution in any commit message.** ✔

---

## Execution Handoff

Plan complete and saved. Two execution options: (1) Subagent-Driven (recommended) — fresh subagent per task, review between tasks; or (2) Inline Execution via executing-plans with checkpoints.
