# U-1 Sub-macros (sugar + saturated fat) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track optional sugar + saturated-fat sub-macros from the ingredient level up to an honest-partial "consumed today" total in the diary, importing both from OpenFoodFacts when present.

**Architecture:** A new pure `core/subMacros.ts` module carries the null/partial-aware aggregation **alongside** the existing 5-field `Macros` core (which is left untouched — lowest risk to the parity-tested path). New nullable DB columns on `ingredients` / `meal_logs` / `daily_nutrition_history`. The diary computes sub-macros live; the cron edge persists them with a per-field completeness flag.

**Tech Stack:** React 18 + Vite + TS, Supabase (Postgres + Deno edge functions), Vitest, RHF + zod, i18next.

**Spec:** `docs/superpowers/specs/2026-05-23-sub-macros-design.md`

**Branch:** `claude/u1-sub-macros` off `develop`. PR into `develop`.

> ⚠ **Operational gate (read before Task 3):** there is one Supabase project (no
> local DB — R-00 infra not stood up), so the migration in Task 3 is applied to
> **production** via Supabase MCP `apply_migration`. The shared dev/preview
> environment reads that same DB, so the migration MUST be applied **before** the
> code that reads the new columns is merged/deployed (ordered apply, per
> `docs/operations.md`). **Do not apply the migration to prod without explicit
> user approval at that checkpoint.**

---

## File structure

- **Create** `src/core/subMacros.ts` — pure null/partial-aware sugar+sat-fat aggregation.
- **Create** `src/core/subMacros.test.ts` — Tier-1 tests.
- **Modify** `src/core/macros.ts` — add 2 optional fields to `CoreIngredient` (no behavior change).
- **Create** `supabase/migrations/<ts>_u1_sub_macros.sql` — additive columns.
- **Modify** `src/types/database.ts` — interim hand-edit of the 3 tables (until R-04 regen).
- **Modify** `src/lib/openfoodfacts.ts` — map `sugars_100g` / `saturated-fat_100g` (null when absent).
- **Modify** `src/lib/openfoodfacts.test.ts` (or create) — mapping tests.
- **Modify** `src/features/ingredients/schema.ts` — 2 nullable sub-macro fields.
- **Modify** `src/features/ingredients/components/IngredientFormFields.tsx` — 2 "of which" inputs + soft warning.
- **Modify** `src/features/ingredients/api.ts` — carry the 2 fields in create/import payloads + `ManualIngredientInput`.
- **Modify** `src/features/recipes/macros.ts` — add `rowSubContribution` / `computeRecipeSub` client wrappers.
- **Modify** `src/features/diario/macros.ts` — `computeMealLogSub` + `sumSub`.
- **Modify** `src/features/diario/components/DayTotalsCard.tsx` — sugar/sat-fat lines with partial qualifier.
- **Modify** `supabase/functions/_shared/macros.ts` — re-export subMacros + extend the snake adapter.
- **Modify** `supabase/functions/daily-nutrition-snapshot/index.ts` — populate the 8 new history columns.
- **Modify** `supabase/functions/_shared/macros.test.ts` — golden-vector parity for sub-macros.
- **Modify** `src/i18n/{es,en}/{ingredientes,diario}.json` — labels + partial qualifier.

---

## Task 1: `subMacros` core module (the heart)

**Files:**
- Create: `src/core/subMacros.ts`
- Test: `src/core/subMacros.test.ts`
- Modify: `src/core/macros.ts` (CoreIngredient only)

- [ ] **Step 1: Extend `CoreIngredient` with two optional fields**

In `src/core/macros.ts`, add to the `CoreIngredient` interface (after `fiberGPerUnit`):

```ts
  /** Optional "of which" sub-macros (U-1). `null`/absent = unknown (≠ 0). */
  sugarGPerUnit?: Numeric | null;
  satFatGPerUnit?: Numeric | null;
```

(No other change to `macros.ts` — existing functions ignore these fields, so the parity-tested arithmetic is untouched.)

