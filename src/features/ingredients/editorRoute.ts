import type { OFFSearchResult } from '@/lib/openfoodfacts';

/** The Ingredientes list — where the editor exits to (there is no read view). */
export const INGREDIENTS_LIST = '/recipes/ingredients';
/** The method picker (manual / OpenFoodFacts / barcode). Reads `?q=` to seed the name. */
export const INGREDIENT_NEW = '/recipes/ingredients/new';
/** The empty editor. Everything that creates an ingredient by page lands here. */
export const INGREDIENT_NEW_MANUAL = '/recipes/ingredients/new/manual';
/** The full-screen viewfinder. Linked from the method picker and the search page. */
export const INGREDIENT_SCAN = '/recipes/ingredients/scan';
/** The loaded editor. Owner-only — `canEditIngredient` gates it. */
export function ingredientEditPath(id: string): string {
  return `/recipes/ingredients/${id}/edit`;
}

/**
 * What a navigation may carry into `/recipes/ingredients/new/manual`
 * (`navigate(INGREDIENT_NEW_MANUAL, { state })`). THE interface between the
 * method picker (Task 4) / the scanner (Task 5) and the editor route, and the
 * highest-risk payload in this PR — see `offProduct`.
 *
 * All three fields are optional and independent; nothing here is required (a
 * bare `/new/manual` is a blank manual create).
 */
export interface IngredientEditorRouteState {
  /**
   * The OpenFoodFacts product this create was seeded from — an OFF search pick
   * or a barcode scan that RESOLVED. **Load-bearing** (Constraint 2): the page
   * hands it to the editor's `offProduct` prop, which makes the save an import
   * (`source='openfoodfacts'`, `external_id` = the EAN). Lose it in transit and
   * the product saves as an anonymous manual row with no barcode — invisible,
   * and unrecoverable without re-scanning. Pinned by `IngredientEditorPage.test.tsx`.
   */
  offProduct?: OFFSearchResult | null;
  /**
   * A scanned barcode OFF did NOT know. There is nothing to seed and nothing to
   * import: `createManualIngredient` deliberately writes no `external_id` (the
   * `ingredients_external_consistency` CHECK only allows one on an
   * openfoodfacts/bedca row). So the code travels purely as context — the page
   * shows "we scanned this, OFF doesn't have it, type it in" — and the save
   * stays on the manual branch.
   */
  ean?: string | null;
  /** A name to prefill (e.g. the query the user was searching for). */
  name?: string | null;
}

function isOFFProduct(value: unknown): value is OFFSearchResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as OFFSearchResult).code === 'string' &&
    typeof (value as OFFSearchResult).name === 'string'
  );
}

/**
 * `location.state` → the contract above. History state is `unknown` (it can be
 * anything a stale entry, another page's navigation, or a hand-edited history
 * left behind), so it is narrowed here rather than cast at the use site.
 *
 * Returns the SAME references it was given — never a clone. The editor form
 * re-seeds itself whenever its `offProduct`/`initialValues` identity changes, so
 * a fresh object per render would wipe whatever the user had typed.
 */
export function readIngredientEditorState(state: unknown): IngredientEditorRouteState {
  if (typeof state !== 'object' || state === null) return {};
  const s = state as IngredientEditorRouteState;
  return {
    offProduct: isOFFProduct(s.offProduct) ? s.offProduct : null,
    ean: typeof s.ean === 'string' && s.ean.trim() !== '' ? s.ean : null,
    name: typeof s.name === 'string' && s.name.trim() !== '' ? s.name : null,
  };
}
