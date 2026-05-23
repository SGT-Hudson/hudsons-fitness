# U-1 — Sub-macros (sugar + saturated fat) — Design

**Status:** design — awaiting user review before plan
**Triage item:** U-1 (see `2026-05-23-notes-triage.md`)
**Depends on:** none. **Enables:** U-3 (low-sugar recipe filter).

## 1. Goal

Track two optional "of which" sub-macros — **sugar** (a subset of carbs) and
**saturated fat** (a subset of total fat) — from the ingredient level all the way
up to a daily "sugar / saturated fat consumed today" total in the diary and
planner. Both are **optional**: ingredients may not have them, OFF imports often
won't, and that must be handled honestly rather than as zero.

## 2. Scope

**In scope**
- Two new optional, nullable nutrient fields on ingredients (per 100 g / per unit).
- User entry of both on the ingredient form, with non-blocking sanity warnings.
- OFF / barcode import prefill of both when OFF provides them.
- Roll-up through recipes → meal logs → daily totals → planner (**option B**).
- Honest-partial totals: a total sums only *known* contributions and signals when
  some contributors had no value.
- Display as secondary "of which" sub-lines (ingredient/recipe cards, diary,
  planner). Never in the primary macro ring.
- i18n (ES/EN) and Tier-1/Tier-2 tests.

**Out of scope**
- Micronutrients (F-5 — deferred, pairs with F-1/BEDCA).
- The recipe macro/meal-type *search filters* (U-3 — separate spec; this spec only
  makes the data exist and roll up).
- Any change to how kcal is computed. Sugar/sat-fat are informational subsets and
  **never** add calories on top of carbs/fat.

## 3. Decisions (from brainstorming, 2026-05-23)

1. **Full roll-up (option B):** sugar + saturated fat propagate to daily totals and
   the planner, because the user wants a daily "sugar consumed" figure.
2. **Honest-partial totals:** fields stay optional/nullable. A total sums known
   values only and surfaces a qualifier when some items lack data. **`null` ≠ 0** —
   "sugar-free (0 g)" is distinct from "unknown". Fields are never made required
   (that would break existing ingredients and the lenient OFF/barcode import).
3. **Validation:** DB enforces only non-negative (like the other macros). No hard
   `sugar ≤ carbs` / `saturated ≤ fat` constraint — real OFF per-100g rounding
   legitimately violates it. The form shows a **non-blocking** warning when a sub
   exceeds its parent (catches manual typos without rejecting real imports).
4. **Display:** indented "of which" sub-lines under carbs / fat; shown only when
   known ("—" when unknown, not "0 g"); secondary placement everywhere.
5. **Core architecture:** the partial/`null`-aware logic lives in a **separate
   sub-macro aggregation module**, layered *alongside* the existing 5-field `Macros`
   core — the parity-tested primary arithmetic is **not** mutated. (See §5; this is
   the one decision I want explicitly confirmed at spec review.)

## 4. Data model

All new columns are **nullable** with no default (NULL = unknown). Per 100 g, or
per unit when `unit_type = 'unit'`, consistent with existing macros.

### `ingredients`
```
+ sugar_g_per_unit          numeric(6,2)  null   check (sugar_g_per_unit >= 0)
+ saturated_fat_g_per_unit  numeric(6,2)  null   check (saturated_fat_g_per_unit >= 0)
```

### `meal_logs` (custom one-off override fields, mirroring existing `custom_*`)
```
+ custom_sugar_g            numeric(6,2)  null
+ custom_saturated_fat_g    numeric(6,2)  null
```

