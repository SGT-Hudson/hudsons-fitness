# R-32 Tier-4 select-string guard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an invalid PostgREST `.select(...)` string fail CI, by running the 20 real fetch helpers that carry an explicit select against the local Supabase stack with ids that match nothing.

**Architecture:** A fourth test tier (`*.itest.ts`) with its own Vitest config, excluded from `pnpm test` and run inside the existing `db-test` CI job, which already stands the stack up. A registry lists one case per helper; a runner executes each and classifies the PostgREST error code; a coverage meta-test fails the build when a helper with an explicit select is missing from the registry.

**Tech Stack:** Vitest 3.2.6, `@supabase/supabase-js` 2.110, `ws` (test-only polyfill), Supabase CLI 2.101.0, Node 20.

**Spec:** `docs/superpowers/specs/2026-07-23-r32-select-guard-design.md`

## Global Constraints

- **Node 20.** `createClient` throws `"native WebSocket not found"` without a `globalThis.WebSocket` polyfill. `ws` is a **devDependency**; production code is never touched.
- **Never run against production.** The tier must fail closed if the Supabase URL host is not `127.0.0.1` or `localhost`. `.env.test.local` in this repo holds the QA user's production credentials.
- **Local stack ports** (`supabase/config.toml`): API `56321`, DB `56322`. Never `553xx`.
- **Error policy is an allow-list:** only `PGRST116` is tolerated. Any other code fails.
- **No seed data, no auth session.** Cases pass constants that match nothing.
- `pnpm test` output must be unchanged by this work — the new tier is a separate config and script.
- No AI/Claude attribution in commits.
- Metric-only, DB-canonical, and the other CLAUDE.md invariants are untouched: this adds no schema, no RPC, no product behaviour.

---

### Task 1: Tier scaffolding — config, setup, safety guard

**Files:**
- Create: `vitest.integration.config.ts`
- Create: `src/test/integration/setup.ts`
- Create: `src/test/integration/fetchCounter.ts`
- Create: `src/test/integration/smoke.itest.ts`
- Modify: `package.json` (add `ws` + `@types/ws` devDependencies, add `test:integration` script)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `pnpm test:integration` — runs `vitest run --config vitest.integration.config.ts`.
  - `src/test/integration/fetchCounter.ts` exports `installFetchCounter(): void`, `resetFetchCount(): void`, `fetchCount(): number`.
  - Env contract: `SUPABASE_TEST_URL` (default `http://127.0.0.1:56321`) and `SUPABASE_TEST_ANON_KEY` (required, no default).

- [ ] **Step 1: Start the local stack**

The tier needs a running stack. From the worktree:

```bash
supabase start -x studio,imgproxy,edge-runtime,logflare,vector
supabase status -o env
```

Expected: `API_URL="http://127.0.0.1:56321"` and an `ANON_KEY="..."` in the output. Keep the anon key for the next steps; it is a well-known local development key, **not** a secret, and is never committed.

- [ ] **Step 2: Add the test-only dependencies**

```bash
pnpm add -D ws @types/ws
```

Expected: `ws` and `@types/ws` appear under `devDependencies` in `package.json`, lockfile updated.

- [ ] **Step 3: Write the fetch counter**

Create `src/test/integration/fetchCounter.ts`:

```ts
// Counts HTTP requests issued during a test case. A registry case that
// completes without issuing one is not exercising a select string at all —
// it short-circuited (e.g. an empty id array returns early). Such a case
// would sit in the suite as a permanently green test that proves nothing,
// so the runner fails it. Installed from the setup file, before any test
// module imports `@/lib/supabase`, so supabase-js captures the wrapper.
let count = 0;

export function installFetchCounter(): void {
  const original = globalThis.fetch;
  globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
    count += 1;
    return original(...args);
  }) as typeof fetch;
}

export function resetFetchCount(): void {
  count = 0;
}

export function fetchCount(): number {
  return count;
}
```

- [ ] **Step 4: Write the setup file**

