import { getISOWeek, parseISO } from 'date-fns';
import { add, ZERO_MACROS, type Macros } from '@/features/recipes/macros';

export interface WeekAverages {
  avgKcal: number;
  avgProteinG: number;
  /** Average protein as a % of target; null when there is no usable target. */
  proteinPct: number | null;
  /** Average kcal minus the kcal target; null when there is no target. */
  kcalDelta: number | null;
}

/** Week-level readouts for the planner header and the mobile summary card. */
export function weekAverages(dayTotals: Macros[], targets?: Macros): WeekAverages {
  if (dayTotals.length === 0) {
    return { avgKcal: 0, avgProteinG: 0, proteinPct: null, kcalDelta: null };
  }
  const sum = dayTotals.reduce((acc, d) => add(acc, d), ZERO_MACROS);
  const avgKcal = Math.round(sum.kcal / dayTotals.length);
  const avgProteinG = Math.round(sum.proteinG / dayTotals.length);
  const hasProteinTarget = targets != null && targets.proteinG > 0;
  const hasKcalTarget = targets != null && targets.kcal > 0;
  return {
    avgKcal,
    avgProteinG,
    proteinPct: hasProteinTarget ? Math.round((avgProteinG / targets!.proteinG) * 100) : null,
    kcalDelta: hasKcalTarget ? avgKcal - targets!.kcal : null,
  };
}

/** ISO week number ("Sem 22") of an ISO `YYYY-MM-DD` date. */
export function isoWeekNumber(dateIso: string): number {
  return getISOWeek(parseISO(dateIso));
}

/**
 * Meal names are positional: the schema stores `meal_index` + `meal_time`, not
 * a name, and templates in practice define the classic four. Index 0–3 get the
 * named keys; anything beyond falls back to a numbered label.
 */
export function mealLabelKey(mealIndex: number): { key: string; params?: { n: number } } {
  if (mealIndex >= 0 && mealIndex <= 3) return { key: `planner.mealName.${mealIndex}` };
  return { key: 'planner.mealNameN', params: { n: mealIndex + 1 } };
}
