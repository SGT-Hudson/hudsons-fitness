# U-2 — Recipe meal-type tags — Design

**Status:** design — awaiting user review before plan
**Triage item:** U-2 (see `2026-05-23-notes-triage.md`)
**Depends on:** none. **Enables:** U-3 (search/filter recipes by meal type).

## 1. Goal

Let a recipe be tagged with one or more **meal types** so users can categorize
recipes ("this is a breakfast", "this works as lunch or dinner") and, later (U-3),
filter/search by them. Tags are optional and multi-valued.

## 2. Vocabulary (locked 2026-05-23)

A single **flat** set of 5 peer tags (no sub-grouping). Stored as language-neutral
keys; labels via i18n.

| key | ES | EN | note |
|---|---|---|---|
| `breakfast` | Desayuno | Breakfast | |
| `lunch` | Comida | Lunch | |
| `snack` | Snack | Snack | doubles as *merienda* / anytime light bite |
| `dinner` | Cena | Dinner | |
| `dessert` | Postre | Dessert | recipe-only role; maps to no logging slot |

A recipe may carry **any combination, including none** (empty = untagged).
Four keys (`breakfast/lunch/snack/dinner`) intentionally match the existing logging
enum (`features/diario/api.ts` `MealType`), so U-3's "plan a dinner slot → show
dinner recipes" mapping is 1:1. `dessert` is recipe-only (a pure filter; no slot).

**Out of scope / explicitly unchanged:** the logging `MealType` enum
(`breakfast/lunch/snack/dinner/other`) and plan-slot model are **not touched** —
the plan-materialization RPC indexes that enum by position, so changing it is risky
and unrelated to recipe tagging.

## 3. Decisions

1. **Placement: on the `recipes` pool item, not the per-user ref.** A meal-type tag
   is an objective property of the recipe shared by everyone who uses it.
2. **Shape: a `meal_types text[]` array column** (not a junction table). The
   vocabulary is tiny and fixed; an array + GIN index serves U-3's filter without
   adding another RLS-policed table to the shared pool.
3. **Optional, multi-valued.** Default `'{}'`. No "must have at least one" rule.
4. **Atomic save via the existing RPC.** Add `p_meal_types text[]` to `save_recipe`
   rather than a separate `UPDATE`, keeping the recipe write atomic (hard invariant
   #3: >1-table mutations are INVOKER RPCs; `save_recipe` already is one).

## 4. Data model

### `recipes`
```
+ meal_types text[] not null default '{}'
  check (meal_types <@ array['breakfast','lunch','snack','dinner','dessert']::text[])
```
- The `<@` (is-contained-by) CHECK rejects any element outside the locked set.
- GIN index for U-3: `create index idx_recipes_meal_types on recipes using gin (meal_types);`
- Element de-duplication is enforced in the UI (a chip can't be selected twice); not
  worth a DB-level dedup constraint.

**Migration:** one new file in `supabase/migrations/`. Additive, no backfill
(existing recipes default to `'{}'` = untagged). Then regenerate
`src/types/database.ts` (R-04 flow) so `recipes` Row/Insert/Update gains
`meal_types` and the `save_recipe` arg list updates.

### `save_recipe` RPC (CREATE OR REPLACE)
Add a `p_meal_types text[] default '{}'` parameter; the body sets
`recipes.meal_types = p_meal_types` on both the create and update branches.
Everything else (recipe_ingredients replace-children, creator ref insert on create,
SECURITY INVOKER + `set search_path = public`) is unchanged.

## 5. No macro / edge impact

`meal_types` is pure recipe metadata for categorization and search. It does **not**
affect macros, the shared `Macros`/`subMacros` core, `daily_nutrition_history`, or
any edge function. No parity-net changes.

## 6. UI

- **Recipe editor (`RecetaEditorPage`):** a chip multi-select ("Meal types" /
  "Tipos de comida") — 5 toggle chips, any number selectable, all optional. Wired
  into the existing RHF + zod form; schema (`features/recipes/schema.ts`) gains
  `mealTypes: z.array(z.enum([...])).default([])`. `SaveRecipePayload` gains
  `mealTypes: string[]`, passed as `p_meal_types`.
- **Recipe list / cards:** render the tags as `<Badge variant="secondary">` (the
  R-10 badge component) — show nothing when untagged.
- Reuse the locked vocabulary from one shared constant
  (`features/recipes/mealTypes.ts` exporting the key list + the zod enum) so the
  editor, the card display, and U-3's filter all reference one source.

## 7. i18n

ES/EN keys under the `recipes` namespace: `mealTypes.{breakfast,lunch,snack,dinner,
dessert}` for the labels, plus the editor field label/help. No raw English strings.

## 8. Testing

- **Tier-1:** the shared `mealTypes` constant / zod enum (valid set; rejects unknown
  values) — small.
- **Tier-2 (`RecetaEditorPage` component):** selecting/deselecting chips updates the
  form value; saving sends the array; a recipe with no tags sends `[]`.
- (No core/parity tests — no macro impact.)

## 9. Risks / notes

- **Generated-types regen** must follow the migration (new column + changed RPC
  signature), same as U-1.
- **RLS unchanged:** `meal_types` rides on the existing `recipes` UPDATE policy
  (creator-only) via the INVOKER RPC.
- **Vocabulary as a shared constant** is load-bearing for U-3 — keep exactly one
  definition; the DB CHECK and the TS enum must list the same 5 keys.