Create `src/test/integration/setup.ts`:

```ts
// Tier-4 (R-32) setup. Runs before any test module is imported.
import WebSocket from 'ws';
import { installFetchCounter } from './fetchCounter';

// Node 20 has no global WebSocket, and `createClient` throws
// "native WebSocket not found" without one — so importing `@/lib/supabase`
// would be fatal. DELETE THIS BLOCK when the project moves to Node 22,
// which provides WebSocket natively.
if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as { WebSocket?: unknown }).WebSocket = WebSocket;
}

// Fail closed. `.env.test.local` in this repo holds the agent-browser QA
// user's PRODUCTION credentials; if anything leaks them into this tier, the
// suite would run against production. The config sets `test.env` explicitly,
// and this is the second, independent defence.
const url = import.meta.env.VITE_SUPABASE_URL;
if (!url) {
  throw new Error(
    'Tier-4: VITE_SUPABASE_URL is unset. Run `supabase status -o env` and export SUPABASE_TEST_ANON_KEY.',
  );
}
const host = new URL(url).hostname;
if (host !== '127.0.0.1' && host !== 'localhost') {
  throw new Error(
    `Tier-4 refuses to run against a non-local host: ${host}. This tier only ever targets the local Supabase stack.`,
  );
}

installFetchCounter();
```

- [ ] **Step 5: Write the integration Vitest config**

Create `vitest.integration.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Tier-4 (R-32): runs the real fetch helpers against the LOCAL Supabase
// stack to validate their PostgREST select strings. Separate from
// vitest.config.ts on purpose — `pnpm test` must stay hermetic and stack-free.
const url = process.env.SUPABASE_TEST_URL ?? 'http://127.0.0.1:56321';
const anonKey = process.env.SUPABASE_TEST_ANON_KEY ?? '';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/test/integration/**/*.itest.ts'],
    setupFiles: ['./src/test/integration/setup.ts'],
    // One worker: every case talks to the same local Postgres.
    minWorkers: 1,
    maxWorkers: 1,
    // envDir points at a directory with no .env* files, so Vite cannot load
    // `.env.test.local` (production credentials) in mode=test. First defence;
    // the setup file's host assertion is the second.
    envDir: path.resolve(__dirname, './src/test/integration'),
    // Explicit env beats any .env file. `@/lib/supabase` reads these.
    env: {
      VITE_SUPABASE_URL: url,
      VITE_SUPABASE_PUBLISHABLE_KEY: anonKey,
    },
  },
});
```

- [ ] **Step 6: Add the script**

In `package.json`, next to `"test": "vitest run"`:

```json
"test:integration": "vitest run --config vitest.integration.config.ts",
```

- [ ] **Step 7: Write the failing smoke test**

Create `src/test/integration/smoke.itest.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { supabase } from '@/lib/supabase';
import { fetchCount, resetFetchCount } from './fetchCounter';

describe('Tier-4 harness', () => {
  it('reaches the local stack and counts the request', async () => {
    resetFetchCount();
    const { error } = await supabase.from('exercises').select('id').limit(1);
    expect(error).toBeNull();
    expect(fetchCount()).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 8: Run it and watch it fail for the right reason**

```bash
pnpm test:integration
```

Expected: FAIL — the setup throws `Tier-4: VITE_SUPABASE_URL is unset...` because `SUPABASE_TEST_ANON_KEY` was not exported. This proves the guard fires rather than silently defaulting.

- [ ] **Step 9: Export the key and run again**

```bash
export SUPABASE_TEST_ANON_KEY="$(supabase status -o env | sed -n 's/^ANON_KEY="\(.*\)"$/\1/p')"
pnpm test:integration
```

Expected: PASS, 1 test.

- [ ] **Step 10: Prove the production guard bites**

```bash
SUPABASE_TEST_URL="https://example.supabase.co" pnpm test:integration
```

Expected: FAIL with `Tier-4 refuses to run against a non-local host: example.supabase.co`, and **no query is issued**. Then re-run without the override and confirm green again.

- [ ] **Step 11: Confirm `pnpm test` is untouched**

```bash
pnpm test 2>&1 | tail -5
```

Expected: the existing suite runs and passes; no `.itest.ts` file appears in its output.

- [ ] **Step 12: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.integration.config.ts src/test/integration/
git commit -m "test(tier4): integration harness targeting the local Supabase stack"
```