- [ ] **Step 2: Write the failing test** — `src/core/subMacros.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import {
  ZERO_SUB,
  ingredientSub,
  addSub,
  scaleSub,
  isComplete,
  type CoreIngredientSub,
} from './subMacros';

const gramIng = (sugar: number | null, sat: number | null): CoreIngredientSub => ({
  unitType: 'gram',
  sugarGPerUnit: sugar,
  satFatGPerUnit: sat,
});

describe('ingredientSub', () => {
  it('known value scales per 100g', () => {
    const r = ingredientSub(gramIng(10, 4), 200); // 200g → ×2
    expect(r.sugarG).toEqual({ known: 20, missing: 0 });
    expect(r.satFatG).toEqual({ known: 8, missing: 0 });
  });

  it('null is unknown (missing 1), NOT zero', () => {
    const r = ingredientSub(gramIng(null, 4), 100);
    expect(r.sugarG).toEqual({ known: 0, missing: 1 });
    expect(r.satFatG).toEqual({ known: 4, missing: 0 });
  });

  it('per-unit ingredient divides by 1', () => {
    const r = ingredientSub({ unitType: 'unit', sugarGPerUnit: 3, satFatGPerUnit: null }, 2);
    expect(r.sugarG).toEqual({ known: 6, missing: 0 });
    expect(r.satFatG).toEqual({ known: 0, missing: 1 });
  });

  it('non-positive quantity yields ZERO_SUB', () => {
    expect(ingredientSub(gramIng(10, 4), 0)).toEqual(ZERO_SUB);
  });
});

describe('addSub', () => {
  it('sums known and missing field-wise', () => {
    const a = ingredientSub(gramIng(10, null), 100); // sugar known 10, sat missing 1
    const b = ingredientSub(gramIng(null, 5), 100);  // sugar missing 1, sat known 5
    const s = addSub(a, b);
    expect(s.sugarG).toEqual({ known: 10, missing: 1 });
    expect(s.satFatG).toEqual({ known: 5, missing: 1 });
  });
});

describe('scaleSub', () => {
  it('scales known, leaves missing untouched', () => {
    const a = ingredientSub(gramIng(10, null), 100); // sugar {10,0}, sat {0,1}
    const s = scaleSub(a, 0.5);
    expect(s.sugarG).toEqual({ known: 5, missing: 0 });
    expect(s.satFatG).toEqual({ known: 0, missing: 1 });
  });
});

describe('isComplete', () => {
  it('true only when missing === 0', () => {
    expect(isComplete({ known: 5, missing: 0 })).toBe(true);
    expect(isComplete({ known: 5, missing: 2 })).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- src/core/subMacros.test.ts`
Expected: FAIL — `Cannot find module './subMacros'`.

- [ ] **Step 4: Write `src/core/subMacros.ts`**

```ts
// Pure null/partial-aware sub-macro aggregation (U-1).
//
// Sugar and saturated fat are OPTIONAL "of which" sub-components (sugar ⊂ carbs,
// sat-fat ⊂ fat). They are informational and never add calories. This module is
// deliberately SEPARATE from the 5-field `Macros` core (`macros.ts`) so that the
// parity-tested primary arithmetic carries zero new risk and all the "unknown"
// (`null` ≠ 0) complexity is quarantined here.
//
// Same rules as `macros.ts`: dependency-free, runtime-agnostic, camelCase;
// imported directly by the Vite client and the Deno edge.

import type { Numeric } from './macros';

/** One optional sub-macro carried through aggregation. */
export interface PartialSub {
  known: number;   // sum of contributions that HAD a value
  missing: number; // count of leaf contributions with NO value
}

export interface SubMacros {
  sugarG: PartialSub;
  satFatG: PartialSub;
}

/** Sub-macro view of an ingredient row. */
export interface CoreIngredientSub {
  unitType: string;
  sugarGPerUnit?: Numeric | null;
  satFatGPerUnit?: Numeric | null;
}

export const ZERO_SUB: SubMacros = {
  sugarG: { known: 0, missing: 0 },
  satFatG: { known: 0, missing: 0 },
};

function divisor(unitType: string): number {
  return unitType === 'unit' ? 1 : 100;
}

function field(value: Numeric | null | undefined, factor: number): PartialSub {
  if (value === null || value === undefined) return { known: 0, missing: 1 };
  return { known: Number(value) * factor, missing: 0 };
}

/** Sub-macros contributed by `quantity` of one ingredient. */
export function ingredientSub(ing: CoreIngredientSub, quantity: number): SubMacros {
  if (!Number.isFinite(quantity) || quantity <= 0) return ZERO_SUB;
  const factor = quantity / divisor(ing.unitType);
  return {
    sugarG: field(ing.sugarGPerUnit, factor),
    satFatG: field(ing.satFatGPerUnit, factor),
  };
}

function addPartial(a: PartialSub, b: PartialSub): PartialSub {
  return { known: a.known + b.known, missing: a.missing + b.missing };
}

export function addSub(a: SubMacros, b: SubMacros): SubMacros {
  return {
    sugarG: addPartial(a.sugarG, b.sugarG),
    satFatG: addPartial(a.satFatG, b.satFatG),
  };
}

/** Scale `known` only; `missing` is a count of unknown lines, scale-invariant. */
export function scaleSub(s: SubMacros, k: number): SubMacros {
  return {
    sugarG: { known: s.sugarG.known * k, missing: s.sugarG.missing },
    satFatG: { known: s.satFatG.known * k, missing: s.satFatG.missing },
  };
}

export function isComplete(p: PartialSub): boolean {
  return p.missing === 0;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test -- src/core/subMacros.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add src/core/subMacros.ts src/core/subMacros.test.ts src/core/macros.ts
git commit -m "feat(core): add null-aware sub-macro aggregation (sugar, saturated fat)"
```

