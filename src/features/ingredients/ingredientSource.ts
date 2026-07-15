import type { IngredientSource } from './api';

/**
 * The three badges the UI actually has. `source` carries four DB values; the
 * fourth (`bedca`) is a curated nutrition base exactly like `system`, so both
 * land on **base**. Before this, `bedca` fell through to the "Manual" badge —
 * a mislabel waiting for the first BEDCA import.
 */
export type IngredientSourceVariant = 'base' | 'manual' | 'off';

/**
 * Exhaustive by construction: `Record<IngredientSource, …>` means adding a
 * value to the union (after a schema change) fails typecheck here rather than
 * silently rendering as something it is not.
 */
const VARIANT_BY_SOURCE: Record<IngredientSource, IngredientSourceVariant> = {
  system: 'base',
  bedca: 'base',
  manual: 'manual',
  openfoodfacts: 'off',
};

/**
 * `ingredients.source` is typed `string` in the generated DB types (Postgres
 * check constraint, not an enum), so the runtime value is widened. An unknown
 * value falls back to **base** — the neutral "came from a curated dataset"
 * bucket — never to "manual", which is a claim about authorship.
 */
export function ingredientSourceVariant(source: string): IngredientSourceVariant {
  return VARIANT_BY_SOURCE[source as IngredientSource] ?? 'base';
}
