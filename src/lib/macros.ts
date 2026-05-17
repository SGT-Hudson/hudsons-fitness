export type FiberMode = 'fixed_g' | 'per_1000_kcal';
export type KcalMode = 'absolute' | 'tdee_delta';
export type PhaseType = 'cut' | 'maintenance' | 'bulk';

export interface PhaseInputs {
  kcal_mode: KcalMode;
  kcal_value: number;
  protein_g_per_kg: number;
  fat_pct_of_kcal: number;
  fiber_mode: FiberMode;
  fiber_value: number;
}

/**
 * `phases.fat_pct_of_kcal` is stored as a FRACTION (0.10–0.60), not a percent.
 * These are the single canonical conversion helpers — never inline `×100`/`÷100`
 * at a UI boundary; always go through these (D-B3 / R-06). No clamping: the
 * caller (form `register` min/max + a staged DB CHECK) owns the 0.10–0.60 bound.
 */
export function fractionToPct(fraction: number): number {
  return fraction * 100;
}

/** Inverse of {@link fractionToPct}: a percent input back to the stored fraction. */
export function pctToFraction(pct: number): number {
  return pct / 100;
}

export interface MacroTargets {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export function computeDailyMacroTargets(opts: {
  weightKg: number;
  phase: PhaseInputs;
  estimatedTDEE: number;
}): MacroTargets {
  const { weightKg, phase, estimatedTDEE } = opts;

  const kcal =
    phase.kcal_mode === 'absolute'
      ? phase.kcal_value
      : estimatedTDEE + phase.kcal_value;

  const proteinG = weightKg * phase.protein_g_per_kg;
  const proteinKcal = proteinG * 4;

  const fatKcal = kcal * phase.fat_pct_of_kcal;
  const fatG = fatKcal / 9;

  const carbsKcal = kcal - proteinKcal - fatKcal;
  const carbsG = Math.max(0, carbsKcal / 4);

  const fiberG =
    phase.fiber_mode === 'fixed_g'
      ? phase.fiber_value
      : (kcal / 1000) * phase.fiber_value;

  return { kcal, proteinG, carbsG, fatG, fiberG };
}

export function computeTargetWeightKg(opts: {
  currentWeightKg: number;
  currentBodyFatPct: number;
  targetBodyFatPct: number;
}): number {
  const leanMass = opts.currentWeightKg * (1 - opts.currentBodyFatPct / 100);
  return leanMass / (1 - opts.targetBodyFatPct / 100);
}

export function mifflinStJeor(opts: {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  sex: 'male' | 'female' | 'other';
}): number {
  const base =
    10 * opts.weightKg + 6.25 * opts.heightCm - 5 * opts.ageYears;
  return opts.sex === 'male' ? base + 5 : base - 161;
}

export function estimateBoneKg(opts: {
  heightCm: number;
  weightKg: number;
  ageYears: number;
  sex: 'male' | 'female' | 'other';
}): number {
  const base =
    -0.25 +
    0.046 * opts.heightCm +
    0.036 * opts.weightKg -
    0.012 * opts.ageYears;
  const sexFactor =
    opts.sex === 'male' ? 1.05 : opts.sex === 'female' ? 0.95 : 1.0;
  return Math.round(base * sexFactor * 100) / 100;
}