---

## Task 2: `computeRecipeSub` core helper

**Files:**
- Modify: `src/core/subMacros.ts`
- Modify: `src/core/subMacros.test.ts`

- [ ] **Step 1: Add the failing test** (append to `subMacros.test.ts`)

```ts
import { computeRecipeSub } from './subMacros';

describe('computeRecipeSub', () => {
  it('totals then per-serving over servings', () => {
    const r = computeRecipeSub({
      servings: 2,
      ingredients: [
        { quantity: 100, perServing: false, ingredient: gramIng(10, 4) },
        { quantity: 100, perServing: false, ingredient: gramIng(null, 2) },
      ],
    });
    expect(r.total.sugarG).toEqual({ known: 10, missing: 1 });
    expect(r.total.satFatG).toEqual({ known: 6, missing: 0 });
    expect(r.perServing.sugarG).toEqual({ known: 5, missing: 1 });
    expect(r.perServing.satFatG).toEqual({ known: 3, missing: 0 });
  });
});
```

- [ ] **Step 2: Run to verify fail** — `pnpm test -- src/core/subMacros.test.ts` → FAIL (`computeRecipeSub` undefined).

- [ ] **Step 3: Implement** (append to `subMacros.ts`)

```ts
export interface CoreRecipeIngredientSub {
  quantity: Numeric;
  perServing: boolean;
  ingredient: CoreIngredientSub;
}

export interface CoreRecipeSub {
  servings: Numeric;
  ingredients: CoreRecipeIngredientSub[];
}

export function computeRecipeSub(recipe: CoreRecipeSub): {
  total: SubMacros;
  perServing: SubMacros;
} {
  const servings = Number(recipe.servings) > 0 ? Number(recipe.servings) : 1;
  const total = (recipe.ingredients ?? []).reduce<SubMacros>((acc, ri) => {
    const qty = ri.perServing ? Number(ri.quantity) * servings : Number(ri.quantity);
    return addSub(acc, ingredientSub(ri.ingredient, qty));
  }, ZERO_SUB);
  return { total, perServing: scaleSub(total, 1 / servings) };
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm test -- src/core/subMacros.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/subMacros.ts src/core/subMacros.test.ts
git commit -m "feat(core): add computeRecipeSub per-serving sub-macro helper"
```

---

## Task 3: DB migration (additive) — ⚠ prod-apply gate

**Files:**
- Create: `supabase/migrations/<timestamp>_u1_sub_macros.sql` (timestamp `> ` the latest existing migration; use `YYYYMMDDHHMMSS`).

- [ ] **Step 1: Write the migration**