---

### Task 2: The runner and its error policy

**Files:**
- Create: `src/test/integration/registry.ts`
- Create: `src/test/integration/selects.itest.ts`
- Delete: `src/test/integration/smoke.itest.ts` (its job is now done by real cases)

**Interfaces:**
- Consumes: `installFetchCounter`/`resetFetchCount`/`fetchCount` from Task 1.
- Produces:
  - `registry.ts` exports `MISSING_USER_ID`, `MISSING_ID`, `FIXED_DATE`, and `REGISTRY: SelectCase[]` where
    `interface SelectCase { id: string; file: string; fn: string; run: () => Promise<unknown> }`.
  - Task 3 appends cases to `REGISTRY`; Task 4 reads `REGISTRY[].file` and `REGISTRY[].fn`.

- [ ] **Step 1: Write the registry with three pilot cases**

Three shapes on purpose: a plain list, a `.single()` helper (raises `PGRST116`), and a helper with an embedded relation.

Create `src/test/integration/registry.ts`:

```ts
import { listRecipes, fetchRecipe } from '@/features/recipes/api';
import { fetchRoutine } from '@/features/training/routines/api';

/** A case invokes one real helper with constants that match no row. */
export interface SelectCase {
  /** Stable label, `feature/fnName`. */
  id: string;
  /** Repo-relative file the helper lives in — the coverage meta-test keys on this. */
  file: string;
  /** Exported function name — the coverage meta-test keys on this. */
  fn: string;
  run: () => Promise<unknown>;
}

/** Never seeded. PostgREST validates the select before it applies filters. */
export const MISSING_USER_ID = '00000000-0000-4000-8000-000000000001';
export const MISSING_ID = '00000000-0000-4000-8000-000000000002';
export const FIXED_DATE = '2026-01-05';

export const REGISTRY: SelectCase[] = [
  {
    id: 'recipes/listRecipes',
    file: 'src/features/recipes/api.ts',
    fn: 'listRecipes',
    run: () => listRecipes(MISSING_USER_ID),
  },
  {
    id: 'recipes/fetchRecipe',
    file: 'src/features/recipes/api.ts',
    fn: 'fetchRecipe',
    run: () => fetchRecipe(MISSING_ID),
  },
  {
    id: 'training/routines/fetchRoutine',
    file: 'src/features/training/routines/api.ts',
    fn: 'fetchRoutine',
    run: () => fetchRoutine(MISSING_ID),
  },
];
```

- [ ] **Step 2: Write the runner**

Create `src/test/integration/selects.itest.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { REGISTRY } from './registry';
import { fetchCount, resetFetchCount } from './fetchCounter';

// Allow-list, not deny-list: an unrecognised code must fail the build.
// PGRST116 = "0 rows" from `.single()`, which is the EXPECTED outcome here —
// every case queries ids that match nothing on purpose. Anything else means
// the select string itself is wrong: 42703 undefined column, 42P01 undefined
// table, PGRST100 select parse error, PGRST200 no relationship for an embed.
const ALLOWED_ERROR_CODES = new Set(['PGRST116']);

function describeError(err: unknown): string {
  if (typeof err !== 'object' || err === null) return String(err);
  const e = err as { code?: string; message?: string; details?: string; hint?: string };
  return `code=${e.code ?? '<none>'} message=${e.message ?? '<none>'} details=${e.details ?? '<none>'} hint=${e.hint ?? '<none>'}`;
}

function isAllowed(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: string }).code;
  return typeof code === 'string' && ALLOWED_ERROR_CODES.has(code);
}

describe('PostgREST select strings are valid against the real schema', () => {
  for (const testCase of REGISTRY) {
    it(`${testCase.id} (${testCase.file})`, async () => {
      resetFetchCount();
      try {
        await testCase.run();
      } catch (err) {
        if (!isAllowed(err)) {
          throw new Error(
            `${testCase.id}: the query was rejected — ${describeError(err)}`,
          );
        }
      }
      expect(
        fetchCount(),
        `${testCase.id} completed without issuing a request: it short-circuited, so this case exercises no select string. Give it arguments that reach PostgREST.`,
      ).toBeGreaterThan(0);
    });
  }
});
```

