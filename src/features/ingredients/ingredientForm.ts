import { ingredientFormSchema, type IngredientFormValues } from './schema';
import type { OFFSearchResult } from '@/lib/openfoodfacts';

/**
 * The ingredient form's SHAPE and its two boundaries — nothing renders here.
 *
 * The presentational `IngredientFormFields` component this file was named for
 * is gone with R-33 wave 6: it existed to be reused across `IngredientDialog`'s
 * OFF / manual / edit tabs, and those tabs are routes now. The one editor is
 * `IngredientEditorForm`; what survives here is what both it and the routes
 * still need — the string-valued state, the seeds into it, and the parse out.
 *
 * The state is the zod schema's *input* (string-valued) shape; the single source
 * of truth lives in ../schema.ts (D-C2/D-C3, R-09).
 */
export type IngredientFormState = IngredientFormValues;

export const emptyForm: IngredientFormState = {
  name: '',
  brand: '',
  unit_type: 'gram',
  kcal_per_unit: '',
  protein_g_per_unit: '',
  carbs_g_per_unit: '',
  fat_g_per_unit: '',
  fiber_g_per_unit: '',
  sugar_g_per_unit: '',
  saturated_fat_g_per_unit: '',
  salt_g_per_unit: '',
};

export function ingredientToForm(ing: {
  name: string;
  brand: string | null;
  unit_type: string;
  kcal_per_unit: number;
  protein_g_per_unit: number;
  carbs_g_per_unit: number;
  fat_g_per_unit: number;
  fiber_g_per_unit: number;
  sugar_g_per_unit?: number | null;
  saturated_fat_g_per_unit?: number | null;
  salt_g_per_unit?: number | null;
}): IngredientFormState {
  return {
    name: ing.name,
    brand: ing.brand ?? '',
    unit_type: ing.unit_type === 'unit' ? 'unit' : 'gram',
    kcal_per_unit: String(ing.kcal_per_unit),
    protein_g_per_unit: String(ing.protein_g_per_unit),
    carbs_g_per_unit: String(ing.carbs_g_per_unit),
    fat_g_per_unit: String(ing.fat_g_per_unit),
    fiber_g_per_unit: String(ing.fiber_g_per_unit),
    // NULL (unknown) → blank input, NOT "0".
    sugar_g_per_unit: ing.sugar_g_per_unit == null ? '' : String(ing.sugar_g_per_unit),
    saturated_fat_g_per_unit:
      ing.saturated_fat_g_per_unit == null ? '' : String(ing.saturated_fat_g_per_unit),
    salt_g_per_unit: ing.salt_g_per_unit == null ? '' : String(ing.salt_g_per_unit),
  };
}

/**
 * OFF search result / barcode lookup → the string-valued form (R-33 wave 6).
 * Extracted from `IngredientDialog`, where this exact mapping was written out
 * twice (the off-tab pick and the barcode `onResolved` handler). One function
 * now, and it seeds every OFF path: the method picker, the scanner, and the
 * editor route they both navigate to.
 *
 * `unit_type` is always `'gram'` — OFF only ever reports per-100g nutrition.
 * Same U-1 contract as `ingredientToForm`: a sub-macro OFF has no value for
 * (`null`) renders as a BLANK input, never `"0"` — a genuine OFF-reported 0
 * (e.g. zero-sugar soda) is a real claim and must render as `"0"`.
 */
export function offResultToForm(result: OFFSearchResult): IngredientFormState {
  return {
    name: result.name,
    brand: result.brand ?? '',
    unit_type: 'gram',
    kcal_per_unit: String(result.kcalPer100g),
    protein_g_per_unit: String(result.proteinPer100g),
    carbs_g_per_unit: String(result.carbsPer100g),
    fat_g_per_unit: String(result.fatPer100g),
    fiber_g_per_unit: String(result.fiberPer100g),
    sugar_g_per_unit: result.sugarPer100g == null ? '' : String(result.sugarPer100g),
    saturated_fat_g_per_unit:
      result.satFatPer100g == null ? '' : String(result.satFatPer100g),
    // OFF had no salt figure → blank (unknown), never "0".
    salt_g_per_unit: result.saltPer100g == null ? '' : String(result.saltPer100g),
  };
}

export interface ParsedIngredient {
  name: string;
  brand: string | null;
  unit_type: 'gram' | 'unit';
  kcal_per_unit: number;
  protein_g_per_unit: number;
  carbs_g_per_unit: number;
  fat_g_per_unit: number;
  fiber_g_per_unit: number;
  sugar_g_per_unit: number | null;
  saturated_fat_g_per_unit: number | null;
  salt_g_per_unit: number | null;
}

/**
 * Validate + normalize via the co-located zod schema (single source of truth,
 * D-C2/R-09). Behavior is identical to the old hand-rolled parser: any invalid
 * field → `null` (the editor turns that into the localized `errors.invalid`
 * message); blank fiber → 0; brand trimmed-to-null.
 */
export function parseForm(form: IngredientFormState): ParsedIngredient | null {
  const result = ingredientFormSchema.safeParse(form);
  if (!result.success) return null;
  const v = result.data;
  return {
    name: v.name,
    brand: v.brand.trim() === '' ? null : v.brand.trim(),
    unit_type: v.unit_type,
    kcal_per_unit: v.kcal_per_unit,
    protein_g_per_unit: v.protein_g_per_unit,
    carbs_g_per_unit: v.carbs_g_per_unit,
    fat_g_per_unit: v.fat_g_per_unit,
    fiber_g_per_unit: v.fiber_g_per_unit,
    sugar_g_per_unit: v.sugar_g_per_unit,
    saturated_fat_g_per_unit: v.saturated_fat_g_per_unit,
    salt_g_per_unit: v.salt_g_per_unit,
  };
}