```sql
-- U-1 sub-macros: optional sugar + saturated fat. Additive, nullable, no backfill.
alter table public.ingredients
  add column if not exists sugar_g_per_unit numeric(6,2)
    check (sugar_g_per_unit is null or sugar_g_per_unit >= 0),
  add column if not exists saturated_fat_g_per_unit numeric(6,2)
    check (saturated_fat_g_per_unit is null or saturated_fat_g_per_unit >= 0);

alter table public.meal_logs
  add column if not exists custom_sugar_g numeric(6,2),
  add column if not exists custom_saturated_fat_g numeric(6,2);

alter table public.daily_nutrition_history
  add column if not exists planned_sugar_g numeric(6,2),
  add column if not exists consumed_sugar_g numeric(6,2),
  add column if not exists planned_sugar_complete boolean not null default true,
  add column if not exists consumed_sugar_complete boolean not null default true,
  add column if not exists planned_saturated_fat_g numeric(6,2),
  add column if not exists consumed_saturated_fat_g numeric(6,2),
  add column if not exists planned_saturated_fat_complete boolean not null default true,
  add column if not exists consumed_saturated_fat_complete boolean not null default true;
```

- [ ] **Step 2: Commit the file**

```bash
git add supabase/migrations/<timestamp>_u1_sub_macros.sql
git commit -m "feat(db): add optional sugar/saturated-fat columns (migration)"
```

- [ ] **Step 3: ⚠ STOP — request user approval to apply to prod.** Apply via Supabase MCP `apply_migration` (name `u1_sub_macros`, the SQL above) only after the user approves. Verify with `list_tables` that the columns exist on all three tables. Record the apply in the PR description.

---

## Task 4: Interim types hand-edit

**Files:**
- Modify: `src/types/database.ts` (`ingredients`, `meal_logs`, `daily_nutrition_history` Row/Insert/Update).

- [ ] **Step 1: Add the columns to each of the three tables' Row/Insert/Update blocks.** For `ingredients`: `sugar_g_per_unit: number | null` (Row) / `sugar_g_per_unit?: number | null` (Insert/Update) and the same for `saturated_fat_g_per_unit`. For `meal_logs`: `custom_sugar_g` / `custom_saturated_fat_g` as `number | null`. For `daily_nutrition_history`: the 4 `*_sugar_g` / `*_saturated_fat_g` as `number | null` and the 4 `*_complete` as `boolean` (Row) / `boolean` (Insert/Update, optional). Add a `// U-1 interim hand-edit (until R-04 regen)` marker comment above each block, matching the existing R-01 marker style.

- [ ] **Step 2: Verify** — `pnpm typecheck` → 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(types): add sub-macro columns (interim hand-edit)"
```

---

## Task 5: OpenFoodFacts mapping (null when absent)

**Files:**
- Modify: `src/lib/openfoodfacts.ts`
- Test: `src/lib/openfoodfacts.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { mapOFFNutriments } from './openfoodfacts';