- [ ] **Step 3: Delete the smoke test and run**

```bash
rm src/test/integration/smoke.itest.ts
pnpm test:integration
```

Expected: PASS, 3 tests. `fetchRecipe` and `fetchRoutine` pass *through* the `PGRST116` branch — the ids match nothing.

- [ ] **Step 4: Prove it bites — an invalid column**

In `src/features/recipes/api.ts`, inside `listRecipes`'s select string, add `, does_not_exist` after an existing column. Then:

```bash
pnpm test:integration
```

Expected: FAIL on `recipes/listRecipes` with `code=42703` and a message naming `does_not_exist`. Revert the edit.

- [ ] **Step 5: Prove it bites — a broken embed**

In `src/features/training/routines/api.ts`, change `fetchRoutine`'s select from `'*, routine_exercises(*)'` to `'*, routine_exercise(*)'`. Then:

```bash
pnpm test:integration
```

Expected: FAIL on `training/routines/fetchRoutine` with `code=PGRST200`. Revert the edit.

- [ ] **Step 6: Prove the short-circuit detector bites**

Temporarily add this case to `REGISTRY`:

```ts
  {
    id: 'sanity/shortCircuit',
    file: 'src/test/integration/registry.ts',
    fn: 'shortCircuit',
    run: async () => [],
  },
```

```bash
pnpm test:integration
```

Expected: FAIL on `sanity/shortCircuit` with "completed without issuing a request". Remove the temporary case and confirm green.

- [ ] **Step 7: Commit**

```bash
git add src/test/integration/
git commit -m "test(tier4): runner validating select strings with an allow-listed error policy"
```

---

### Task 3: Register the remaining 17 helpers

**Files:**
- Modify: `src/test/integration/registry.ts`

**Interfaces:**
- Consumes: `SelectCase`, `MISSING_USER_ID`, `MISSING_ID`, `FIXED_DATE` from Task 2.
- Produces: a `REGISTRY` of exactly 20 cases — the full set the coverage meta-test in Task 4 expects.

- [ ] **Step 1: Add the imports**

At the top of `src/test/integration/registry.ts`, alongside the existing three:

```ts
import { fetchMealLogsForDay, fetchQuickAddRecipeRows } from '@/features/diario/api';
import { listIngredients, listMyIngredientRefIds } from '@/features/ingredients/api';
import { fetchActiveWeek, fetchWeekShopping } from '@/features/planner/api';
import { fetchRecipeNote } from '@/features/recipes/notes';
import { listTemplates, fetchTemplate } from '@/features/templates/api';
import { fetchRecipeMacrosByIds } from '@/features/templates/recipeMacros';
import { listSessions, fetchSession, fetchExerciseHistory } from '@/features/training/api';
import { fetchWorkoutSetsForVolume } from '@/features/training/muscleMap/api';
import { listPrograms, fetchActiveProgram } from '@/features/training/programs/api';
import { listRoutines } from '@/features/training/routines/api';
```

- [ ] **Step 2: Add the 17 cases**

Append to `REGISTRY`:

