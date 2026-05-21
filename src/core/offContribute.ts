// Pure core for OFF contribute-back (R-21). No IO, no clock, no @/ alias.
// Decides whether a product is safe to push to Open Food Facts, and maps our
// per-100g shape to OFF's write params. Spec §6/§7.

export interface OffContributionInput {
  barcode: string;
  name: string;
  brand: string | null;
  unitType: string; // 'gram' | 'unit'
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number;
}

/** Atwater tolerance: |4P + 4C + 9F − kcal| / kcal must be ≤ this. */
export const ATWATER_TOLERANCE = 0.2;

/**
 * Eligibility gate. Contribute only a gram-based product with a name, a
 * positive kcal, and macros that roughly reconcile with that kcal via the
 * Atwater factors (catches decimal slips / unit confusion before they go
 * public). Per-unit products are skipped — OFF is per-100g.
 */
export function isContributionEligible(input: OffContributionInput): boolean {
  if (input.unitType !== 'gram') return false;
  if (input.name.trim() === '') return false;
  if (!(input.kcalPer100g > 0)) return false;
  const atwater =
    4 * input.proteinPer100g + 4 * input.carbsPer100g + 9 * input.fatPer100g;
  if (!(atwater > 0)) return false;
  const relDiff = Math.abs(atwater - input.kcalPer100g) / input.kcalPer100g;
  return relDiff <= ATWATER_TOLERANCE;
}

export type OffWriteParams = Record<string, string>;

/** Map our per-100g product to OFF's product_jqm2.pl write params. */
export function toOffWriteParams(input: OffContributionInput): OffWriteParams {
  return {
    code: input.barcode,
    product_name: input.name,
    brands: input.brand ?? '',
    nutrition_data_per: '100g',
    'nutriment_energy-kcal': String(input.kcalPer100g),
    nutriment_proteins: String(input.proteinPer100g),
    nutriment_carbohydrates: String(input.carbsPer100g),
    nutriment_fat: String(input.fatPer100g),
    nutriment_fiber: String(input.fiberPer100g),
  };
}
