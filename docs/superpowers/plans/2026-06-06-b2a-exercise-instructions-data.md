# B2a — Exercise Instructions Data Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land bilingual step-by-step instruction data for every free-exercise-db exercise (English from the SHA-pinned source, machine-translated Spanish from a committed `es-instructions.json`) into two new index-aligned `text[]` columns on `public.exercises`, plus a pure `buildExerciseImageUrl` helper that turns stored relative image paths into jsDelivr CDN URLs. After B2a the data the B2b detail view needs exists and is verified. No UI ships in B2a.

**Architecture:** Two parallel text-array columns (`instructions_en`, `instructions_es`) on `public.exercises`, both `not null default '{}'`, index-aligned (es[i] translates en[i]; equal length per exercise, both-empty allowed for the 34 `source='system'` rows and the 5 source rows with no instructions). EN comes from `RawExercise.instructions` in `exercises.json`; ES from a committed `scripts/exercise-catalog/es-instructions.json` (`{external_id: [step,…]}`) produced by a dev-time machine-translation agent workflow (output committed, not run in CI). One deterministic `corepack pnpm exercises:build` run regenerates the B1 seed (`20260604120200_b1_catalog_seed.sql`, in place) **and** emits a new backfill migration (`20260606120400_b2a_instructions_backfill.sql`) from the same in-memory rows, so seed and backfill can never disagree. A hand-written columns migration (`20260606120300_b2a_instructions_columns.sql`) adds the two columns idempotently. `build-seed.ts` gains an exported, unit-testable `validateInstructions` integrity guard that fails the build on a stale es-instructions id or an EN/ES length mismatch (unless both empty). The image-URL helper lives in `src/` (typechecked + linted + tested); its `SHA` constant is kept equal to the script's `PINNED_SHA` by a unit test that reads `build-seed.ts` as **text** (regex-extracting `PINNED_SHA`), so `scripts/**` is never pulled into the typed `src` program. `src/types/database.ts` is regenerated from the local stack after the columns migration applies. Folds under R-27 (Project B); no new R-id/D-id.

**Tech Stack:** React 18 + Vite + TS SPA → Supabase (Postgres). Node 20 + pnpm 10 via `corepack pnpm` (pnpm 11 crashes — do not use bare `pnpm`). Dev scripts run via `tsx`. Vitest for Tier-1 unit tests (the only automated gate on `scripts/**`, which is exempt from `pnpm typecheck`/`pnpm lint`). pgTAP via `supabase test db` for Tier-3 DB tests (the merge gate on `develop`). Local Supabase stack driven with `supabase --workdir <worktree>` (Docker required). Branch `claude/b2a-exercise-instructions` off `develop`; this worktree (`/mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail`) is already on it. PR → `develop`, squash auto-merge.

---

## Spec deviation (read before Task 2)

This plan **deliberately diverges from the approved design spec §6** on one point, and Task 11 amends the spec to record the resolved decision. Spec §6 states the regenerated seed's `on conflict … do update set` is extended to carry the two instruction arrays ("Only the per-row tuples + the conflict clause change"). That is **not done here.** The seed (`20260604120200`) is dated `2026-06-04` and on a fresh `db reset` runs **before** the columns migration (`20260606120300`, dated `2026-06-06`) — so the seed physically cannot reference the instruction columns at its own timestamp without a "column does not exist" error. Resolution (**option B**): the seed stays instruction-free in its INSERT/SELECT/conflict structure; **all** instruction data (fresh-env and already-seeded-env) is written by the `20260606120400` backfill, which sorts after the columns migration. Re-dating the seed to `2026-06-06` (option A) was rejected because it would reorder the seed past the three `2026-06-06` review migrations (`catalog_full_review`/`hold_resolve`/`secondary_dedup`) that all `update … where source='free-exercise-db'` and depend on the seed's rows already existing. Task 11 updates spec §6 so the approved source of truth matches what ships.

---

## File Structure

> Note on the target directory: `src/features/training/exercises/` **already exists** and contains `api.ts`, `hooks.ts`, `muscleSearch.ts` (+ their `.test.ts` siblings). The new `images.ts`/`images.test.ts` join those neighbors (no name collision today); follow their export/style conventions. B2b will likely consume `api.ts`/`hooks.ts`.

| File | Created / Modified | Responsibility |
|---|---|---|
| `scripts/exercise-catalog/build-seed.ts` | Modified | Read `es-instructions.json`; add exported `buildInstructionsBackfillRow` (per-row `(external_id, instructions_en, instructions_es)` tuple from `raw.instructions` + the es map); add exported `validateInstructions` guard; emit the new backfill migration via a second `writeFileSync`. The seed tuple (`buildRow`) and the seed header/footer (INSERT/SELECT/conflict) are UNCHANGED (option B) — only the provenance comment line changes. |
| `scripts/exercise-catalog/build-seed.test.ts` | Modified | Add a `describe('buildInstructionsBackfillRow', …)` (EN from source, ES passed in, escaped apostrophes, both-empty/undefined) and a `describe('validateInstructions', …)` (stale-id throws, length-mismatch throws, both-empty + happy path pass). The 4 existing `buildRow` `.toBe(…)` tests are NOT touched (the seed tuple is unchanged under option B). |
| `scripts/exercise-catalog/es-instructions.json` | Created | Committed machine-translation output: `{ "<external_id>": ["<paso 1>", …] }`, one key per dataset id with `instructions_es.length === instructions_en.length` (empty array for the 5 no-instruction source rows). ~750 KB. Like `es-names.json`, a non-reproducible committed machine artifact — no generator. |
| `scripts/exercise-catalog/README.md` | Modified | Document `es-instructions.json` (mirrors the es-names step), the EN-from-source provenance, the build-time integrity guarantee, and that `buildExerciseImageUrl`'s SHA is kept equal to `PINNED_SHA` by a unit test. |
| `supabase/migrations/20260606120300_b2a_instructions_columns.sql` | Created | Idempotent `alter table public.exercises add column if not exists instructions_en/instructions_es text[] not null default '{}'`; comment header + ROLLBACK block. |
| `supabase/migrations/20260604120200_b1_catalog_seed.sql` | Modified (regenerated) | Regenerated by `exercises:build`; under option B the only change is the `MIGRATION_HEADER` provenance comment line. The 873 data tuples + the INSERT/SELECT/conflict structure are byte-identical. |
| `supabase/migrations/20260606120400_b2a_instructions_backfill.sql` | Created (generated) | Generated by `exercises:build`: `source='free-exercise-db'`-guarded set-based `update … from (values …)` writing both instruction arrays; no BEGIN/COMMIT. |
| `src/features/training/exercises/images.ts` | Created | Pure `buildExerciseImageUrl(relativePath)` → jsDelivr CDN URL; local `SHA` constant. |
| `src/features/training/exercises/images.test.ts` | Created | Cases: leading-slash, no-leading-slash, empty input; SHA-equality vs `PINNED_SHA` read from `build-seed.ts` as TEXT (no import of `scripts/**`). |
| `src/features/training/exercises/api.test.ts` | Modified | Add `images: []`, `instructions_en: []`, `instructions_es: []` (+ any other newly-required non-null fields) to the `base: Exercise` literal so it satisfies the regenerated `exercises.Row`. |
| `src/features/training/components/SessionEditor.test.tsx` | Modified | Same literal fix on `mockExercise: Exercise` (the `...mockExercise` spreads inherit it). |
| `src/types/database.ts` | Modified (regenerated) | Regenerated from the local stack after the columns migration applies. LARGE diff: replaces ~15 interim hand-edit comment blocks (all now backed by local migrations) with native generator output, and adds all B1 columns + the two instruction columns to `exercises.Row`. Re-apply the documented `string | null` post-gen patch on 4 fields. |
| `supabase/tests/06_instructions.test.sql` | Created | pgTAP: both columns exist + are `text[]`; a sampled free-exercise-db row has non-empty equal-length EN/ES; a `source='system'` row has empty instructions. |
| `docs/superpowers/specs/2026-06-06-b2a-exercise-instructions-data-design.md` | Modified | Amend §6 to record the option-B decision (seed unchanged, backfill is the single populator) so the approved spec matches what shipped. |