```ts
  {
    id: 'diario/fetchMealLogsForDay',
    file: 'src/features/diario/api.ts',
    fn: 'fetchMealLogsForDay',
    run: () => fetchMealLogsForDay(MISSING_USER_ID, FIXED_DATE),
  },
  {
    id: 'diario/fetchQuickAddRecipeRows',
    file: 'src/features/diario/api.ts',
    fn: 'fetchQuickAddRecipeRows',
    run: () => fetchQuickAddRecipeRows(MISSING_USER_ID, `${FIXED_DATE}T00:00:00.000Z`),
  },
  {
    id: 'ingredients/listIngredients',
    file: 'src/features/ingredients/api.ts',
    fn: 'listIngredients',
    run: () => listIngredients(5),
  },
  {
    id: 'ingredients/listMyIngredientRefIds',
    file: 'src/features/ingredients/api.ts',
    fn: 'listMyIngredientRefIds',
    run: () => listMyIngredientRefIds(),
  },
  {
    id: 'planner/fetchActiveWeek',
    file: 'src/features/planner/api.ts',
    fn: 'fetchActiveWeek',
    run: () => fetchActiveWeek(MISSING_USER_ID, FIXED_DATE),
  },
  {
    id: 'planner/fetchWeekShopping',
    file: 'src/features/planner/api.ts',
    fn: 'fetchWeekShopping',
    run: () => fetchWeekShopping(MISSING_USER_ID, FIXED_DATE),
  },
  {
    id: 'recipes/fetchRecipeNote',
    file: 'src/features/recipes/notes.ts',
    fn: 'fetchRecipeNote',
    run: () => fetchRecipeNote(MISSING_ID),
  },
  {
    id: 'templates/listTemplates',
    file: 'src/features/templates/api.ts',
    fn: 'listTemplates',
    run: () => listTemplates(MISSING_USER_ID),
  },
  {
    id: 'templates/fetchTemplate',
    file: 'src/features/templates/api.ts',
    fn: 'fetchTemplate',
    run: () => fetchTemplate(MISSING_ID),
  },
  {
    id: 'templates/fetchRecipeMacrosByIds',
    file: 'src/features/templates/recipeMacros.ts',
    fn: 'fetchRecipeMacrosByIds',
    // NOT an empty array: an empty input short-circuits before querying and
    // the runner's request counter would (correctly) fail the case.
    run: () => fetchRecipeMacrosByIds([MISSING_ID]),
  },
  {
    id: 'training/listSessions',
    file: 'src/features/training/api.ts',
    fn: 'listSessions',
    run: () => listSessions(MISSING_USER_ID, 5),
  },
  {
    id: 'training/fetchSession',
    file: 'src/features/training/api.ts',
    fn: 'fetchSession',
    run: () => fetchSession(MISSING_ID),
  },
  {
    id: 'training/fetchExerciseHistory',
    file: 'src/features/training/api.ts',
    fn: 'fetchExerciseHistory',
    run: () => fetchExerciseHistory(MISSING_USER_ID, MISSING_ID),
  },
  {
    id: 'training/muscleMap/fetchWorkoutSetsForVolume',
    file: 'src/features/training/muscleMap/api.ts',
    fn: 'fetchWorkoutSetsForVolume',
    run: () => fetchWorkoutSetsForVolume(FIXED_DATE),
  },
  {
    id: 'training/programs/listPrograms',
    file: 'src/features/training/programs/api.ts',
    fn: 'listPrograms',
    run: () => listPrograms(MISSING_USER_ID),
  },
  {
    id: 'training/programs/fetchActiveProgram',
    file: 'src/features/training/programs/api.ts',
    fn: 'fetchActiveProgram',
    run: () => fetchActiveProgram(MISSING_USER_ID),
  },
  {
    id: 'training/routines/listRoutines',
    file: 'src/features/training/routines/api.ts',
    fn: 'listRoutines',
    run: () => listRoutines(MISSING_USER_ID),
  },
```

- [ ] **Step 3: Run the full tier**

```bash
pnpm test:integration
```

Expected: PASS, 20 tests. If a case fails with a code other than `PGRST116`, that is a **real finding** — a select string that does not match the schema. Do not adjust the test to make it pass: report it, and fix the helper.

- [ ] **Step 4: Reproduce the historical bug**

