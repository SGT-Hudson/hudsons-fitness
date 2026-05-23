// U-3 — recipe nutrition labels. ONE pure helper that is the single source for
// BOTH the searchable "goal" filters and the cautionary "warning" badges, so a
// card's badge can never disagree with what a filter returns.
//
// All thresholds are density / % of the recipe's per-serving energy (E), so they
// are serving-size-agnostic. Protein/carbs/sugar = 4 kcal/g, fat/sat-fat = 9.
//
// Sugar/sat-fat are OPTIONAL (U-1): a label that depends on them is `null`
// ("unknown") unless that nutrient's data is COMPLETE (no missing contributors)
// — we never assert "low sugar" / warn "high sugar" on a guess.

import type { Macros, SubMacros } from './macros';

export const RECIPE_LABEL_THRESHOLDS = {
  highProteinPctE: 0.3, // protein ≥ 30% of energy
  lowCarbPctE: 0.25, // carbs ≤ 25%
  lowFatPctE: 0.3, // fat ≤ 30%
  highFiberGPer100Kcal: 6, // fiber ≥ 6 g per 100 kcal
  lowSugarPctE: 0.1, // sugar ≤ 10%
  lowSatFatPctE: 0.1, // sat-fat ≤ 10%
  highSugarPctE: 0.2, // sugar > 20% (warning)
  highSatFatPctE: 0.1, // sat-fat > 10% (warning)
  minKcalForRatio: 25, // below this, ratios are meaningless (e.g. seasonings)
} as const;

export const RECIPE_GOAL_KEYS = [
  'highProtein',
  'lowCarb',
  'lowFat',
  'highFiber',
  'lowSugar',
  'lowSatFat',
] as const;
export type RecipeGoalKey = (typeof RECIPE_GOAL_KEYS)[number];

export interface RecipeLabels {
  goals: Record<RecipeGoalKey, boolean | null>;
  warnings: {
    highSugar: boolean | null;
    highSatFat: boolean | null;
  };
}

const ALL_FALSE: RecipeLabels = {
  goals: {
    highProtein: false,
    lowCarb: false,
    lowFat: false,
    highFiber: false,
    lowSugar: false,
    lowSatFat: false,
  },
  warnings: { highSugar: false, highSatFat: false },
};

export function recipeLabels(perServing: Macros, perServingSub: SubMacros): RecipeLabels {
  const E = perServing.kcal;
  const T = RECIPE_LABEL_THRESHOLDS;
  if (!Number.isFinite(E) || E < T.minKcalForRatio) {
    // Clone so callers can't mutate the shared constant.
    return { goals: { ...ALL_FALSE.goals }, warnings: { ...ALL_FALSE.warnings } };
  }

  // Sugar/sat-fat are only assertable when complete; otherwise `null`.
  const sugarComplete = perServingSub.sugarG.missing === 0;
  const satComplete = perServingSub.satFatG.missing === 0;
  const sugarPctE = (perServingSub.sugarG.known * 4) / E;
  const satPctE = (perServingSub.satFatG.known * 9) / E;

  return {
    goals: {
      highProtein: (perServing.proteinG * 4) / E >= T.highProteinPctE,
      lowCarb: (perServing.carbsG * 4) / E <= T.lowCarbPctE,
      lowFat: (perServing.fatG * 9) / E <= T.lowFatPctE,
      highFiber: (perServing.fiberG * 100) / E >= T.highFiberGPer100Kcal,
      lowSugar: sugarComplete ? sugarPctE <= T.lowSugarPctE : null,
      lowSatFat: satComplete ? satPctE <= T.lowSatFatPctE : null,
    },
    warnings: {
      highSugar: sugarComplete ? sugarPctE > T.highSugarPctE : null,
      highSatFat: satComplete ? satPctE > T.highSatFatPctE : null,
    },
  };
}
