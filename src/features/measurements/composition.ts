// Pure frontend composition arithmetic for the R-11 composition-chart redesign
// (D-D5). PRESENTATIONAL ONLY — this must never feed protein/TDEE/targets
// (the same guardrail as D-A6's bone analysis). It only converts already-stored
// percentages into kilograms for display.
//
// Definitions (all derived, zero schema/data work):
//   lean%    ≡ 100 − bodyFat%        (a true disjoint 100% partition with fat%)
//   fat_kg   = bodyFat%/100 × weight
//   lean_kg  = weight − fat_kg
//   muscle_kg = muscle%/100 × weight
//   water_kg  = water%/100  × weight

export type CompositionUnit = 'pct' | 'kg';

/** lean% ≡ 100 − bodyFat%. Returns null if bodyFat% is null (same gating as interpolation). */
export function leanPct(bodyFatPct: number | null): number | null {
  if (bodyFatPct == null) return null;
  return 100 - bodyFatPct;
}

/** fat mass in kg from bodyFat% and weight. Null if either input is null. */
export function fatKg(bodyFatPct: number | null, weightKg: number | null): number | null {
  if (bodyFatPct == null || weightKg == null) return null;
  return (bodyFatPct / 100) * weightKg;
}

/** lean mass in kg = weight − fat_kg. Null if either input is null. */
export function leanKg(bodyFatPct: number | null, weightKg: number | null): number | null {
  if (bodyFatPct == null || weightKg == null) return null;
  return weightKg - (bodyFatPct / 100) * weightKg;
}

/** Generic "this percentage of weight" → kg (used for muscle% and water%). */
export function pctToKg(pct: number | null, weightKg: number | null): number | null {
  if (pct == null || weightKg == null) return null;
  return (pct / 100) * weightKg;
}