The regression this work exists to prevent. In `src/features/planner/api.ts`, add `meal_times` to `fetchActiveWeek`'s top-level select list (it belongs to `meal_plan_templates`, not `meal_plan_weeks`):

```bash
pnpm test:integration
```

Expected: FAIL on `planner/fetchActiveWeek` with `code=42703` naming `meal_times`. Revert the edit and confirm 20 green.

- [ ] **Step 5: Typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/test/integration/registry.ts
git commit -m "test(tier4): register all 20 helpers carrying an explicit select"
```

---

### Task 4: The coverage meta-test

**Files:**
- Create: `src/test/integration/coverage.itest.ts`

**Interfaces:**
- Consumes: `REGISTRY` (fields `file`, `fn`) from Tasks 2-3.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Write the meta-test**

Create `src/test/integration/coverage.itest.ts`:

```ts
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REGISTRY } from './registry';

const ROOT = path.resolve(__dirname, '../../..');

// Call sites deliberately outside the guard, with the reason. A bare `'*'`
// names no column and cannot break; these four also live inside page
// components, so they are not invocable without rendering.
const EXCLUDED: Record<string, string> = {
  'src/pages/ExerciseHistoryPage.tsx': "select('*') inside a page component",
  'src/pages/EntrenamientoPage.tsx': "select('*') inside a page component",
  'src/pages/RoutineEditorPage.tsx': "select('*') inside a page component",
  'src/pages/SessionEditorPage.tsx': "select('*') inside a page component",
};

