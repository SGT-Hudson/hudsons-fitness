import { mifflinStJeor } from '@/lib/macros';

/**
 * R-37 — the formula side of TDEE. Pure, no DB, nothing stored (hard
 * invariant 5): every number here is recomputed on render from inputs the
 * user can edit in place.
 *
 * This is deliberately the WEAKER estimator. R-07's Kalman filter
 * (`src/core/tdee.ts`) learns real expenditure from logged intake and weight
 * and beats any population formula; this module exists only for the cold
 * start, when there is no adaptive estimate to lean on yet.
 *
 * `mifflinStJeor` is imported, not reimplemented — a third copy of that
 * arithmetic (the edge function already holds a second) would be a liability.
 */

export type TdeeSex = 'male' | 'female' | 'other';

export type ActivityKey =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'active'
  | 'very_active';

export interface ActivityLevel {
  key: ActivityKey;
  multiplier: number;
}

/** The standard Harris/Mifflin activity factors, ascending. */
export const ACTIVITY_LEVELS: readonly ActivityLevel[] = [
  { key: 'sedentary', multiplier: 1.2 },
  { key: 'light', multiplier: 1.375 },
  { key: 'moderate', multiplier: 1.55 },
  { key: 'active', multiplier: 1.725 },
  { key: 'very_active', multiplier: 1.9 },
] as const;

export function activityMultiplier(key: ActivityKey): number {
  return ACTIVITY_LEVELS.find((l) => l.key === key)!.multiplier;
}

export interface TdeeFormulaInputs {
  sex: TdeeSex;
  ageYears: number | null;
  heightCm: number | null;
  weightKg: number | null;
  activity: ActivityKey;
}

export interface TdeeFormulaResult {
  bmrKcal: number;
  tdeeKcal: number;
  multiplier: number;
}

/**
 * Mifflin-St Jeor BMR × activity factor, or `null` when any input is missing
 * or non-sensible — the same contract as `estimatedBmr` (`src/lib/macros.ts`),
 * so the caller simply renders nothing.
 *
 * The `<= 0` guards are load-bearing, not defensive noise: `useDecimalDraft`
 * commits `0` when a field is cleared, so without them an emptied weight would
 * paint a confident, meaningless number instead of blanking the result.
 */
export function computeFormulaTdee(
  inputs: TdeeFormulaInputs,
): TdeeFormulaResult | null {
  const { sex, ageYears, heightCm, weightKg, activity } = inputs;
  if (weightKg == null || weightKg <= 0) return null;
  if (heightCm == null || heightCm <= 0) return null;
  if (ageYears == null || ageYears <= 0 || ageYears >= 120) return null;

  const bmrKcal = mifflinStJeor({ weightKg, heightCm, ageYears, sex });
  const multiplier = activityMultiplier(activity);
  return { bmrKcal, tdeeKcal: bmrKcal * multiplier, multiplier };
}

/**
 * Katch-McArdle: `BMR = 370 + 21.6 × leanKg`, then the same activity factor.
 * A secondary reading only — it runs on `body_fat_pct`, the noisiest input in
 * the system (the D-A6 / D-D5 guardrail), so the UI shows it smaller and
 * labelled with the date of the measurement it used.
 *
 * `bodyFatPct` is a PERCENT (18.2), matching the `body_measurements` column
 * and `computeDailyMacroTargets`' `1 - bodyFatPct / 100`.
 */
export function computeKatchTdee(opts: {
  weightKg: number | null;
  bodyFatPct: number | null;
  activity: ActivityKey;
}): TdeeFormulaResult | null {
  const { weightKg, bodyFatPct, activity } = opts;
  if (weightKg == null || weightKg <= 0) return null;
  if (bodyFatPct == null || bodyFatPct <= 0 || bodyFatPct >= 100) return null;

  const leanKg = weightKg * (1 - bodyFatPct / 100);
  const bmrKcal = 370 + 21.6 * leanKg;
  const multiplier = activityMultiplier(activity);
  return { bmrKcal, tdeeKcal: bmrKcal * multiplier, multiplier };
}
