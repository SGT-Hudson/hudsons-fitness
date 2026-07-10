import type { Macros, SubMacros } from '@/features/recipes/macros';
import { computeRecipeMacros, computeRecipeSub } from '@/features/recipes/macros';
import {
  addSub,
  ingredientSub,
  scaleSub,
  ZERO_SUB,
  type PartialSub,
} from '@/core/subMacros';
import type { MealLogWithJoins } from './api';

export const ZERO_MACROS: Macros = {
  kcal: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  fiberG: 0,
};

// Exported so the diario ración step (Task 4, R-33 wave 2) can project a
// loose ingredient's contribution the same way computeMealLogMacros does
// internally — same pure math, no fetch.
export function ingredientMacros(
  ingredient: {
    unit_type: string;
    kcal_per_unit: number;
    protein_g_per_unit: number;
    carbs_g_per_unit: number;
    fat_g_per_unit: number;
    fiber_g_per_unit: number;
  },
  quantity: number,
): Macros {
  const divisor = ingredient.unit_type === 'unit' ? 1 : 100;
  const factor = quantity / divisor;
  return {
    kcal: ingredient.kcal_per_unit * factor,
    proteinG: ingredient.protein_g_per_unit * factor,
    carbsG: ingredient.carbs_g_per_unit * factor,
    fatG: ingredient.fat_g_per_unit * factor,
    fiberG: ingredient.fiber_g_per_unit * factor,
  };
}

function scaleMacros(m: Macros, factor: number): Macros {
  return {
    kcal: m.kcal * factor,
    proteinG: m.proteinG * factor,
    carbsG: m.carbsG * factor,
    fatG: m.fatG * factor,
    fiberG: m.fiberG * factor,
  };
}

export function computeMealLogMacros(log: MealLogWithJoins): Macros {
  if (log.recipe_id && log.recipe) {
    const { perServing } = computeRecipeMacros({
      servings: log.recipe.servings,
      rows: log.recipe.recipe_ingredients.map((ri) => ({
        ingredient: ri.ingredient,
        quantity: Number(ri.quantity),
        perServing: ri.per_serving,
      })),
    });
    return scaleMacros(perServing, Number(log.servings ?? 1));
  }
  if (log.ingredient_id && log.ingredient && log.quantity != null) {
    return ingredientMacros(log.ingredient, Number(log.quantity));
  }
  return {
    kcal: log.custom_kcal ?? 0,
    proteinG: log.custom_protein_g ?? 0,
    carbsG: log.custom_carbs_g ?? 0,
    fatG: log.custom_fat_g ?? 0,
    fiberG: log.custom_fiber_g ?? 0,
  };
}

// --- U-1 sub-macros (sugar + saturated fat), null-aware ---------------------

/** A custom-entry value → PartialSub: null/undefined = unknown (missing 1). */
function customField(v: number | null | undefined): PartialSub {
  return v === null || v === undefined ? { known: 0, missing: 1 } : { known: v, missing: 0 };
}

export function computeMealLogSub(log: MealLogWithJoins): SubMacros {
  if (log.recipe_id && log.recipe) {
    const { perServing } = computeRecipeSub({
      servings: log.recipe.servings,
      rows: log.recipe.recipe_ingredients.map((ri) => ({
        ingredient: ri.ingredient,
        quantity: Number(ri.quantity),
        perServing: ri.per_serving,
      })),
    });
    return scaleSub(perServing, Number(log.servings ?? 1));
  }
  if (log.ingredient_id && log.ingredient && log.quantity != null) {
    return ingredientSub(
      {
        unitType: log.ingredient.unit_type,
        sugarGPerUnit: log.ingredient.sugar_g_per_unit ?? null,
        satFatGPerUnit: log.ingredient.saturated_fat_g_per_unit ?? null,
      },
      Number(log.quantity),
    );
  }
  return {
    sugarG: customField(log.custom_sugar_g),
    satFatG: customField(log.custom_saturated_fat_g),
  };
}

export function sumSub(items: SubMacros[]): SubMacros {
  return items.reduce<SubMacros>((acc, s) => addSub(acc, s), ZERO_SUB);
}

export function sumMacros(items: Macros[]): Macros {
  return items.reduce<Macros>(
    (acc, m) => ({
      kcal: acc.kcal + m.kcal,
      proteinG: acc.proteinG + m.proteinG,
      carbsG: acc.carbsG + m.carbsG,
      fatG: acc.fatG + m.fatG,
      fiberG: acc.fiberG + m.fiberG,
    }),
    ZERO_MACROS,
  );
}

export function describeMealLog(log: MealLogWithJoins): {
  title: string;
  detail: string;
} {
  if (log.recipe_id && log.recipe) {
    const servings = Number(log.servings ?? 1);
    return {
      title: log.recipe.name,
      detail:
        servings === 1 ? '1 ración' : `${servings.toLocaleString('es-ES')} raciones`,
    };
  }
  if (log.ingredient_id && log.ingredient && log.quantity != null) {
    const qty = Number(log.quantity);
    const unit = log.ingredient.unit_type === 'unit' ? 'ud' : 'g';
    return {
      title: log.ingredient.name,
      detail: `${qty.toLocaleString('es-ES')} ${unit}`,
    };
  }
  return {
    title: log.custom_name ?? '',
    detail: '',
  };
}