/** A select string that names columns or an embed — i.e. one that can break. */
function hasExplicitSelect(body: string): boolean {
  for (const match of body.matchAll(/\.select\(\s*([^)]*)/g)) {
    const arg = match[1].trim();
    if (arg === '') continue; // bare .select()
    if (/^(['"`])\*\1$/.test(arg)) continue; // exactly '*'
    return true;
  }
  return false;
}

function sourceFiles(): string[] {
  // `git ls-files src` then filter in JS: git pathspec globs treat `*` as
  // matching `/` too, so `src/**/*.ts` is not the glob it looks like. Listing
  // the tree and filtering here is unambiguous. Tracked files only, so an
  // untracked scratch file cannot fail the build.
  return execFileSync('git', ['ls-files', 'src'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
    .filter((f) => !/\.(test|itest)\.tsx?$/.test(f));
}

/** Exported functions whose body carries an explicit select. */
function helpersNeedingCoverage(): { file: string; fn: string }[] {
  const found: { file: string; fn: string }[] = [];
  for (const file of sourceFiles()) {
    if (file in EXCLUDED) continue;
    const source = readFileSync(path.join(ROOT, file), 'utf8');
    if (!source.includes('.select(')) continue;
    const marks = [...source.matchAll(/export (?:async )?function (\w+)/g)];
    marks.forEach((mark, i) => {
      const start = mark.index ?? 0;
      const end = i + 1 < marks.length ? (marks[i + 1].index ?? source.length) : source.length;
      if (hasExplicitSelect(source.slice(start, end))) found.push({ file, fn: mark[1] });
    });
  }
  return found;
}

describe('every helper with an explicit select is registered', () => {
  const registered = new Set(REGISTRY.map((c) => `${c.file}#${c.fn}`));

  it('has no unregistered helper', () => {
    const missing = helpersNeedingCoverage()
      .map((h) => `${h.file}#${h.fn}`)
      .filter((key) => !registered.has(key));
    expect(
      missing,
      `These helpers carry a select string that can break but have no case in src/test/integration/registry.ts. Add one, or add the file to EXCLUDED with a written reason:\n  ${missing.join('\n  ')}`,
    ).toEqual([]);
  });

  it('has no stale registry entry', () => {
    const live = new Set(helpersNeedingCoverage().map((h) => `${h.file}#${h.fn}`));
    const stale = [...registered].filter((key) => !live.has(key));
    expect(
      stale,
      `These registry cases name a helper that no longer carries an explicit select (renamed, deleted, or its select changed). Remove them:\n  ${stale.join('\n  ')}`,
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it**

```bash
pnpm test:integration
```

Expected: PASS, 22 tests (20 select cases + 2 coverage assertions).

- [ ] **Step 3: Prove the "unregistered" branch bites**

Add a throwaway helper to `src/features/objetivos/api.ts`:

```ts
export async function tempUnregisteredHelper(): Promise<void> {
  await supabase.from('goals').select('id, user_id').limit(1);
}
```

```bash
pnpm test:integration
```

Expected: FAIL on "has no unregistered helper", naming `src/features/objetivos/api.ts#tempUnregisteredHelper`. Delete the helper and confirm green.

- [ ] **Step 4: Prove the "stale" branch bites**

In `src/test/integration/registry.ts`, change one case's `fn` from `listRecipes` to `listRecipesRenamed`.

```bash
pnpm test:integration
```

Expected: two failures — "has no unregistered helper" (the real `listRecipes` is now unclaimed) and "has no stale registry entry" (naming the phantom). Revert and confirm 22 green.

- [ ] **Step 5: Commit**

```bash
git add src/test/integration/coverage.itest.ts
git commit -m "test(tier4): fail the build when a helper's select string is unguarded"
```

---

### Task 5: Wire the tier into CI

**Files:**
- Modify: `.github/workflows/ci.yml` (the `db-test` job)

**Interfaces:**
- Consumes: `pnpm test:integration`, `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY` from Task 1.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Extend the `db-test` job**

In `.github/workflows/ci.yml`, between the `Run pgTAP suite` step and the `Stop stack` step, insert:

```yaml
      # Tier-4 (R-32): the client's PostgREST select strings, run against the
      # stack this job already started. Node/pnpm are set up here rather than
      # in a new job so the stack is not stood up twice.
      - uses: pnpm/action-setup@v6
        with:
          version: 10

      - uses: actions/setup-node@v7
        with:
          node-version: 20
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Run Tier-4 select-string guard
        run: |
          eval "$(supabase status -o env | sed -n 's/^ANON_KEY=/SUPABASE_TEST_ANON_KEY=/p')"
          export SUPABASE_TEST_ANON_KEY
          pnpm test:integration
```

Leave `Stop stack` (`if: always()`) as the final step.

- [ ] **Step 2: Update the job's header comment**

The `db-test` comment block above the job currently describes pgTAP only. Append:

```yaml
  # It also runs Tier-4 (R-32): the real fetch helpers against this stack, so an
  # invalid `.select(...)` string fails here rather than in production.
```

- [ ] **Step 3: Verify the env extraction locally**

```bash
eval "$(supabase status -o env | sed -n 's/^ANON_KEY=/SUPABASE_TEST_ANON_KEY=/p')"
export SUPABASE_TEST_ANON_KEY
test -n "$SUPABASE_TEST_ANON_KEY" && echo "key extracted OK"
pnpm test:integration
```

Expected: `key extracted OK` and 22 passing tests. This is the exact command CI runs, so a quoting mistake surfaces here rather than on the runner.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(db-test): run the Tier-4 select-string guard against the local stack"
```

---

### Task 6: Documentation

**Files:**
- Modify: `docs/roadmap.md` (the R-32 entry, and the one-line index at the top)
- Modify: `docs/operations.md` (CI job description)
- Modify: `docs/architecture.md` (test tiers)
- Modify: `CLAUDE.md` (Commands + invariant 4's CI list)
- Modify: `docs/decisions.md` (new D-id)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Update the R-32 roadmap entry**

Set `status:` to partially done, dated 2026-07-23: scope item 1 (integration tier) is built and required in CI; **scope item 2 (agent-browser e2e over planner load / apply-template) is NOT built and R-32 stays open for it**. Remove the "standing rule until built" paragraph for select strings — the gate now enforces it — and state that the rule is superseded by Tier-4. Update the one-line entry at `docs/roadmap.md:42` to match. Record the inventory: 20 guarded helpers, `select()`/`select('*')` out of scope, mutations out of scope.

- [ ] **Step 2: Update `docs/operations.md`**

In the CI section, describe `db-test` as running pgTAP **and** the Tier-4 select-string guard. Document `pnpm test:integration`, that it needs a running local stack, and the `SUPABASE_TEST_ANON_KEY` export (with the `supabase status -o env` one-liner). Note that the tier refuses to run against a non-local host.

- [ ] **Step 3: Update `docs/architecture.md`**

Wherever the test tiers are listed, add Tier-4: `*.itest.ts`, own Vitest config, real helpers against the local stack, guards PostgREST select strings, does not assert on data shape (pgTAP still owns RLS).

- [ ] **Step 4: Update `CLAUDE.md`**

Add `pnpm test:integration` to the Commands block with a one-line note that it needs a local stack. In hard invariant 4, the `db-test` description becomes "Tier-3 pgTAP + Tier-4 select-string guard against a real Postgres".

- [ ] **Step 5: Add the decision record**

In `docs/decisions.md`, add the next free `D-F` id: *guard the select strings, not the response shape*. Record the reasoning — PostgREST validates the select before filtering, so a non-existent user id needs no seed or auth; shape assertions would need fixtures that age with the schema and would duplicate pgTAP's RLS coverage; the accepted cost is that a wrong `as unknown as {…}` mapping still passes.

- [ ] **Step 6: Verify the doc edits are accurate**

```bash
grep -n "test:integration" CLAUDE.md docs/operations.md
grep -n "Tier-4" docs/architecture.md docs/operations.md docs/roadmap.md
```

Expected: each file shows the new references; no stale claim that select strings must be hand-verified.

- [ ] **Step 7: Commit**

```bash
git add docs/ CLAUDE.md
git commit -m "docs: record Tier-4 select-string guard (R-32 partial)"
```

---

### Task 7: Full verification and PR

**Files:** none (verification only)

- [ ] **Step 1: Run every gate the way CI does**

```bash
pnpm lint && pnpm build && pnpm test
```

Expected: all three clean. Run them yourself — do not trust a summary that says they passed.

- [ ] **Step 2: Run Tier-3 and Tier-4 against a fresh stack**

```bash
supabase stop --no-backup
supabase start -x studio,imgproxy,edge-runtime,logflare,vector
supabase test db
eval "$(supabase status -o env | sed -n 's/^ANON_KEY=/SUPABASE_TEST_ANON_KEY=/p')"
export SUPABASE_TEST_ANON_KEY
pnpm test:integration
```

Expected: pgTAP green, then 22 Tier-4 tests green. A fresh stack proves the tier does not depend on state left by earlier runs.

- [ ] **Step 3: Confirm the tree is clean**

```bash
git status --short
```

Expected: empty. Every mutation from the bite-proofs must have been reverted; a leftover broken select would ship.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin claude/r32-select-guard
gh pr create --base develop --title "test(ci): Tier-4 guard for PostgREST select strings (R-32)" --body "<summary + the recorded red-then-green evidence>"
```

The PR body must list the five bite-proofs and the historical-bug reproduction with their observed error codes. Do **not** enable auto-merge until the work is finished and reviewed.

- [ ] **Step 5: Stop the local stack**

```bash
supabase stop --no-backup
```

---

## Notes for the implementer

- **A red case may be a real bug, not a broken test.** If a helper fails with `42703` or `PGRST200` on first run, its select string genuinely does not match the schema. Report it; do not weaken the assertion.
- **Never widen `ALLOWED_ERROR_CODES` to make a case pass.** The allow-list is the whole point.
- **The stack must be running.** Every `pnpm test:integration` step assumes `supabase start` has been run from this worktree and `SUPABASE_TEST_ANON_KEY` is exported.
- **Ports are 563xx** (API 56321, DB 56322). If something tries 553xx, it is reading a stale config.
- **Do not touch production code** beyond the temporary, reverted mutations used to prove the tests bite.