---

### Task 1: Worktree deps + green baseline

Establish that this worktree builds and tests clean before touching anything, and that `tsx` (needed by `exercises:build`) resolves from this worktree's own `node_modules`.

- [ ] **Step 1:** Confirm the worktree branch is `claude/b2a-exercise-instructions` off `develop`.
  ```bash
  git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail rev-parse --abbrev-ref HEAD
  git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail status --short
  ```
  Expect the branch name printed and a clean tree (only `.claude/` untracked, if anything). If the branch is not `claude/b2a-exercise-instructions`, create it off `origin/develop`:
  ```bash
  git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail fetch origin
  git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail checkout -b claude/b2a-exercise-instructions origin/develop
  ```

- [ ] **Step 2:** Activate pnpm 10 and install deps in THIS worktree (tsx needs the worktree's own `node_modules`).
  ```bash
  corepack prepare pnpm@10 --activate
  corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail install
  ```
  Expect pnpm ~10.34.1 and a successful install. Do NOT use bare `pnpm` (pnpm 11 crashes in WSL).

- [ ] **Step 3:** Establish the green baseline — lint, build, and the targeted build-seed test.
  ```bash
  corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail lint
  corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail build
  corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail test scripts/exercise-catalog/build-seed.test.ts
  ```
  Expect all three green. This is the pre-change baseline; if any fails, stop and resolve before proceeding (the worktree is the wrong base, not your change).

---

### Task 2: Schema migration — add the two instruction columns

Add `instructions_en` and `instructions_es` to `public.exercises`, idempotently, mirroring the B1 `images` column idiom (`not null default '{}'`). Dated `20260606120300` so it sorts after the existing `…120000/120100/120200` catalog migrations on this date and (being `2026-06-06`) applies AFTER the regenerated `2026-06-04` seed. See the **Spec deviation** section above for the full migration-ordering reasoning (option B): the seed must NOT reference these columns at its own timestamp; only the `20260606120400` backfill (which sorts after this columns migration) populates rows.

- [ ] **Step 1:** Create `supabase/migrations/20260606120300_b2a_instructions_columns.sql` with the idempotent add-column DDL + comment header + ROLLBACK block. Write this exact content:
  ```sql
  -- B2a step 1/3 — exercise instructions columns.
  -- Adds two parallel, index-aligned text[] columns for bilingual step-by-step
  -- instructions: instructions_es[i] translates instructions_en[i]; equal length
  -- per exercise (enforced at build time in build-seed.ts, asserted in pgTAP).
  -- Both default to empty '{}' so the source='system' rows (no source
  -- instructions) and any future manual rows are valid without instructions.
  -- Idempotent (add column if not exists). No BEGIN/COMMIT: Supabase wraps each
  -- migration file in its own transaction.
  alter table public.exercises
    add column if not exists instructions_en text[] not null default '{}',
    add column if not exists instructions_es text[] not null default '{}';

  -- ROLLBACK:
  -- alter table public.exercises
  --   drop column if exists instructions_en,
  --   drop column if exists instructions_es;
  ```

- [ ] **Step 2:** This is the load-bearing ordering decision; it is fully documented in the **Spec deviation** section at the top of this plan. The seed's column lists / conflict clause are **not** extended; the backfill is the single populator; the columns default to `'{}'` so freshly-inserted seed rows are valid until the backfill runs (milliseconds later, same `db reset`). The project has hit a migration-order bug before (MEMORY r16-tier3) — a real `supabase db reset` in Task 8 / Task 10 is the verification, not reasoning. No code in this step; proceed to Step 3 once you have confirmed the migration files' ordering by listing them:
  ```bash
  ls /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail/supabase/migrations/ | grep -E "2026060[456]" | sort
  ```
  Confirm `20260604120200` (seed) sorts before `20260606120300` (columns) which sorts before `20260606120400` (backfill), and that the three `20260606120000/120100/120200` review migrations sort before the new columns migration.

- [ ] **Step 3:** Commit the columns migration.
  ```bash
  git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail add supabase/migrations/20260606120300_b2a_instructions_columns.sql
  git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail commit -m "feat(db): add instructions_en/instructions_es columns to exercises"
  ```

---

### Task 3: build-seed — emit the instruction backfill tuple (TDD)

STRICT TDD. Under option B the seed tuple (`buildRow`) does NOT change — emission lives in a NEW exported pure helper `buildInstructionsBackfillRow` that produces one `(external_id, instructions_en, instructions_es)` VALUES tuple for the backfill migration. The existing 4 `buildRow` `.toBe(…)` tests stay green untouched (the seed tuple is not growing).

> **No `::text[]` cast on non-empty arrays.** The standalone `UPDATE … FROM (values …)` form does NOT require casting non-empty array literals: Postgres infers each VALUES column's type from the **first row**, and the existing, shipped `20260604120000_fine_muscle_taxonomy.sql` (lines 92–131) proves it — it writes 34 rows of `array['quads']`, `array['glutes',…]` etc. UNCAST and casts only the EMPTY arrays to `array[]::text[]`, and it applies cleanly on `db reset` (it is in `main`). `sqlTextArray` already emits exactly that shape (`array[]::text[]` for empty, `array['a','b']` for non-empty). So `buildInstructionsBackfillRow` emits `sqlTextArray` output verbatim — no cast helper, no later rewrite.

- [ ] **Step 1 (RED — write the failing test):** In `scripts/exercise-catalog/build-seed.test.ts`, extend the existing named import from `'./build-seed'` to add `buildInstructionsBackfillRow`:
  ```ts
  import {
    mapEquipment,
    mapFineMuscle,
    imagePaths,
    buildRow,
    lintRow,
    buildInstructionsBackfillRow,
    type RawExercise,
  } from './build-seed';
  ```
  Then append this describe block at the end of the file:
  ```ts
  describe('buildInstructionsBackfillRow', () => {
    const base: RawExercise = {
      id: 'Barbell_Curl',
      name: 'Barbell Curl',
      force: 'pull',
      level: 'beginner',
      mechanic: 'isolation',
      equipment: 'barbell',
      primaryMuscles: ['biceps'],
      secondaryMuscles: ['forearms'],
      category: 'strength',
      images: ['Barbell_Curl/0.jpg'],
      instructions: ['Stand up.', "Don't swing."],
    };

    it('emits a (external_id, instructions_en, instructions_es) tuple', () => {
      expect(
        buildInstructionsBackfillRow(base, ['Ponte de pie.', 'No balancees.']),
      ).toBe(
        "  ('Barbell_Curl', array['Stand up.','Don''t swing.'], " +
          "array['Ponte de pie.','No balancees.'])",
      );
    });

    it('escapes single quotes in both languages', () => {
      const r: RawExercise = { ...base, instructions: ["World's best."] };
      expect(buildInstructionsBackfillRow(r, ["Lo mejor del mundo's."])).toBe(
        "  ('Barbell_Curl', array['World''s best.'], array['Lo mejor del mundo''s.'])",
      );
    });

    it('emits empty arrays when the exercise has no instructions', () => {
      const r: RawExercise = { ...base, instructions: [] };
      expect(buildInstructionsBackfillRow(r, [])).toBe(
        "  ('Barbell_Curl', array[]::text[], array[]::text[])",
      );
    });

    it('falls back to empty EN array when instructions is undefined', () => {
      const r: RawExercise = { ...base, instructions: undefined };
      expect(buildInstructionsBackfillRow(r, [])).toBe(
        "  ('Barbell_Curl', array[]::text[], array[]::text[])",
      );
    });
  });
  ```

- [ ] **Step 2 (RED — run, expect FAIL):**
  ```bash
  corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail test scripts/exercise-catalog/build-seed.test.ts
  ```
  Expected: FAIL — `buildInstructionsBackfillRow` is not exported (the import errors / the new describe's cases fail). The existing `buildRow`, `imagePaths`, `lintRow`, `mapFineMuscle`, `mapEquipment` tests stay green.

- [ ] **Step 3 (GREEN — minimal impl):** In `scripts/exercise-catalog/build-seed.ts`, add the exported helper. It reuses the existing `sqlText` (for the single-quoted, escaped external id) and `sqlTextArray` (for both arrays — already escapes apostrophes via `esc`). Place it directly after `buildRow` (after its closing brace at line 169):
  ```ts
  /** One generated VALUES tuple for the instructions BACKFILL migration:
   *  (external_id, instructions_en, instructions_es). English steps come from the
   *  SHA-pinned source (raw.instructions ?? []); Spanish from es-instructions.json
   *  (passed in as esInstructions). Both arrays go through sqlTextArray, which
   *  doubles embedded single quotes — instruction prose has apostrophes (81 EN
   *  steps; the ES translations too). Non-empty arrays are emitted UNCAST: the
   *  standalone UPDATE…FROM(values) infers each column type from the first row
   *  (matching the shipped 20260604120000 retag migration); only empty arrays
   *  carry array[]::text[]. This is SEPARATE from the seed tuple (buildRow): the
   *  seed (dated 2026-06-04) cannot reference the instruction columns, which are
   *  added by a 2026-06-06 migration that sorts after it; all instruction data is
   *  written by the 2026-06-06 backfill. */
  export function buildInstructionsBackfillRow(
    raw: RawExercise,
    esInstructions: string[],
  ): string {
    const en = raw.instructions ?? [];
    return `  (${sqlText(raw.id)}, ${sqlTextArray(en)}, ${sqlTextArray(esInstructions)})`;
  }
  ```

- [ ] **Step 4 (GREEN — run, expect PASS):**
  ```bash
  corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail test scripts/exercise-catalog/build-seed.test.ts
  ```
  Expected: PASS — all four new `buildInstructionsBackfillRow` cases plus the unchanged existing tests.

- [ ] **Step 5:** Commit.
  ```bash
  git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail add scripts/exercise-catalog/build-seed.ts scripts/exercise-catalog/build-seed.test.ts
  git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail commit -m "feat(catalog): emit instruction backfill tuple in build-seed"
  ```

---

### Task 4: ES translation — define + run the agent translation workflow

Produce the committed `scripts/exercise-catalog/es-instructions.json`. This is a **dev-time workflow**, not CI: only the output JSON is committed. The contract is concrete; the actual translating is subagent dispatch at run time.

> **Cost / size up front (deliberate choice):** 868 of 873 exercises have steps, ~569 K EN instruction chars (≈142 K input tokens; ≈185 K ES output tokens raw, before per-subagent prompt overhead). The committed `es-instructions.json` will be ≈750 KB (≈¾ the size of `exercises.json`), materially growing the catalog dir — this is accepted.
>
> **Non-reproducible by design:** like `es-names.json`, there is NO committed generator — the artifact is a hand-blessed machine output and re-running translation will NOT reproduce byte-identical output. Correctness rests entirely on `validateInstructions` (build guard) + pgTAP, not on re-derivation. Translation quality is unverified-by-design (same accepted call as the B1 names, spec §2 out-of-scope), mitigated by the length-alignment guard + the Step 5 spot-check.

- [ ] **Step 1:** Record the workflow contract (do not write a committed script — this mirrors the B1 names workflow, whose output `es-names.json` is also a committed artifact with no generator). Contract:
  - **Input per exercise:** `{ external_id: string, instructions_en: string[] }` from `scripts/exercise-catalog/exercises.json` (`RawExercise.id` + `RawExercise.instructions ?? []`).
  - **Output per exercise:** `{ external_id: string, instructions_es: string[] }` where `instructions_es.length === instructions_en.length` EXACTLY, index-aligned (es[i] translates en[i]). For the 5 source rows with empty instructions (`Iron_Cross`, `One-Arm_Kettlebell_Swings`, `Push_Press`, `Side_Bridge`, `Side_Jackknife`) the value is `[]`.
  - **Coverage:** one key per dataset id — all 873 ids present (mirrors `es-names.json`'s 873 keys; 0 stale, 0 missing). The build guard (Task 5) fails on any stale key; a MISSING key falls back to `[]` and trips the length guard for any exercise with EN steps — so the workflow must emit all 873.
  - **Register:** Spanish (Spain) imperative fitness instructions, metric-only, matching the tone of `es-names.json` values (accented chars `á é í ó ú ñ ¿ ¡` expected). Do NOT split or merge steps — exactly one ES string per EN string.
  - **Determinism:** machine-only, no human review (same call as B1 names). The build guard + pgTAP are the safety net; the Step 5 spot-check is the only human eyeball.

- [ ] **Step 2:** Dispatch the translation subagents and merge their partial maps into a single object keyed by `external_id`, values `string[]`; write the merged result to `scripts/exercise-catalog/es-instructions.json`. Use the superpowers:dispatching-parallel-agents skill for the fan-out. **Batch size: 50 exercises per subagent** (≈18 batches across 868 instruction-bearing exercises; comfortably fits `Power_Clean` at 24 steps and the 744-char step in `Leg_Extensions`). **Per-batch postcondition (assert before merging):** for every record in a returned partial, `es[id].length === en[id].length` — re-dispatch any failing batch in isolation rather than discovering the mismatch globally in Step 3. After merging, verify shape:
  ```bash
  node -e "const m=require('/mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail/scripts/exercise-catalog/es-instructions.json'); const ids=Object.keys(m); console.log('keys', ids.length); console.log('non-array', ids.filter(k=>!Array.isArray(m[k])).length);"
  ```
  Expect `keys 873` and `non-array 0`.

- [ ] **Step 3:** Cross-check the es-instructions ids exactly match the source dataset ids (no stale, no missing, no length mismatch) before relying on the build guard:
  ```bash
  node -e "
  const fs=require('fs');
  const dir='/mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail/scripts/exercise-catalog';
  const raws=JSON.parse(fs.readFileSync(dir+'/exercises.json','utf8'));
  const es=JSON.parse(fs.readFileSync(dir+'/es-instructions.json','utf8'));
  const ids=new Set(raws.map(r=>r.id));
  const esk=Object.keys(es);
  console.log('stale', esk.filter(k=>!ids.has(k)));
  console.log('missing', [...ids].filter(k=>!(k in es)));
  console.log('len-mismatch', raws.filter(r=>{const en=(r.instructions||[]).length; const e=(es[r.id]||[]).length; return en!==e && !(en===0 && e===0);}).map(r=>r.id));
  "
  ```
  Expect `stale []`, `missing []`, `len-mismatch []`. Fix the translation output until all three are empty — these are exactly the conditions the Task 5 build guard throws on; clearing them here means `exercises:build` will not fail in Task 6.

- [ ] **Step 4:** Quality spot-check (the only human eyeball on machine-only Spanish). Print a handful of known exercises' ES vs EN and sanity-read them:
  ```bash
  node -e "
  const fs=require('fs');
  const dir='/mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail/scripts/exercise-catalog';
  const raws=JSON.parse(fs.readFileSync(dir+'/exercises.json','utf8'));
  const es=JSON.parse(fs.readFileSync(dir+'/es-instructions.json','utf8'));
  for (const id of ['Barbell_Curl','Power_Clean','Leg_Extensions','Bench_Press','Plank']) {
    const en=(raws.find(r=>r.id===id)||{}).instructions||[];
    console.log('===',id,'===');
    en.forEach((s,i)=>console.log('EN['+i+']',s.slice(0,80),'\\n   ES['+i+']',(es[id]||[])[i]||'(missing)'));
  }
  "
  ```
  Confirm the ES reads as fluent imperative Spanish (Spain), index-aligned, with no obvious mistranslation or English leftovers. Re-dispatch any batch that produced garbage. (The length guard catches structural drift; this catches wrong-but-equal-length translations.)

- [ ] **Step 5:** Commit the committed translation artifact.
  ```bash
  git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail add scripts/exercise-catalog/es-instructions.json
  git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail commit -m "feat(catalog): add machine-translated es-instructions.json"
  ```

---

### Task 5: build-seed — read `es-instructions.json` + integrity guard (TDD)

STRICT TDD. Add an exported pure `validateInstructions(raws, esInstructions)` that throws on a stale es-instructions key or an EN/ES length mismatch (unless both empty), mirroring the existing `primary-overrides.json` validation style but extracted so it is unit-testable (the override validation currently lives in untested `main()`). `main()` will read `es-instructions.json` and call this guard (wired in Task 6).

- [ ] **Step 1 (RED — write the failing tests):** In `scripts/exercise-catalog/build-seed.test.ts`, extend the named import to add `validateInstructions`:
  ```ts
  import {
    mapEquipment,
    mapFineMuscle,
    imagePaths,
    buildRow,
    lintRow,
    buildInstructionsBackfillRow,
    validateInstructions,
    type RawExercise,
  } from './build-seed';
  ```
  Then append this describe block:
  ```ts
  describe('validateInstructions', () => {
    const mk = (id: string, instructions: string[]): RawExercise => ({
      id,
      name: id,
      force: null,
      level: 'beginner',
      mechanic: null,
      equipment: null,
      primaryMuscles: [],
      secondaryMuscles: [],
      category: 'strength',
      images: [],
      instructions,
    });

    it('passes when every es entry is index-aligned to a known exercise', () => {
      const raws = [mk('A', ['one', 'two']), mk('B', [])];
      const es = { A: ['uno', 'dos'], B: [] };
      expect(() => validateInstructions(raws, es)).not.toThrow();
    });

    it('passes when both EN and ES are empty (system/no-source case)', () => {
      const raws = [mk('A', [])];
      const es = { A: [] };
      expect(() => validateInstructions(raws, es)).not.toThrow();
    });

    it('throws on a stale es-instructions key (unknown external_id)', () => {
      const raws = [mk('A', ['one'])];
      const es = { A: ['uno'], GHOST: ['x'] };
      expect(() => validateInstructions(raws, es)).toThrow(
        'es-instructions.json: unknown external_id "GHOST"',
      );
    });

    it('throws when ES length does not match EN length', () => {
      const raws = [mk('A', ['one', 'two'])];
      const es = { A: ['uno'] };
      expect(() => validateInstructions(raws, es)).toThrow(
        'es-instructions.json: "A" has 1 ES steps but 2 EN steps',
      );
    });

    it('throws when EN has steps but ES is missing (treated as empty, mismatch)', () => {
      const raws = [mk('A', ['one'])];
      const es = {};
      expect(() => validateInstructions(raws, es)).toThrow(
        'es-instructions.json: "A" has 0 ES steps but 1 EN steps',
      );
    });
  });
  ```

- [ ] **Step 2 (RED — run, expect FAIL):**
  ```bash
  corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail test scripts/exercise-catalog/build-seed.test.ts
  ```
  Expected: FAIL — `validateInstructions` is not exported.

- [ ] **Step 3 (GREEN — minimal impl):** In `scripts/exercise-catalog/build-seed.ts`, add the exported guard. Place it after `buildInstructionsBackfillRow`:
  ```ts
  /** Build-time integrity for es-instructions.json (fails `exercises:build` on
   *  drift, mirroring the primary-overrides.json validation). Throws when:
   *   (a) an es-instructions key is not a known dataset external_id (stale entry);
   *   (b) for any exercise, instructions_es.length !== instructions_en.length,
   *       UNLESS both are empty (the source='system' rows + the 5 no-source rows). */
  export function validateInstructions(
    raws: RawExercise[],
    esInstructions: Record<string, string[]>,
  ): void {
    const datasetIds = new Set(raws.map((r) => r.id));
    for (const id of Object.keys(esInstructions)) {
      if (!datasetIds.has(id)) {
        throw new Error(`es-instructions.json: unknown external_id "${id}"`);
      }
    }
    for (const raw of raws) {
      const enLen = (raw.instructions ?? []).length;
      const esLen = (esInstructions[raw.id] ?? []).length;
      if (enLen === 0 && esLen === 0) continue;
      if (enLen !== esLen) {
        throw new Error(
          `es-instructions.json: "${raw.id}" has ${esLen} ES steps but ${enLen} EN steps`,
        );
      }
    }
  }
  ```

- [ ] **Step 4 (GREEN — run, expect PASS):**
  ```bash
  corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail test scripts/exercise-catalog/build-seed.test.ts
  ```
  Expected: PASS — all five `validateInstructions` cases plus everything from Tasks 1 and 3.

- [ ] **Step 5:** Commit.
  ```bash
  git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail add scripts/exercise-catalog/build-seed.ts scripts/exercise-catalog/build-seed.test.ts
  git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail commit -m "feat(catalog): add es-instructions build-time integrity guard"
  ```

---

### Task 6: Wire `main()` — read es-instructions, validate, regenerate seed + emit backfill

Wire the new pieces into `main()`: read `es-instructions.json`, call `validateInstructions`, and emit the new `20260606120400` backfill migration via a second `writeFileSync` from the same in-memory rows. Under option B the regenerated seed file's INSERT/SELECT/conflict structure is UNCHANGED — `exercises:build` rewrites it deterministically and the only diff is the provenance comment line (Step 5). Net-new code: the es-instructions read, the validate call, the backfill header/footer + row assembly, and the second write. **No change to `buildInstructionsBackfillRow` or its Task 3 tests** — the helper emits uncast non-empty arrays (proven by the retag migration), which is exactly what the standalone UPDATE needs.

- [ ] **Step 1:** Read `es-instructions.json` in `main()` alongside the existing es-names/overrides loads. After the `overrides` load block (lines 301–303), add:
  ```ts
  // Machine-translated Spanish steps, { "<external_id>": ["<paso>", …] }, mirrors
  // es-names.json. index-aligned to raw.instructions; validated below.
  const esInstructions = JSON.parse(
    readFileSync(resolve(dir, 'es-instructions.json'), 'utf8'),
  ) as Record<string, string[]>;
  ```

- [ ] **Step 2:** Call the guard immediately after the existing `primary-overrides.json` validation loop (after the loop ending at line 310, where `datasetIds` is already built):
  ```ts
  validateInstructions(raws, esInstructions);
  ```

- [ ] **Step 3:** Define the backfill migration header + footer constants. Add these after `MIGRATION_FOOTER` (line 279), before `const FINE_CODES`:
  ```ts
  const BACKFILL_HEADER = `-- B2a step 3/3 — exercise instructions backfill.
  -- Writes instructions_en/instructions_es onto already-seeded rows (envs where
  -- the B1 seed ran before the instruction columns existed, e.g. production).
  -- Generated by scripts/exercise-catalog/build-seed.ts from exercises.json
  -- (RawExercise.instructions) + es-instructions.json — one deterministic
  -- \`pnpm exercises:build\` produces this AND the regenerated seed, so they can
  -- never disagree. Idempotent; guarded source='free-exercise-db' so it never
  -- touches the source='system' rows or any user row. The 5 source rows with no
  -- instructions get empty arrays (== the column default). DO NOT hand-edit.
  -- No BEGIN/COMMIT: Supabase wraps each migration file in its own transaction.
  -- Fresh resets get the same data from the regenerated 20260604120200 seed's
  -- rows + this backfill (which sorts after the 20260606120300 columns migration).
  -- Non-empty arrays are emitted UNCAST (Postgres infers column types from the
  -- first VALUES row, matching 20260604120000_fine_muscle_taxonomy.sql); only
  -- empty arrays carry ::text[].
  update public.exercises e
  set instructions_en = v.instructions_en,
      instructions_es = v.instructions_es
  from (values
  `;

  const BACKFILL_FOOTER = `
  ) as v(external_id, instructions_en, instructions_es)
  where e.external_id = v.external_id and e.source = 'free-exercise-db';
  `;
  ```

- [ ] **Step 4:** Assemble the backfill rows in `main()` and write the second migration file. The existing row loop (lines 315–338) builds `rows` for the seed via `buildRow`. After that loop, before the seed `writeFileSync` block (line 340), add a parallel build of the backfill rows and the second write:
  ```ts
  const backfillRows = raws.map((raw) =>
    buildInstructionsBackfillRow(raw, esInstructions[raw.id] ?? []),
  );
  const backfillSql =
    BACKFILL_HEADER + backfillRows.join(',\n') + BACKFILL_FOOTER;
  const outBackfill = resolve(
    dir,
    '../../supabase/migrations/20260606120400_b2a_instructions_backfill.sql',
  );
  writeFileSync(outBackfill, backfillSql);
  console.log(`wrote ${backfillRows.length} instruction backfill rows -> ${outBackfill}`);
  ```

- [ ] **Step 5:** Update the seed's `MIGRATION_HEADER` provenance comment to mention `es-instructions.json` as an input (the seed file content is otherwise structurally unchanged under option B). In `MIGRATION_HEADER` (line 244), change the line:
  ```
  -- scripts/exercise-catalog/exercises.json + es-names.json + primary-overrides.json.
  ```
  to:
  ```
  -- scripts/exercise-catalog/exercises.json + es-names.json + primary-overrides.json
  -- (instructions live in the sibling 20260606120400 backfill, also from this run).
  ```

- [ ] **Step 6:** Run the generator and inspect the diff. Docker is NOT required for `exercises:build` (it only reads JSON and writes SQL).
  ```bash
  corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail exercises:build
  git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail status --short
  git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail diff supabase/migrations/20260604120200_b1_catalog_seed.sql
  ```
  Expected: console logs `wrote 873 rows … -> …20260604120200_b1_catalog_seed.sql`, `flagged N low-confidence rows -> …ingest-report.csv`, and `wrote 873 instruction backfill rows -> …20260606120400_b2a_instructions_backfill.sql`. `git status` should show: a NEW `20260606120400_b2a_instructions_backfill.sql`, a modified `20260604120200_b1_catalog_seed.sql` whose diff is ONLY the provenance comment line from Step 5 (the data tuples must be byte-identical since the seed structure did not change), and (likely) an UNCHANGED `ingest-report.csv`. If the seed diff shows tuple changes, STOP — the generator is non-deterministic or a prior edit leaked into the seed; investigate before committing.

- [ ] **Step 7:** Confirm the backfill SQL has no BEGIN/COMMIT, repeats the source guard, and inspect a wrapped tuple. Note: instruction prose may contain embedded newlines (exactly 1 EN step does, 0 contain backslashes); single-quoted Postgres literals preserve newlines verbatim, so a generated VALUES tuple physically spanning two lines is **expected and valid**, not corruption.
  ```bash
  grep -n -i "begin\|commit" /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail/supabase/migrations/20260606120400_b2a_instructions_backfill.sql
  grep -n "source = 'free-exercise-db'" /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail/supabase/migrations/20260606120400_b2a_instructions_backfill.sql
  grep -c "::text\[\]" /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail/supabase/migrations/20260606120400_b2a_instructions_backfill.sql
  ```
  Expected: the first grep finds NOTHING (no transaction control); the second finds the `where … source = 'free-exercise-db'` clause; the third returns a SMALL count (`array[]::text[]` appears only on the empty-array rows — the 5 no-source EN arrays plus any empty ES arrays — NOT on non-empty rows, which are uncast). If the first or second check fails, fix the header/footer constants and re-run `exercises:build`.

- [ ] **Step 8:** Commit the generator wiring + regenerated seed + new backfill.
  ```bash
  git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail add scripts/exercise-catalog/build-seed.ts supabase/migrations/20260604120200_b1_catalog_seed.sql supabase/migrations/20260606120400_b2a_instructions_backfill.sql
  git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail commit -m "feat(catalog): generate instructions backfill migration from build-seed"
  ```
  (If `git status` showed `ingest-report.csv` as modified, add it too; `git add` of an unchanged file is a no-op.)

---

### Task 7: `buildExerciseImageUrl` helper (TDD) + SHA-equality test

STRICT TDD. A pure helper in `src/` (typechecked + linted + tested) that turns a stored relative image path into a jsDelivr CDN URL. The SHA-equality test asserts the helper's local `SHA` equals the script's `PINNED_SHA` by reading `build-seed.ts` as **text** and regex-extracting the constant — NOT by `import`-ing from `scripts/**`. This is deliberate: the root `tsconfig.json` has `include: ["src"]` with no test exclude, so `tsc --noEmit` compiles `src/**/*.test.ts` and follows its imports; an `import` from `scripts/build-seed.ts` would drag that never-typechecked dev module into the typed `src` program (and `scripts/**` is exempt from typecheck/lint by design — README:73-75), making a future type error in `build-seed.ts` silently break `pnpm typecheck`/`build`. Reading the SHA as text keeps `scripts/**` fully out of the typed program.

- [ ] **Step 1 (RED — write the failing test):** Create `src/features/training/exercises/images.test.ts`:
  ```ts
  import { readFileSync } from 'node:fs';
  import { fileURLToPath } from 'node:url';
  import { describe, expect, it } from 'vitest';
  import { buildExerciseImageUrl } from './images';

  // Read PINNED_SHA from build-seed.ts as TEXT (not an import) so scripts/** is
  // never pulled into the typed src program (it is exempt from typecheck/lint).
  const buildSeedPath = fileURLToPath(
    new URL('../../../../scripts/exercise-catalog/build-seed.ts', import.meta.url),
  );
  const pinnedSha = (() => {
    const src = readFileSync(buildSeedPath, 'utf8');
    const m = src.match(/export const PINNED_SHA = '([0-9a-f]+)'/);
    if (!m) throw new Error('PINNED_SHA not found in build-seed.ts');
    return m[1];
  })();

  const BASE = `https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@${pinnedSha}/exercises`;

  describe('buildExerciseImageUrl', () => {
    it('builds a CDN URL from a relative path', () => {
      expect(buildExerciseImageUrl('Bench_Press/0.jpg')).toBe(
        `${BASE}/Bench_Press/0.jpg`,
      );
    });

    it('normalizes a leading slash', () => {
      expect(buildExerciseImageUrl('/Bench_Press/0.jpg')).toBe(
        `${BASE}/Bench_Press/0.jpg`,
      );
    });

    it('returns an empty string for an empty path', () => {
      expect(buildExerciseImageUrl('')).toBe('');
    });

    it('pins the same SHA as build-seed PINNED_SHA', () => {
      expect(buildExerciseImageUrl('x.jpg')).toContain(pinnedSha);
    });
  });
  ```

- [ ] **Step 2 (RED — run, expect FAIL):**
  ```bash
  corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail test src/features/training/exercises/images.test.ts
  ```
  Expected: FAIL — `./images` does not exist (module-not-found / import error).

- [ ] **Step 3 (GREEN — minimal impl):** Create `src/features/training/exercises/images.ts`:
  ```ts
  // free-exercise-db images, served via jsDelivr at the SHA build-seed pins.
  // SHA is duplicated from scripts/exercise-catalog/build-seed.ts PINNED_SHA
  // INTENTIONALLY: that script is dev-only and never bundled into the app, so it
  // must not be imported into runtime code. A unit test (images.test.ts) reads
  // PINNED_SHA from build-seed.ts as text and asserts the two stay equal, so they
  // cannot drift silently.
  const SHA = 'b0eed061e1c832b3ed815fbaa4b45b3cdc14df49';
  const BASE = `https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@${SHA}/exercises`;

  /** Build a CDN URL from a stored relative image path (e.g. "Bench_Press/0.jpg").
   *  A leading slash is tolerated; an empty path returns an empty string. */
  export function buildExerciseImageUrl(relativePath: string): string {
    if (relativePath === '') return '';
    const normalized = relativePath.startsWith('/')
      ? relativePath.slice(1)
      : relativePath;
    return `${BASE}/${normalized}`;
  }
  ```

- [ ] **Step 4 (GREEN — run, expect PASS):**
  ```bash
  corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail test src/features/training/exercises/images.test.ts
  ```
  Expected: PASS — all four cases, including the SHA-equality assertion that reads `PINNED_SHA` from `build-seed.ts` as text. This test is the ONLY mechanism preventing SHA drift; if the regex finds nothing it throws a clear error (`PINNED_SHA not found`).

- [ ] **Step 5:** Verify the helper compiles under the gated suite (it lives in `src/`, so typecheck + lint apply). Because the test reads `build-seed.ts` as text rather than importing it, `scripts/**` is NOT pulled into the typed program; both gates must pass:
  ```bash
  corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail typecheck
  corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail lint
  ```
  Expected: both green. If either fails on `images.ts`/`images.test.ts`, fix the helper/test — `images.ts` must NOT import anything from `scripts/**`.

- [ ] **Step 6:** Commit.
  ```bash
  git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail add src/features/training/exercises/images.ts src/features/training/exercises/images.test.ts
  git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail commit -m "feat(training): add buildExerciseImageUrl CDN helper"
  ```

---

### Task 8: Regenerate `src/types/database.ts` from the local stack + fix Exercise literals

The committed types are stale (predate B1 — missing `images`, `level`, `mechanic`, `force`, `category`, `external_id` on `exercises.Row`, plus the new instruction columns). Apply the columns migration to the local stack, regenerate from `--local` (NOT `--project-id` — remote prod lacks the instruction columns until deploy), re-apply the mandatory post-gen patch, fix the test object literals the regen now requires, and verify the app compiles.

> **The regen is a LARGE diff, expected.** The committed `database.ts` is not a clean generator output — it carries ~15 interim hand-edit comment blocks (U-1 sub-macros, Training save_workout, fine-muscle-taxonomy, F-2 routines/programs, F-2b warmup, R-01 ref tables, U-2 meal_types, U-6 copy_week_meal, R-01 hide RPCs). A `--local` regen replaces ALL of them with native generator output. This is correct because every one of those RPCs/columns now exists in the local migration history, so the regen produces them natively and the hand-edits become redundant. The only thing that must be re-applied by hand is the 4-field `string | null` patch (Step 4). The Step 6 typecheck+lint+build is the gate.

- [ ] **Step 1:** Ensure Docker is running, then start the local stack from THIS worktree (so it uses this worktree's migrations, not stale `main`):
  ```bash
  supabase --workdir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail start -x studio,imgproxy,edge-runtime,logflare,vector
  ```
  Expect the stack to come up. If Docker is not running, start Docker Desktop / the daemon first.

- [ ] **Step 2:** Apply all migrations from zero (columns migration + regenerated seed + backfill), so the local schema has the new columns and the data is populated:
  ```bash
  supabase --workdir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail db reset
  ```
  Expect a clean reset with no "column does not exist" / "no unique or exclusion constraint" errors. A failure here is the migration-ordering bug class — re-read the **Spec deviation** section if it fails.

- [ ] **Step 3:** Regenerate types from the LOCAL stack:
  ```bash
  supabase --workdir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail gen types typescript --local > /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail/src/types/database.ts
  ```
  Expect the file fully rewritten. The `exercises.Row` block should now contain `instructions_en: string[]`, `instructions_es: string[]`, plus all B1 columns (`level`, `mechanic`, `force`, `category`, `images`, `external_id`). The generator overwrites the interim hand-edit comment blocks — expected (generator output is the source of truth; the underlying types are now migration-backed).

- [ ] **Step 4:** Re-apply the MANDATORY post-generation patch (see `docs/operations.md:647-653`, `docs/conventions.md:32`). The generator emits SQL-function text args as non-null `string`; restore `string | null` on exactly these four Args fields in the `Functions` block:
  - `save_recipe.Args.p_recipe_id`: `p_recipe_id: string` → `p_recipe_id: string | null`
  - `save_recipe.Args.p_description`: `p_description: string` → `p_description: string | null`
  - `save_recipe.Args.p_instructions`: `p_instructions: string` → `p_instructions: string | null`
  - `save_template.Args.p_template_id`: `p_template_id: string` → `p_template_id: string | null`

  Restore the marker comment immediately above the `Functions: {` line (the regen drops it). Insert this exact block:
  ```ts
      // Post-generation correction: `supabase gen types` cannot infer
      // nullability of SQL function parameters (Postgres carries no NULL flag
      // on function args), so it emits every text arg as non-null `string`.
      // The marked args below are nullable BY DESIGN (a null p_recipe_id /
      // p_template_id means "create new"); restored to `string | null` so call
      // sites stay honest instead of casting NULL to ''. Re-apply after any
      // regen — see docs/conventions.md (generated-types caveats).
      Functions: {
  ```
  (Do NOT re-add the other interim hand-edit comment blocks — those are now native generator output. Only this post-gen-patch marker + the 4 `string | null` edits are restored.)

- [ ] **Step 5:** Fix the `Exercise` object literals the regen now requires. The regenerated `exercises.Row` makes `images`, `instructions_en`, `instructions_es` non-nullable `string[]` (NOT NULL DEFAULT `'{}'`), so the two test files that construct full `Exercise` literals will FAIL typecheck+build until they include those fields. Add `images: []`, `instructions_en: []`, `instructions_es: []` (alphabetically placed to match the surrounding style) to:
  - `src/features/training/exercises/api.test.ts` — the `const base: Exercise = { … }` at line 56.
  - `src/features/training/components/SessionEditor.test.tsx` — the `const mockExercise: Exercise = { … }` at line 32 (the `...mockExercise` and `...base` spreads at lines 116/117/180/253/254/283 inherit the fix).

  Both literals currently lack `external_id`, `category`, `force`, `level`, `mechanic` too — if typecheck flags any of those as missing on `exercises.Row`, add them (`external_id: null`, `category: null`, `force: null`, `level: null`, `mechanic: null`, or the regenerated nullability the generator emits — read the regenerated `exercises.Row` to confirm each field's type before adding). Let the Step 6 typecheck output drive exactly which fields are required.

- [ ] **Step 6:** Verify the app compiles with the regenerated + patched types and fixed literals:
  ```bash
  corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail typecheck
  corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail lint
  corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail build
  ```
  Expected: all green. If typecheck fails on `save_recipe`/`save_template` callers passing `null`, the Step 4 patch was missed; if it fails on an `Exercise`/`Tables<'exercises'>` literal missing a field, add that field per Step 5 and re-run.

- [ ] **Step 7:** Commit the regenerated types + literal fixes.
  ```bash
  git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail add src/types/database.ts src/features/training/exercises/api.test.ts src/features/training/components/SessionEditor.test.tsx
  git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail commit -m "chore(types): regenerate for b2a exercise instructions"
  ```

---

### Task 9: pgTAP `06_instructions.test.sql`

Create a new lean pgTAP file (spec §11 recommendation — keeps the muscle tests focused) asserting the columns exist + are `text[]`, a sampled free-exercise-db row has non-empty equal-length EN/ES, and a `source='system'` row has empty instructions. Run it against the local test DB.

> **pgTAP function family + array-type-string verification.** `has_column`/`col_type_is` are not used anywhere in the existing suite (it uses `has_table` — same core schema-introspection family, 00_schema.test.sql:22-35 — and `col_is_unique`). `has_column`/`col_type_is` ship with the core pgTAP extension, so they are present; the `supabase test db` run in Step 3 is the verification. The one real gotcha is `col_type_is`'s expected type STRING for an array column (version-dependent: `'text[]'` vs `'_text'`) — Step 1 verifies the exact spelling empirically against the running stack BEFORE relying on it, using the existing B1 `images text[]` column as the probe.

- [ ] **Step 1:** Verify the running stack accepts the array-type spelling `col_type_is` will use (stack up from Task 8). Probe the existing `images text[]` column:
  ```bash
  supabase --workdir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail db reset >/dev/null 2>&1 || true
  PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "select format_type(atttypid, atttypmod) from pg_attribute where attrelid='public.exercises'::regclass and attname='images';"
  ```
  Expected: `text[]`. If `psql` is unavailable, run the same query via `supabase --workdir … db reset` then the Studio SQL editor, or skip directly to writing the file with `'text[]'` and rely on Step 3 to confirm. If `format_type` returns something other than `text[]`, use that exact string in Step 2's `col_type_is` calls. (Connection params are the local Supabase defaults: host `127.0.0.1`, port `54322`, user/pw/db `postgres`.)

- [ ] **Step 2:** Create `supabase/tests/06_instructions.test.sql` (use the type string confirmed in Step 1 — `text[]` unless the probe said otherwise):
  ```sql
  begin;
  select * from no_plan();

  -- columns exist with the expected type
  select has_column('public', 'exercises', 'instructions_en', 'instructions_en column exists');
  select has_column('public', 'exercises', 'instructions_es', 'instructions_es column exists');
  select col_type_is('public', 'exercises', 'instructions_en', 'text[]', 'instructions_en is text[]');
  select col_type_is('public', 'exercises', 'instructions_es', 'text[]', 'instructions_es is text[]');

  -- a sampled free-exercise-db row has non-empty, equal-length EN/ES instructions
  -- (Barbell_Curl has 5 source steps; NOT one of the 5 empty-source rows)
  select ok(
    (select coalesce(array_length(instructions_en, 1), 0) from public.exercises
       where external_id = 'Barbell_Curl' and source = 'free-exercise-db') > 0,
    'Barbell_Curl has >=1 EN instruction step');
  select is(
    (select array_length(instructions_en, 1) from public.exercises
       where external_id = 'Barbell_Curl' and source = 'free-exercise-db'),
    (select array_length(instructions_es, 1) from public.exercises
       where external_id = 'Barbell_Curl' and source = 'free-exercise-db'),
    'Barbell_Curl EN/ES instruction arrays are equal length');

  -- a source='system' row has empty instructions (no source steps; arrays stay '{}')
  select is(
    (select coalesce(array_length(instructions_en, 1), 0) from public.exercises
       where name_en = 'Back squat' and source = 'system'),
    0, 'Back squat (system) has empty instructions_en');
  select is(
    (select coalesce(array_length(instructions_es, 1), 0) from public.exercises
       where name_en = 'Back squat' and source = 'system'),
    0, 'Back squat (system) has empty instructions_es');

  select * from finish();
  rollback;
  ```

- [ ] **Step 3:** Run the pgTAP suite against the local test DB (stack already up from Task 8; Docker required):
  ```bash
  supabase --workdir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail test db
  ```
  Expected: all test files pass, including `06_instructions.test.sql` with all 8 asserts green. If `col_type_is` fails on the type string (not an "unknown function" error, just a value mismatch), re-run the Step 1 probe and substitute the exact `format_type` output (commonly `_text` on older pgTAP); as a last resort drop the two `col_type_is` lines and assert the type via `is((select data_type from information_schema.columns where table_schema='public' and table_name='exercises' and column_name='instructions_en'), 'ARRAY', …)`. If `Barbell_Curl` asserts fail with empty arrays, the backfill did not populate that row — re-check Task 6 and re-`db reset`.

- [ ] **Step 4:** Commit the pgTAP file.
  ```bash
  git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail add supabase/tests/06_instructions.test.sql
  git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail commit -m "test(db): pgTAP asserts for exercise instructions columns"
  ```

---

### Task 10: Full verification + clean tree

Run the complete gated suite plus a from-zero DB reset and the pgTAP suite, and confirm a clean working tree. **Docker must be running** for the Supabase steps. Per MEMORY (verify-full-suite-after-subagents) run the FULL suite yourself; do not trust a partial green report. Note: `corepack pnpm test` is ~11-15 min — if interrupted, kill orphaned vitest/tinypool workers by worktree path (MEMORY orphaned-test-workers).

- [ ] **Step 1:** Full Tier-1 gates (the same `lint-build` CI job runs these):
  ```bash
  corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail lint
  corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail build
  corepack pnpm --dir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail test
  ```
  Expected: all green. The full `test` run includes `build-seed.test.ts` (instruction emission + integrity) and `images.test.ts` (helper + SHA-equality).

- [ ] **Step 2:** Re-run a from-zero DB reset to confirm the full migration chain applies cleanly (columns → regenerated seed → backfill, plus all prior catalog migrations). Docker must be running; stack from Task 8 may still be up:
  ```bash
  supabase --workdir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail db reset
  ```
  Expected: clean reset, no errors.

- [ ] **Step 3:** Re-run the full pgTAP suite (Tier-3, the `db-test` merge gate on develop):
  ```bash
  supabase --workdir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail test db
  ```
  Expected: all `supabase/tests/*.test.sql` pass, including `05_muscles.test.sql` (no regression to the dedup/row-count asserts) and the new `06_instructions.test.sql`.

- [ ] **Step 4:** Stop the local stack and confirm a clean tree:
  ```bash
  supabase --workdir /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail stop --no-backup
  git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail status --short
  ```
  Expected: stack stopped; `git status` shows nothing uncommitted except possibly the untracked `.claude/` dir. If `src/types/database.ts`, the seed, or the backfill show as dirty, a re-gen/re-build left changes — investigate and commit or revert deliberately before the PR.

---

### Task 11: Spec amendment + README docs

Reconcile the approved spec with the option-B decision and document the new committed artifacts.

- [ ] **Step 1:** Amend the design spec §6 so the approved source of truth matches what shipped. In `docs/superpowers/specs/2026-06-06-b2a-exercise-instructions-data-design.md`, replace the **Regenerated seed** bullet (lines 105-108):
  ```
  - **Regenerated seed** (`20260604120200_b1_catalog_seed.sql`) — `buildRow` now
    emits the two instruction arrays; the `on conflict (external_id) … do update`
    set is extended to include them, so a fresh `db reset` and any seed re-run
    populate instructions. Only the per-row tuples + the conflict clause change.
  ```
  with:
  ```
  - **Regenerated seed** (`20260604120200_b1_catalog_seed.sql`) — UNCHANGED in
    structure (option B, resolved at plan time). The seed is dated 2026-06-04 and
    on a fresh `db reset` runs BEFORE the 2026-06-06 columns migration, so it
    cannot reference the instruction columns. The backfill (below) is the SINGLE
    populator for both fresh and already-seeded envs; the seed's INSERT/SELECT/
    conflict clause does not carry instructions. (Re-dating the seed to 2026-06-06
    was rejected: it would reorder it past the three 2026-06-06 review migrations
    that depend on the seed rows existing.) The regenerated seed's only diff is its
    provenance comment line.
  ```

- [ ] **Step 2:** Commit the spec amendment.
  ```bash
  git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail add docs/superpowers/specs/2026-06-06-b2a-exercise-instructions-data-design.md
  git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail commit -m "docs(spec): record option-B seed/backfill decision for b2a"
  ```

- [ ] **Step 3:** Read the current `scripts/exercise-catalog/README.md` (use the Read tool on `/mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail/scripts/exercise-catalog/README.md`) to locate the es-names step (numbered step 2, lines 16-19), the Dataset-pin block (lines 8-12), and the post-import / idempotency / test-gate sections.

- [ ] **Step 4:** Add an `es-instructions.json` paragraph paralleling the es-names step. Insert after the numbered step-2 (es-names) paragraph a block stating: English instructions come from `exercises.json` (`RawExercise.instructions`); `es-instructions.json` is the committed machine-translation output shaped `{ "<external_id>": ["<paso>", …] }`, one key per dataset id, with `instructions_es.length === instructions_en.length` (empty for the 5 no-source rows); it is produced by a one-off dev-time agent translation workflow (NOT run in CI) and — like `es-names.json` — is a non-reproducible committed machine artifact with no generator (correctness rests on `validateInstructions` + pgTAP, not re-derivation); `build-seed.ts` fails the build (`validateInstructions`) on a stale id or an EN/ES length mismatch (unless both empty), the same drift guarantee `primary-overrides.json` gives; and `exercises:build` writes BOTH the regenerated seed (structurally unchanged) and the `20260606120400` instructions backfill from one deterministic run.

- [ ] **Step 5:** Add to the Dataset-pin block a line noting that `src/features/training/exercises/images.ts` (`buildExerciseImageUrl`) is the consumer of the stored relative image paths, and that its `SHA` constant is kept equal to `PINNED_SHA` by a unit test (`images.test.ts`, which reads `build-seed.ts` as text so `scripts/**` stays out of the typed program) — so the two cannot drift.

- [ ] **Step 6:** Commit the README update.
  ```bash
  git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail add scripts/exercise-catalog/README.md
  git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail commit -m "docs(catalog): document es-instructions.json and image-URL helper"
  ```

---

### Task 12: PR → develop

Open the PR for squash auto-merge after the full suite (Task 10) is green and all commits are made.

- [ ] **Step 1:** Push the branch and open the PR into `develop`.
  ```bash
  git -C /mnt/d/dev/hudsons-fitness/.claude/worktrees/b2-exercise-detail push -u origin claude/b2a-exercise-instructions
  gh pr create --repo SGT-Hudson/hudsons-fitness --base develop --head claude/b2a-exercise-instructions \
    --title "feat(catalog): B2a exercise instructions data foundation" \
    --body "$(cat <<'EOF'
  Lands bilingual step-by-step exercise instructions (EN from source, machine-translated ES from a committed es-instructions.json) into two new index-aligned text[] columns on public.exercises, plus a pure buildExerciseImageUrl helper. No UI ships in B2a (folds under R-27 Project B).

  ## What changed
  - New columns instructions_en / instructions_es (text[] not null default '{}'), idempotent migration 20260606120300.
  - build-seed.ts reads es-instructions.json, validates integrity (fails build on stale id / EN-ES length mismatch unless both empty), and emits a source-guarded backfill migration 20260606120400 from the same deterministic exercises:build run. Seed (20260604120200) stays instruction-free at its 2026-06-04 timestamp (it sorts before the columns migration); the backfill is the single populator for fresh + already-seeded envs.
  - buildExerciseImageUrl (jsDelivr + PINNED_SHA) with a SHA-equality unit test that reads build-seed.ts as text (keeps scripts/ out of the typed program).
  - Regenerated src/types/database.ts from the local stack (post-gen string|null patch re-applied; interim hand-edit blocks replaced by native migration-backed types); Exercise test literals updated for the new non-null columns.
  - New pgTAP 06_instructions.test.sql (columns exist + text[]; a free-exercise-db row has non-empty equal-length EN/ES; a system row has empty instructions).
  - Spec §6 amended to record the option-B seed/backfill decision.

  ## Verification
  - corepack pnpm lint + build + test green.
  - supabase db reset (from zero) + supabase test db green locally.
  EOF
  )"
  ```

- [ ] **Step 2:** After CI's `lint-build` and `db-test` jobs are green, enable squash auto-merge:
  ```bash
  gh pr merge --repo SGT-Hudson/hudsons-fitness --squash --auto claude/b2a-exercise-instructions
  ```
  Do NOT enable `--auto` while still pushing further commits (MEMORY develop-ci-gate: it can drop later commits). Confirm all commits are pushed first.

---

## Notes for the executing worker

- **scripts/** is NOT typechecked or linted** (`README.md:73-75`) — the ONLY automated gate on `build-seed.ts` is `build-seed.test.ts` (Tier-1 vitest). Type errors in `build-seed.ts` pass CI silently; rely on the unit tests + a manual `corepack pnpm exercises:build` run. The image helper lives in `src/`, so it IS gated — and its test reads `build-seed.ts` as TEXT (not an import), so it does not drag `scripts/**` into the typed program.
- **Migration ordering is load-bearing** (see the **Spec deviation** section): the seed (`2026-06-04`) sorts before the columns migration (`2026-06-06`), so the seed must not reference the instruction columns; the backfill (`20260606120400`, after the columns) is the single populator. Verify with a real `supabase db reset`, never by reasoning alone (the project has hit a migration-order bug before).
- **No `::text[]` cast on non-empty backfill arrays** — the standalone `UPDATE…FROM(values)` infers each column type from the first VALUES row (proven by the shipped `20260604120000_fine_muscle_taxonomy.sql`); only empty arrays carry `array[]::text[]`, which `sqlTextArray` already emits.
- **The types regen is a large diff by design** (Task 8): it replaces ~15 interim hand-edit comment blocks (all now migration-backed) with native generator output, and exposes pre-existing latent gaps (the committed type was already missing B1's `images` column), which is why two `Exercise` test literals need new fields. Only the 4-field `string | null` post-gen patch is re-applied by hand.
- **Instruction prose can contain embedded newlines** (1 EN step does; 0 contain backslashes). Single-quoted Postgres literals preserve newlines verbatim, so a generated backfill VALUES tuple wrapping across two physical lines is expected and valid — not corruption. The existing quote-only `esc` escaping is correct.
- **WSL toolchain:** `corepack pnpm` (pnpm 10; pnpm 11 crashes); `tsx` needs THIS worktree's `node_modules`; pass `--workdir <worktree>` to every `supabase` call (Docker first); full `pnpm test` is ~11-15 min and a hung run leaves detached workers (kill by worktree path).
- **Type-gen source:** use `--local` (local stack has the new columns after `db reset`), NOT `--project-id upvraruehzurbetzrxov` (remote prod lacks the columns until deploy). Re-apply the mandatory `string | null` post-gen patch on `save_recipe`/`save_template` Args every time.
- **No AI attribution** in any commit or PR body (repo is public; plain conventional commits).