### `daily_nutrition_history` (cron snapshot)
Store the **known sum** plus a per-field **completeness boolean** (history only
needs to know whether to render the "≥" qualifier; it does not need the exact
missing count):
```
+ planned_sugar_g            numeric(6,2)  null
+ consumed_sugar_g           numeric(6,2)  null
+ planned_sugar_complete     boolean       not null default true
+ consumed_sugar_complete    boolean       not null default true
+ planned_saturated_fat_g          numeric(6,2)  null
+ consumed_saturated_fat_g         numeric(6,2)  null
+ planned_saturated_fat_complete   boolean       not null default true
+ consumed_saturated_fat_complete  boolean       not null default true
```
Existing historical rows get NULL grams + `complete = true` (no contributors were
"unknown" because the feature didn't exist); the UI renders "no data" for NULL
grams regardless.

**Migration:** one new file in `supabase/migrations/`. Additive only, no backfill.
After it lands, regenerate `src/types/database.ts` (R-04 generated-types flow).

## 5. Sub-macro aggregation core (the subtle part)

The existing `src/core/macros.ts` `Macros` envelope (`kcal, proteinG, carbsG, fatG,
fiberG`) is left **unchanged** — it is parity-tested across client/edge and feeds
the existing history columns. Sugar/sat-fat get a **parallel** module so the
null/partial logic is isolated and the primary path carries zero new risk.

New module `src/core/subMacros.ts` (pure, dependency-free, camelCase — same rules as
`core/macros.ts`):

```ts
/** One optional sub-macro carried through aggregation. */
export interface PartialSub {
  known: number;     // sum of contributions that HAD a value
  missing: number;   // count of contributions with NO value (leaf ingredient lines)
}

export interface SubMacros {
  sugarG: PartialSub;
  satFatG: PartialSub;
}

export const ZERO_SUB: SubMacros = {
  sugarG:  { known: 0, missing: 0 },
  satFatG: { known: 0, missing: 0 },
};
```

- **Input:** `CoreIngredient` gains two optional fields
  `sugarGPerUnit?: Numeric | null`, `satFatGPerUnit?: Numeric | null`.
- **`ingredientSub(ing, qty)`:** for each field, if the per-unit value is
  `null`/`undefined` → `{ known: 0, missing: 1 }`; else
  `{ known: value × factor, missing: 0 }` (same `factor = qty / divisor(unitType)`
  as `ingredientMacros`).
- **`addSub(a, b)`:** field-wise — `known` sums, `missing` sums.
- **`scaleSub(s, k)`:** scales `known` only; **leaves `missing` untouched** (it's a
  count of unknown ingredient lines, unaffected by per-serving division).
- **`computeRecipeSub(recipe)`:** mirrors `computeRecipeMacros` (total +
  per-serving) using `addSub`/`scaleSub`.
- Display helper `isComplete(p: PartialSub) => p.missing === 0`.

**Live diary/planner** computes `SubMacros` directly → can show "≥ 32 g · 2 items
missing". **Cron snapshot** writes `consumed_sugar_g = known`,
`consumed_sugar_complete = (missing === 0)` (count collapses to a boolean for
history; the exact count is recomputed live, not persisted).

**Edge / parity:** `supabase/functions/_shared/macros.ts` re-exports the new module;
the snake adapter at the `daily_nutrition_history` write boundary maps
`sugarG.known → consumed_sugar_g`, `isComplete → consumed_sugar_complete` (and
sat-fat). The R-16 golden-vector fixture set gains sugar/sat-fat columns asserted
against **both** the client and edge paths (the parity guarantee).

## 6. OFF / barcode import

`src/lib/openfoodfacts.ts`:
- `OFFNutriments` += `sugars_100g?`, `'saturated-fat_100g'?`.
- `OFFSearchResult` / `OFFProductLookup` += `sugarPer100g: number | null`,
  `satFatPer100g: number | null`. Map from OFF when present, **`null` when absent**
  (do not coerce missing OFF values to 0 — that would assert "sugar-free" falsely).
- Both search and barcode-lookup paths populate the two fields; the existing energy
  filter / lenient barcode behavior is unchanged.
- The dialog prefill (`pickedOFF → setForm`) carries the two new fields straight into
  the (blank-when-null) form inputs.

## 7. UI surfaces

- **Ingredient form (`IngredientDialog`):** two optional inputs — "of which sugars"
  nested under carbs, "of which saturated" nested under fat. Empty input = NULL
  (unknown), not 0. Soft warning text when sugar > carbs or sat-fat > fat; save not
  blocked. RHF + zod schema in `features/ingredients/schema.ts` (both `.nullable()`,
  `.nonnegative()`).
- **Ingredient & recipe cards:** render the sub-lines only when known; "—" when
  NULL.
- **Diary daily total:** secondary "Sugar / Saturated fat" lines below the main macro
  display, each showing the known sum with the partial qualifier when
  `missing > 0` (e.g. "≥ 32 g · 2 items missing"). Not in the primary ring.
- **Planner daily total:** same treatment (dovetails with U-5).

## 8. i18n

ES/EN keys for: form labels ("of which sugars" / "of which saturated"), the soft
warning, the card sub-lines, the diary/planner total lines, and the partial
qualifier ("≥ {{value}} g · {{count}} items missing"). Namespaces: `ingredients`,
`recipes`, `diario`. No raw English strings.

## 9. Testing

- **Tier-1 (`src/core/subMacros.test.ts`):** `ingredientSub` null vs zero;
  `addSub`/`scaleSub` arithmetic; `missing` count propagation; per-serving scaling
  leaves `missing` unchanged; `null ≠ 0` invariant.
- **Tier-1 parity:** extend `_shared/macros.test.ts` golden vectors with sugar/sat-fat
  → assert client path == edge path.
- **Tier-1 OFF mapping:** `null`-when-absent vs value-when-present for both fields.
- **Tier-2 (component):** `IngredientDialog` — blank input persists NULL (not 0); the
  soft warning shows when sub > parent and does not block submit.

## 10. Risks / notes

- **Macros core untouched** keeps the parity-tested primary path zero-risk; cost is a
  second small aggregation pass over the same ingredient lists in the diary/planner —
  negligible.
- **`daily_nutrition_history` widening:** 8 new columns; additive, defaulted, no
  backfill. Cron writer (`daily-nutrition-snapshot`) must populate them or the
  `complete` columns stay `true`/grams stay NULL (acceptable).
- **Generated types:** the migration must be followed by the R-04 regen so
  `database.ts` picks up the new columns.
- **Boolean-in-history vs count-live asymmetry** is deliberate (history needs only
  the "≥" qualifier); documented in §5 so it isn't "fixed" into a stored count later
  by mistake.

## 11. Open question for review

The §5 **decision to keep `Macros` unchanged and add a parallel `subMacros`
module** (rather than widening the 5-field envelope to 7) is the one architectural
call worth confirming. Rationale: lowest risk to the parity-tested primary
arithmetic, and it quarantines all the null/partial complexity in one place. The
alternative (one 7-field envelope) is more "uniform" but ripples through every
`Macros` literal and complicates `add`/`scale` with mixed number/nullable semantics.
Recommendation: parallel module.
