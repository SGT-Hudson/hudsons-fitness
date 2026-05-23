# U-3 — Recipe search filters & labels — Design

**Status:** design — awaiting user review before plan
**Triage item:** U-3 (see `2026-05-23-notes-triage.md`)
**Depends on:** U-1 (sub-macros — sugar/sat-fat), U-2 (recipe meal-type tags).
Designable now; implement after U-1 + U-2 land.

## 1. Goal

Make the recipe list searchable/filterable by **meal type** (U-2) and by
**nutrition profile** — goal filters like "high protein / low carb / low sugar" —
and surface **warning badges** ("high sugar / high saturated fat") on recipe cards.

## 2. Decisions (brainstorming 2026-05-23)

1. **Density / ratio basis.** Nutrition labels are defined as **% of the recipe's
   per-serving energy** (serving-size-agnostic), not absolute per-serving grams.
2. **Two kinds of label:**
   - **Goal filters** — positive, aspirational; the user toggles them to *find*
     recipes (search facets).
   - **Warning badges** — cautionary; auto-shown on the card to *flag* a recipe;
     **not** search facets.
3. **One pure helper is the single source** for both badges and filter predicates,
   so a card's badge can never disagree with what a filter returns.
4. **In-memory compute via the existing core.** The list loads each library recipe's
   ingredients-with-macros in one query and computes per-serving macros (+ sub-macros)
   through `core/macros.ts` + `core/subMacros.ts`. No macro math in SQL (preserves
   the single-source macro core, R-17). Scale assumption: personal libraries are
   tens of recipes; if that ever changes, the escape hatch is denormalized cached
   macro columns — **YAGNI now**.
5. **Complete-data gating** for any sugar/sat-fat-derived label: only assert it when
   that nutrient's data is complete (U-1 honest-partial). Incomplete → the recipe is
   neither tagged nor warned on that nutrient (never guess).
6. **Near-zero-kcal recipes** are excluded from all ratio filters/badges (no
   meaningful energy ratio).

## 3. Labels & thresholds

All thresholds are **named, tunable constants** in `features/recipes/labels.ts`.
`E` = per-serving kcal. Protein/carbs/sugar use 4 kcal/g, fat 9 kcal/g.

### Goal filters (positive — searchable)
| key | label (ES / EN) | predicate | data caveat |
|---|---|---|---|
| `high_protein` | Alto en proteína / High protein | `proteinG*4 / E ≥ 0.30` | — |
| `low_carb` | Bajo en carbos / Low carb | `carbsG*4 / E ≤ 0.25` | — |
| `low_fat` | Bajo en grasa / Low fat | `fatG*9 / E ≤ 0.30` | — |
| `high_fiber` | Alto en fibra / High fiber | `fiberG / (E/100) ≥ 6` (≥6 g per 100 kcal) | — |
| `low_sugar` | Bajo en azúcar / Low sugar | `sugarG*4 / E ≤ 0.10` | sugar must be **complete** |
| `low_sat_fat` | Baja grasa saturada / Low saturated fat | `satFatG*9 / E ≤ 0.10` | sat-fat must be **complete** |

### Warning badges (cautionary — display only)
| key | label (ES / EN) | predicate | data caveat |
|---|---|---|---|
| `high_sugar` | Alto en azúcar / High sugar | `sugarG*4 / E > 0.20` | sugar must be **complete** |
| `high_sat_fat` | Alta grasa saturada / High saturated fat | `satFatG*9 / E > 0.10` | sat-fat must be **complete** |

**Known limitation (documented):** `sugar` is *total* sugar (includes natural
sugars from fruit/dairy), so a fruit smoothie can fail "low sugar" / earn "high
sugar". OFF gives no free-vs-total split; accepted for v1.

## 4. The label helper (single source of truth)

`src/features/recipes/labels.ts` (pure, Tier-1 tested):

