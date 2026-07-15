export type FiberMode = 'fixed_g' | 'per_1000_kcal';
export type KcalMode = 'absolute' | 'tdee_delta';
export type PhaseType = 'cut' | 'maintenance' | 'bulk';

/** Which protein basis the active target was computed on (D-B1). */
export type ProteinBasis = 'lean' | 'fallback';

export interface PhaseInputs {
  kcal_mode: KcalMode;
  kcal_value: number;
  /**
   * Per-phase protein override, in g/kg of **lean mass**. Always populated
   * for real phases (pre-filled from {@link PHASE_PROTEIN_DEFAULTS_G_PER_KG_LBM}
   * at create time per D-B1); nullable here so the canonical fn can still fall
   * back to the phase-type table if it is ever absent.
   */
  protein_g_per_kg?: number | null;
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

/**
 * Phase-aware protein defaults, in **g per kg of lean body mass** (D-B1).
 * These pre-fill `phases.protein_g_per_kg` at phase-create time (the column
 * is the per-phase override / snapshot — no separate profile or snapshot
 * column exists; D-B2 reversed). Anchored to the Helms et al. FFM range for
 * deficit muscle retention (~2.3–3.1 g/kg FFM), tapering with surplus.
 */
export const PHASE_PROTEIN_DEFAULTS_G_PER_KG_LBM: Record<PhaseType, number> = {
  cut: 2.4,
  maintenance: 2.0,
  bulk: 1.8,
};

/**
 * No-body-fat-% fallback, in **g per kg of total bodyweight** (D-B1). The
 * most recognized literature bodyweight guideline; the mild under-target vs
 * the lean-mass path for a bf%-less cutter is a deliberate nudge to log a
 * body-fat %. Switched automatically/data-driven on bf% presence — no toggle.
 */
export const PROTEIN_FALLBACK_G_PER_KG_BODYWEIGHT = 1.6;

export interface MacroTargets {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

/**
 * Canonical daily macro targets. This function **owns the protein rule**
 * (D-B1): given true scale `weightKg`, the phase, and optionally the latest
 * `bodyFatPct`, it decides the protein basis itself —
 *  - bf% present → `lean = weight × (1 − bf%/100)`, then
 *    `protein = lean × (phase.protein_g_per_kg ??
 *    PHASE_PROTEIN_DEFAULTS_G_PER_KG_LBM[phaseType])`;
 *  - bf% absent  → `protein = weight × PROTEIN_FALLBACK_G_PER_KG_BODYWEIGHT`.
 * No misnamed lean-mass-fed `weightKg`: callers always pass true bodyweight.
 * kcal / fat / carb / fiber math is unchanged.
 */
export function computeDailyMacroTargets(opts: {
  weightKg: number;
  bodyFatPct?: number | null;
  phaseType: PhaseType;
  phase: PhaseInputs;
  estimatedTDEE: number;
}): MacroTargets {
  const { weightKg, bodyFatPct, phaseType, phase, estimatedTDEE } = opts;

  const kcal =
    phase.kcal_mode === 'absolute'
      ? phase.kcal_value
      : estimatedTDEE + phase.kcal_value;

  const proteinG =
    bodyFatPct != null
      ? weightKg *
        (1 - bodyFatPct / 100) *
        (phase.protein_g_per_kg ??
          PHASE_PROTEIN_DEFAULTS_G_PER_KG_LBM[phaseType])
      : weightKg * PROTEIN_FALLBACK_G_PER_KG_BODYWEIGHT;
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

/**
 * Whole-years age from an ISO `birth_date` (`YYYY-MM-DD`) as of `asOfISO`,
 * counting whether this year's birthday has passed. Pure/deterministic
 * (string math, no `Date`/TZ) so it is unit-testable with a fixed "as of".
 * Mirrors the edge fn's `ageYearsFrom` (recalculate-tdee/index.ts).
 */
export function ageYearsFromBirthDate(
  birthISO: string,
  asOfISO: string,
): number {
  const [by, bm, bd] = birthISO.split('-').map(Number);
  const [ay, am, ad] = asOfISO.split('-').map(Number);
  let age = ay - by;
  if (am < bm || (am === bm && ad < bd)) age -= 1;
  return age;
}

/**
 * Estimated BMR (Mifflin–St Jeor) as a **derived, never-stored display**
 * value (D-B5 / R-08) — the exact same pattern as
 * {@link computeTargetWeightKg}: recompute on render from profile
 * (sex, birth_date→age, height_cm) + the latest measured weight; never
 * persist, no DB column, never feed protein/TDEE/targets (display only —
 * the D-A6/D-B5 guardrail). Returns `null` when any input is missing or
 * non-sensible so the caller can simply not render the stat (same as
 * `LatestMeasurementCard`'s null-value `Stat` skip).
 */
export function estimatedBmr(opts: {
  sex: string | null | undefined;
  birthDate: string | null | undefined;
  heightCm: number | null | undefined;
  weightKg: number | null | undefined;
  asOfISO: string;
}): number | null {
  const { sex, birthDate, heightCm, weightKg, asOfISO } = opts;
  if (
    (sex !== 'male' && sex !== 'female' && sex !== 'other') ||
    birthDate == null ||
    heightCm == null ||
    heightCm <= 0 ||
    weightKg == null ||
    weightKg <= 0
  ) {
    return null;
  }
  const ageYears = ageYearsFromBirthDate(birthDate, asOfISO);
  if (ageYears <= 0 || ageYears >= 120) return null;
  return mifflinStJeor({ weightKg, heightCm, ageYears, sex });
}
