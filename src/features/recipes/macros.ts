import type { Ingredient } from '@/features/ingredients/api';

export interface RecipeRowMacrosInput {
  ingredient: Pick<
    Ingredient,
    | 'unit_type'
    | 'kcal_per_unit'
    | 'protein_g_per_unit'
    | 'carbs_g_per_unit'
    | 'fat_g_per_unit'
    | 'fiber_g_per_unit'
  >;
  quantity: number;
  perServing: boolean;
}

export interface Macros {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

const ZERO: Macros = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };

function rowTotalQuantity(row: RecipeRowMacrosInput, servings: number): number {
  if (row.perServing) return row.quantity * servings;
  return row.quantity;
}

function divisor(unitType: string): number {
  return unitType === 'unit' ? 1 : 100;
}

export function rowContribution(row: RecipeRowMacrosInput, servings: number): Macros {
  if (!Number.isFinite(row.quantity) || row.quantity <= 0) return ZERO;
  const factor = rowTotalQuantity(row, servings) / divisor(row.ingredient.unit_type);
  const ing = row.ingredient;
  return {
    kcal: ing.kcal_per_unit * factor,
    proteinG: ing.protein_g_per_unit * factor,
    carbsG: ing.carbs_g_per_unit * factor,
    fatG: ing.fat_g_per_unit * factor,
    fiberG: ing.fiber_g_per_unit * factor,
  };
}

export function computeRecipeMacros(opts: {
  servings: number;
  rows: RecipeRowMacrosInput[];
}): { total: Macros; perServing: Macros } {
  const safeServings = opts.servings > 0 ? opts.servings : 1;
  const total = opts.rows.reduce<Macros>((acc, row) => {
    const c = rowContribution(row, safeServings);
    return {
      kcal: acc.kcal + c.kcal,
      proteinG: acc.proteinG + c.proteinG,
      carbsG: acc.carbsG + c.carbsG,
      fatG: acc.fatG + c.fatG,
      fiberG: acc.fiberG + c.fiberG,
    };
  }, ZERO);
  const perServing: Macros = {
    kcal: total.kcal / safeServings,
    proteinG: total.proteinG / safeServings,
    carbsG: total.carbsG / safeServings,
    fatG: total.fatG / safeServings,
    fiberG: total.fiberG / safeServings,
  };
  return { total, perServing };
}

export function roundMacro(n: number): number {
  return Math.round(n * 10) / 10;
}