describe('OFF sub-macro mapping', () => {
  it('maps sugar and saturated fat when present', () => {
    const r = mapOFFNutriments({ 'energy-kcal_100g': 100, sugars_100g: 9, 'saturated-fat_100g': 3 });
    expect(r.sugarPer100g).toBe(9);
    expect(r.satFatPer100g).toBe(3);
  });
  it('returns null (not 0) when OFF omits them', () => {
    const r = mapOFFNutriments({ 'energy-kcal_100g': 100 });
    expect(r.sugarPer100g).toBeNull();
    expect(r.satFatPer100g).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify fail** — `pnpm test -- src/lib/openfoodfacts.test.ts` → FAIL.

- [ ] **Step 3: Implement.** In `src/lib/openfoodfacts.ts`:
  - Extend `OFFNutriments` with `sugars_100g?: number;` and `'saturated-fat_100g'?: number;`.
  - Extend `OFFSearchResult` (and therefore `OFFProductLookup`) with `sugarPer100g: number | null;` and `satFatPer100g: number | null;`.
  - Add an exported helper `export function mapOFFNutriments(n: OFFNutriments): { sugarPer100g: number | null; satFatPer100g: number | null } { return { sugarPer100g: n.sugars_100g != null ? round2(n.sugars_100g) : null, satFatPer100g: n['saturated-fat_100g'] != null ? round2(n['saturated-fat_100g']) : null }; }`
  - In `searchOpenFoodFacts` map and `getProductByBarcode`, spread `...mapOFFNutriments(p.nutriments ?? {})` (resp. `n ?? {}`) into the returned object. Add `sugars_100g,saturated-fat_100g` to the `fields=` query params in both fetch calls.

- [ ] **Step 4: Run to verify pass** — `pnpm test -- src/lib/openfoodfacts.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/openfoodfacts.ts src/lib/openfoodfacts.test.ts
git commit -m "feat(off): import sugar + saturated fat (null when absent)"
```

---

## Task 6: Ingredient form schema + fields (nullable + soft warning)

**Files:**
- Modify: `src/features/ingredients/schema.ts`
- Modify: `src/features/ingredients/components/IngredientFormFields.tsx`

- [ ] **Step 1: Schema — add two nullable-from-string fields.** In `schema.ts`, add a helper mirroring `fiberFromString` but blank → `null`:

```ts
// Optional sub-macro: blank string means NULL (unknown ≠ 0).
const optionalNonNegFromString = z
  .string()
  .transform((s) => (s.trim() === '' ? null : Number(s)))
  .pipe(z.number().min(0).nullable());
```

Add to `ingredientFormSchema`: `sugar_g_per_unit: optionalNonNegFromString,` and `saturated_fat_g_per_unit: optionalNonNegFromString,`.

- [ ] **Step 2: Form state defaults.** In `IngredientFormFields.tsx`, add `sugar_g_per_unit: ''` and `saturated_fat_g_per_unit: ''` to `emptyForm`; add the same two `String(ing.sugar_g_per_unit ?? '')` mappings in `ingredientToForm` (guarding null → `''`); add the two fields to `ParsedIngredient` (`number | null`) and to `parseForm`'s return (passing `v.sugar_g_per_unit` straight through).

- [ ] **Step 3: Render the two "of which" inputs.** Under the carbs `NumberField` add a sugar field, under the fat `NumberField` add a sat-fat field (both `required={false}`), labelled `t('form.sugar')` / `t('form.satFat')`. Below the macros grid add a soft warning paragraph (non-blocking) shown when `Number(value.sugar_g_per_unit) > Number(value.carbs_g_per_unit)` or `Number(value.saturated_fat_g_per_unit) > Number(value.fat_g_per_unit)` (only when both sides are non-blank): `<p className="text-xs text-amber-600">{t('form.subMacroWarning')}</p>`.

- [ ] **Step 4: Verify** — `pnpm typecheck` → 0; `pnpm test` (existing IngredientDialog Tier-2, if any) → green.

- [ ] **Step 5: Commit**

```bash
git add src/features/ingredients/schema.ts src/features/ingredients/components/IngredientFormFields.tsx
git commit -m "feat(ingredients): optional sugar/saturated-fat inputs with soft warning"
```

---

## Task 7: Persist the new fields on create/import

**Files:**
- Modify: `src/features/ingredients/api.ts`

- [ ] **Step 1: Extend `ManualIngredientInput`** with `sugar_g_per_unit: number | null;` and `saturated_fat_g_per_unit: number | null;`.

- [ ] **Step 2:** In `createManualIngredient`'s `payload`, add `sugar_g_per_unit: input.sugar_g_per_unit, saturated_fat_g_per_unit: input.saturated_fat_g_per_unit,`.

- [ ] **Step 3:** In `importIngredientFromOFF`'s `payload`, add `sugar_g_per_unit: overrides?.sugar_g_per_unit ?? product.sugarPer100g, saturated_fat_g_per_unit: overrides?.saturated_fat_g_per_unit ?? product.satFatPer100g,`.

- [ ] **Step 4:** Wherever the dialog builds `ManualIngredientInput` from `parseForm` output (in `IngredientDialog.tsx`), pass the two new parsed fields through. (Read `IngredientDialog.tsx` to locate the submit mapping; mirror the existing fields.)

- [ ] **Step 5: Verify** — `pnpm typecheck` → 0.

- [ ] **Step 6: Commit**

```bash
git add src/features/ingredients/api.ts src/features/ingredients/components/IngredientDialog.tsx
git commit -m "feat(ingredients): persist sub-macros on create + OFF import"
```

---

## Task 8: Recipe sub-macro client wrappers

**Files:**
- Modify: `src/features/recipes/macros.ts`

- [ ] **Step 1: Add wrappers** mirroring `computeRecipeMacros`, delegating to the core:

```ts
import {
  computeRecipeSub as coreComputeRecipeSub,
  type SubMacros,
} from '@/core/subMacros';
export type { SubMacros } from '@/core/subMacros';

export function computeRecipeSub(opts: {
  servings: number;
  rows: RecipeRowMacrosInput[];
}): { total: SubMacros; perServing: SubMacros } {
  return coreComputeRecipeSub({
    servings: opts.servings,
    ingredients: opts.rows.map((r) => ({
      quantity: r.quantity,
      perServing: r.perServing,
      ingredient: {
        unitType: r.ingredient.unit_type,
        sugarGPerUnit: (r.ingredient as { sugar_g_per_unit?: number | null }).sugar_g_per_unit ?? null,
        satFatGPerUnit: (r.ingredient as { saturated_fat_g_per_unit?: number | null }).saturated_fat_g_per_unit ?? null,
      },
    })),
  });
}
```

Also widen `RecipeRowMacrosInput['ingredient']` `Pick<>` to include `'sugar_g_per_unit' | 'saturated_fat_g_per_unit'`.

- [ ] **Step 2: Verify** — `pnpm typecheck` → 0; `pnpm test` → green.

- [ ] **Step 3: Commit**

```bash
git add src/features/recipes/macros.ts
git commit -m "feat(recipes): per-serving sub-macro client wrapper"
```

---

## Task 9: Diary live sub-macro total + display

**Files:**
- Modify: `src/features/diario/macros.ts`
- Modify: `src/features/diario/components/DayTotalsCard.tsx`
- Test: `src/features/diario/macros.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test** for the diary aggregation:

```ts
import { describe, it, expect } from 'vitest';
import { computeMealLogSub, sumSub } from './macros';

// minimal log shapes — ingredient log with known sugar, custom log with unknown
it('aggregates known + missing across logs', () => {
  const a = computeMealLogSub({ ingredient_id: 'i', ingredient: { unit_type: 'gram', sugar_g_per_unit: 10, saturated_fat_g_per_unit: null }, quantity: 100 } as never);
  const b = computeMealLogSub({ custom_name: 'x', custom_sugar_g: null, custom_saturated_fat_g: 2 } as never);
  const s = sumSub([a, b]);
  expect(s.sugarG).toEqual({ known: 10, missing: 1 });
  expect(s.satFatG).toEqual({ known: 2, missing: 1 });
});
```

- [ ] **Step 2: Run to verify fail** — `pnpm test -- src/features/diario/macros.test.ts` → FAIL.

- [ ] **Step 3: Implement `computeMealLogSub` + `sumSub`** in `diario/macros.ts`, mirroring `computeMealLogMacros`/`sumMacros` but using the subMacros core. Recipe branch → `computeRecipeSub(...).perServing` then `scaleSub(perServing, servings)`. Ingredient branch → `ingredientSub({ unitType, sugarGPerUnit, satFatGPerUnit }, qty)`. Custom branch → `{ sugarG: field(custom_sugar_g), satFatG: field(custom_saturated_fat_g) }` where a `null` custom field → `{known:0,missing:1}` and a number → `{known:value,missing:0}`. `sumSub` reduces with `addSub` from `ZERO_SUB`.

- [ ] **Step 4: Run to verify pass** — `pnpm test -- src/features/diario/macros.test.ts` → PASS.

- [ ] **Step 5: Display in `DayTotalsCard.tsx`.** (Read the file first.) Compute the day's `SubMacros` from the same logs the card already sums for `Macros`. Add two secondary lines below the primary macros: `Sugar` and `Saturated fat`, each rendering `roundMacro(known)` g; when `missing > 0` prefix "≥" and append the qualifier `t('totals.subPartial', { count: missing })`. When `known === 0 && missing > 0` show only the qualifier (all-unknown). Keep them visually secondary (smaller / muted), NOT in the primary ring.

- [ ] **Step 6: Verify** — `pnpm typecheck`, `pnpm test`, `pnpm lint` → green.

- [ ] **Step 7: Commit**

```bash
git add src/features/diario/macros.ts src/features/diario/macros.test.ts src/features/diario/components/DayTotalsCard.tsx
git commit -m "feat(diario): live sugar + saturated-fat daily totals (honest-partial)"
```

---

## Task 10: Edge persistence + parity

**Files:**
- Modify: `supabase/functions/_shared/macros.ts`
- Modify: `supabase/functions/daily-nutrition-snapshot/index.ts`
- Modify: `supabase/functions/_shared/macros.test.ts`

- [ ] **Step 1: Extend the snake adapter.** In `_shared/macros.ts`, re-export the subMacros core (`addSub, scaleSub, ingredientSub, computeRecipeSub, ZERO_SUB, isComplete, type SubMacros, type CoreIngredientSub` from `../../../src/core/subMacros.ts`). Add a `toSnakeSub(s: SubMacros, prefix: 'planned' | 'consumed')` returning the 4 columns for that prefix: `{ [`${prefix}_sugar_g`]: s.sugarG.known, [`${prefix}_sugar_complete`]: isComplete(s.sugarG), [`${prefix}_saturated_fat_g`]: s.satFatG.known, [`${prefix}_saturated_fat_complete`]: isComplete(s.satFatG) }` (typed explicitly, not computed keys, to keep TS happy).

- [ ] **Step 2: Populate in the snapshot writer.** (Read `daily-nutrition-snapshot/index.ts`.) Wherever `computePlanned` / `computeConsumed` build the `Macros` upsert row, compute the parallel `SubMacros` from the same source rows and spread `toSnakeSub(plannedSub, 'planned')` / `toSnakeSub(consumedSub, 'consumed')` into the `daily_nutrition_history` upsert payload.

- [ ] **Step 3: Parity golden-vector test.** In `_shared/macros.test.ts`, add a fixture asserting `ingredientSub`/`computeRecipeSub` produce identical results to the client path for a known vector incl. a `null` field (the cross-runtime parity guarantee).

- [ ] **Step 4: Verify** — `pnpm test` → green (Node + edge fixtures).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/macros.ts supabase/functions/daily-nutrition-snapshot/index.ts supabase/functions/_shared/macros.test.ts
git commit -m "feat(edge): persist daily sub-macro totals + completeness flags"
```

> Edge **deploy** to prod (`supabase functions deploy daily-nutrition-snapshot --use-api`) is a gated step at the Wave checkpoint — request user approval, same as the migration.

---

## Task 11: i18n

**Files:**
- Modify: `src/i18n/es/ingredientes.json`, `src/i18n/en/ingredientes.json`
- Modify: `src/i18n/es/diario.json`, `src/i18n/en/diario.json`

- [ ] **Step 1:** Add `form.sugar`, `form.satFat`, `form.subMacroWarning` to both `ingredientes` files (ES: "De los cuales azúcares" / "De las cuales saturadas" / "El azúcar no puede superar los carbohidratos, ni las saturadas la grasa total — revisa el valor."; EN: "of which sugars" / "of which saturated" / "Sugar can't exceed total carbs, nor saturated exceed total fat — check the value.").

- [ ] **Step 2:** Add `totals.sugar`, `totals.satFat`, `totals.subPartial` to both `diario` files (ES partial: "{{count}} sin datos"; EN: "{{count}} items missing").

- [ ] **Step 3: Verify** — `pnpm build` (i18n keys resolve), `pnpm test` → green.

- [ ] **Step 4: Commit**

```bash
git add src/i18n
git commit -m "feat(i18n): sub-macro labels + partial qualifier (ES/EN)"
```

---

## Task 12: Final verification + PR

- [ ] **Step 1:** `pnpm lint` → 0 errors. `pnpm typecheck` → 0. `pnpm build` → ok. `pnpm test` → all green.
- [ ] **Step 2:** Push the branch; open PR into `develop`. PR body: summary of U-1, link the spec, and note the migration apply + edge deploy status (done at the gated checkpoint or pending user approval).
- [ ] **Step 3:** Confirm CI green; set auto-merge (squash).

---

## Self-review notes (coverage vs spec)

- Spec §4 (schema) → Task 3. §5 (subMacros core, parallel, `null`-aware, scale leaves count) → Tasks 1–2, 8, 10. §6 (OFF, null-when-absent) → Task 5. §7 (form, soft warning, diary secondary lines, partial qualifier) → Tasks 6, 9. §8 (i18n) → Task 11. §9 (tests: subMacros, parity, OFF, component) → Tasks 1, 2, 5, 9, 10. §3 decision 3 (DB non-negative only, soft form warning) → Task 3 CHECK + Task 6 warning. §11 (parallel module decision) → Tasks 1–2 (Macros untouched).
- Planner display of sub-macros is **U-5's** surface (separate chat) — not in this plan; the diary total (Task 9) is U-1's headline.
- Recipe per-serving sub display on recipe cards is consumed by **U-3**; Task 8 provides the wrapper U-3 will reuse.