```ts
export interface RecipeLabels {
  goals: {
    highProtein: boolean;
    lowCarb: boolean;
    lowFat: boolean;
    highFiber: boolean;
    lowSugar: boolean | null;     // null = sugar data incomplete → unknown
    lowSatFat: boolean | null;    // null = sat-fat data incomplete → unknown
  };
  warnings: {
    highSugar: boolean | null;
    highSatFat: boolean | null;
  };
}

export function recipeLabels(
  perServing: Macros,            // from computeRecipeMacros().perServing
  perServingSub: SubMacros,      // from computeRecipeSub().perServing
): RecipeLabels;
```

- `E` from `perServing.kcal`; returns all-`false`/`null` when `E < MIN_KCAL_FOR_RATIO`.
- Sugar/sat-fat labels return `null` (not `false`) when `perServingSub.<field>.missing
  > 0` — the filter treats `null` as "does not match" (excluded from low-sugar
  results) and the badge renders nothing for `null`.
- Thresholds (`0.30 / 0.25 / 0.30 / 6 / 0.10 / 0.20 / 0.10`, `MIN_KCAL_FOR_RATIO`)
  are exported named constants.

## 5. Data flow

1. List query (extend `listRecipes` or add `listRecipesForSearch`): for each
   `user_recipe_refs` recipe, fetch `recipe_ingredients (quantity, per_serving,
   ingredient(macros + sugar/sat-fat))` + `recipes.meal_types`. One query.
2. Per recipe: `computeRecipeMacros` + `computeRecipeSub` (per-serving) → `recipeLabels(...)`.
3. Build an in-memory list of `{ id, name, mealTypes, perServing, labels }`.
4. Filtering/search run over that in-memory list (§6). No per-filter round trips.

## 6. Filtering UX & combine logic

Filter bar above the recipe list:
- **Name search** — text input (`includes`, accent/case-insensitive; reuse existing
  normalization).
- **Meal-type chips** — the 5 U-2 tags.
- **Goal-filter chips** — the 6 goal labels.

Combine logic (standard faceted search):
- *Within* meal-types → **OR** (recipe matches if it carries any selected type).
- *Among* goal filters and *across* categories (meal-type ∧ goals ∧ name) → **AND**.
- A goal filter whose label is `null` (incomplete data) does **not** match.

Each recipe card renders its **warning badges** (`high_sugar`/`high_sat_fat`) via
`<Badge variant="warning">` (R-10), plus its meal-type tags (U-2,
`variant="secondary"`). Empty-result state when nothing matches.

## 7. i18n

`recipes` namespace: `filters.{label keys}` for the 6 goal chips, `badges.{high_sugar,
high_sat_fat}`, the search placeholder, the "no results" copy. Meal-type labels reuse
U-2's keys. No raw English strings.

## 8. Testing

- **Tier-1 (`labels.test.ts`):** each threshold boundary (just-over / just-under);
  `null` returned when sugar/sat-fat incomplete; near-zero-kcal → all false/null;
  fat uses 9 kcal/g, fiber uses per-100-kcal.
- **Tier-1:** filter predicate combine logic (within-OR / across-AND; `null` goal
  excludes).
- **Tier-2 (component):** toggling chips narrows the rendered list; warning badges
  render from the helper; incomplete-sugar recipe shows no sugar badge and is absent
  from a low-sugar filter.

## 9. Risks / notes

- **Scale:** computing macros for the whole library on list load is fine at tens of
  recipes; documented escape hatch (denormalized macro columns) if it grows. Not
  built now.
- **Single-helper invariant:** badges and filters MUST both go through
  `recipeLabels` — never compute a threshold inline at a call site.
- **Depends on U-1 + U-2 schema/data** — implement after both land (the list query
  reads `meal_types` and the sugar/sat-fat columns).
- **No new DB objects** beyond what U-1/U-2 add (U-2's GIN index already covers any
  future DB-side meal-type filtering if the in-memory approach is ever revisited).
