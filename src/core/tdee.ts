// Shared pure adaptive-TDEE core (R-07 / D-B4).
//
// ONE dependency-free, runtime-agnostic, camelCase implementation of the
// adaptive expenditure estimator (MacroFactor / Hacker's-Diet–Kalman
// lineage) decided in D-B4 and pinned in
// docs/superpowers/specs/2026-05-18-adaptive-tdee-design.md.
//
// It uses ONLY standard JS/TS (no React, no `@/` alias, no Node/Deno-only
// globals, no clock, no IO). Both runtimes import it directly, no
// transpile/codegen:
//   - the client/Vitest via `@/core/tdee` (Vite alias / tsc paths),
//   - the edge via a relative path from `supabase/functions/recalculate-tdee`.
//
// camelCase is deliberate (D-C4): snake_case is reserved for DB-sourced
// rows. The edge keeps a thin snake_case adapter ONLY at the `tdee_state` /
// `tdee_estimates` write boundary (in the edge function itself).
//
// The filter is a 2-state linear Kalman filter on
//   x = [ trendWeightKg , expenditureKcal ]ᵀ
// Spec §2–§7. Everything is deterministic given inputs: no Date.now(), every
// "today"/gap is passed in by the caller.

// ── Tunable constants (spec §4–§7, §10) ─────────────────────────────────────

/**
 * 7700 kcal ≈ 1 kg body mass. D-B4 demotes this from the headline formula
 * to an INTERNAL CONVERSION PRIOR (spec §6): it is a fixed constant inside
 * the process model, never estimated. Making it a third state would be
 * unidentifiable (it trades 1:1 with expenditure in the dynamics).
 */
export const KCAL_PER_KG = 7700;

/** Daily trend-weight process variance (kg²/day). ~50 g/day of genuine signal. */
export const Q_W = 0.05 * 0.05;
/** Daily expenditure random-walk variance (kcal²/day). ~15 kcal/day RMS drift. */
export const Q_E = 15 * 15;
/** Daily weigh-in measurement noise (kg²). ~1 kg σ hydration/gut/glycogen scatter. */
export const R_MEAS = 1.0;

/** Cold-start trend-weight variance (kg²). */
export const P0_W = 4.0;
/** Cold-start expenditure variance (kcal²). Large → fast early convergence + low confidence. */
export const P0_E = 350 * 350;

/** Weigh-in updates required before the estimate is "usable" (mirrors old MIN_INTAKE_DAYS=10). */
export const WARMUP_MIN_OBS = 10;
/** During warm-up, expenditure SD above this stays "low" confidence (kcal). */
export const WARMUP_MAX_SD = 250;
/** Not-warm-up: expenditure SD above this is "medium" confidence (kcal). */
export const SD_MEDIUM = 120;

/** Beyond this many days with no data we warm-restart instead of extrapolating. */
export const MAX_GAP_DAYS = 45;
/** Expenditure variance after a long-gap warm restart (kcal²). */
export const P_RESTART_E = 200 * 200;

// ── State ───────────────────────────────────────────────────────────────────

/**
 * The evolving per-user filter memory. Stored as one row per user in the
 * staged `tdee_state` table (the edge maps camelCase ⇄ snake_case at the DB
 * boundary). `cov*` are the 3 free entries of the symmetric 2×2 covariance
 * P = [[covWW, covWE],[covWE, covEE]].
 */
export interface TdeeState {
  /** Filtered "true" body weight, de-noised (kg). */
  trendWeightKg: number;
  /** Running TDEE estimate (kcal/day). */
  expenditureKcal: number;
  covWW: number;
  covWE: number;
  covEE: number;
  /** Number of measurement-updates folded in so far (warm-up gate). */
  observationsCount: number;
}

export type ConfidenceBand = 'low' | 'medium' | 'high';

export interface Confidence {
  band: ConfidenceBand;
  isWarmup: boolean;
  /** Expenditure standard deviation (kcal), for transparency/telemetry. */
  expenditureSd: number;
}

/** One day's inputs to the filter (spec §5, §7). */
export interface DayInput {
  /** That day's consumed kcal, or null if no intake logged (don't impute). */
  intakeKcal: number | null;
  /** That day's RAW weigh-in (NOT the smoothed view, spec §8), or null. */
  weightKg: number | null;
  /**
   * Whole calendar days elapsed since the last processed day (≥1). 1 in
   * steady state; >1 when catching up after a gap. The caller computes this
   * with the DST-immune UTC-midnight day diff (same as R-18's
   * `daysBetweenISO`); the core never reads a clock.
   */
  gapDays: number;
}

// ── Initialization (spec §7) ────────────────────────────────────────────────

/**
 * Cold-start state. `e0` is supplied by the caller (the edge adapter
 * computes Mifflin–St Jeor BMR × 1.4 from profile + latest weight and passes
 * it in, keeping this core dependency-free).
 */
export function initState(w0: number, e0: number): TdeeState {
  return {
    trendWeightKg: w0,
    expenditureKcal: e0,
    covWW: P0_W,
    covWE: 0,
    covEE: P0_E,
    observationsCount: 0,
  };
}

// ── One day step: predict (+ optional measurement update) ───────────────────

/**
 * Advance the filter by one processed step covering `input.gapDays` calendar
 * days (normally 1).
 *
 * Process model (spec §4), with α = KCAL_PER_KG:
 *   w_k = w_{k-1} + (intake − e_{k-1})/α ;  e_k = e_{k-1}  (slow random walk)
 *   F = [[1, −1/α],[0, 1]] , control B·u = [intake/α, 0]
 * Process noise Q scaled by elapsed days (random-walk variance grows
 * linearly with the gap, spec §7). A missing-intake day skips ONLY the
 * control input (no imputation) but still predicts and grows covariance.
 *
 * Measurement update (spec §5) runs only when a raw weigh-in exists:
 *   y = z − w⁻ ; S = P⁻₀₀ + R ; K = [P⁻₀₀/S, P⁻₀₁/S] ; x⁺ = x⁻ + K·y ;
 *   P⁺ = (I − K H) P⁻.
 *
 * Long gap (spec §7): gapDays > MAX_GAP_DAYS triggers a warm restart — the
 * trend re-anchors to the (present) weigh-in and expenditure variance is
 * re-inflated to P_RESTART_E (expenditure kept as the best prior), and the
 * warm-up gate re-engages (observationsCount reset).
 */
export function stepDay(state: TdeeState, input: DayInput): TdeeState {
  const dt = Math.max(1, Math.floor(input.gapDays));
  const alpha = KCAL_PER_KG;

  // ── Long-gap warm restart ────────────────────────────────────────────────
  if (dt > MAX_GAP_DAYS) {
    // Re-anchor weight to the next weigh-in if present; else drift-free carry.
    const w0 = input.weightKg != null ? input.weightKg : state.trendWeightKg;
    return {
      trendWeightKg: w0,
      expenditureKcal: state.expenditureKcal, // keep best prior
      covWW: P0_W,
      covWE: 0,
      covEE: P_RESTART_E, // diffuse → warm-up again
      observationsCount: 0,
    };
  }

  // ── Time update (predict) ────────────────────────────────────────────────
  // x⁻ = F x + B u.  Weight only moves if intake is known (no imputation).
  let wMinus = state.trendWeightKg;
  if (input.intakeKcal != null) {
    wMinus = state.trendWeightKg + (input.intakeKcal - state.expenditureKcal) / alpha;
  }
  const eMinus = state.expenditureKcal;

  // P⁻ = F P Fᵀ + Q·dt.  F = [[1, −1/α],[0,1]].
  const { covWW: pWW, covWE: pWE, covEE: pEE } = state;
  const f01 = -1 / alpha;
  // FP = [[pWW + f01·pWE, pWE + f01·pEE],[pWE, pEE]]
  const fp00 = pWW + f01 * pWE;
  const fp01 = pWE + f01 * pEE;
  const fp10 = pWE;
  const fp11 = pEE;
  // (FP)Fᵀ , Fᵀ = [[1,0],[f01,1]]
  let pmWW = fp00 + fp01 * f01;
  let pmWE = fp01;
  const pmEW = fp10 + fp11 * f01; // == pmWE by symmetry; kept explicit for clarity
  let pmEE = fp11;
  // Symmetrize defensively, then add process noise (scaled by elapsed days).
  pmWE = (pmWE + pmEW) / 2;
  pmWW += Q_W * dt;
  pmEE += Q_E * dt;

  // ── Measurement update (correct) — only with a real weigh-in ─────────────
  if (input.weightKg == null) {
    return {
      trendWeightKg: wMinus,
      expenditureKcal: eMinus,
      covWW: pmWW,
      covWE: pmWE,
      covEE: pmEE,
      observationsCount: state.observationsCount,
    };
  }

  const y = input.weightKg - wMinus; // innovation
  const s = pmWW + R_MEAS; // innovation covariance (scalar; H = [1,0])
  const k0 = pmWW / s; // Kalman gain, weight component
  const k1 = pmWE / s; // Kalman gain, EXPENDITURE self-correction (spec §5)

  const wPlus = wMinus + k0 * y;
  const ePlus = eMinus + k1 * y;

  // P⁺ = (I − K H) P⁻ , K H = [[k0,0],[k1,0]]
  const cWW = (1 - k0) * pmWW;
  const cWE = (1 - k0) * pmWE;
  const cEE = pmEE - k1 * pmWE;

  return {
    trendWeightKg: wPlus,
    expenditureKcal: ePlus,
    covWW: cWW,
    covWE: cWE,
    covEE: Math.max(cEE, 0), // numerical floor; variance is non-negative
    observationsCount: state.observationsCount + 1,
  };
}

// ── Variance → confidence band (spec §10) ───────────────────────────────────

/**
 * Pure mapping from filter variance + warm-up gate to a UI confidence band.
 * Identical on edge and client (single source). σ_e = √covEE.
 *
 *  - warm-up (obs < WARMUP_MIN_OBS, OR σ_e still > WARMUP_MAX_SD)        → low
 *  - settled but σ_e > SD_MEDIUM (≈ ±0.5 lb/wk target ambiguity)          → medium
 *  - σ_e ≤ SD_MEDIUM                                                      → high
 */
export function confidenceFromState(state: TdeeState): Confidence {
  const expenditureSd = Math.sqrt(Math.max(state.covEE, 0));
  const isWarmup =
    state.observationsCount < WARMUP_MIN_OBS || expenditureSd > WARMUP_MAX_SD;

  let band: ConfidenceBand;
  if (isWarmup) {
    band = 'low';
  } else if (expenditureSd > SD_MEDIUM) {
    band = 'medium';
  } else {
    band = 'high';
  }
  return { band, isWarmup, expenditureSd };
}

// ── Replay helper (catch-up after a gap, and tests) ─────────────────────────

export interface RunResult {
  state: TdeeState;
  /** Per-step emitted estimate series (one entry per processed day). */
  series: Array<{
    expenditureKcal: number;
    trendWeightKg: number;
    confidence: Confidence;
  }>;
}

/**
 * Fold a sequence of day inputs through the filter, returning the final
 * state and the per-day emitted series. Deterministic — pure function of its
 * arguments. The edge uses this to replay every calendar day from
 * `last_updated_on + 1` through the snapshot day (steady state = 1 day).
 */
export function runFilter(initial: TdeeState, days: DayInput[]): RunResult {
  let state = initial;
  const series: RunResult['series'] = [];
  for (const day of days) {
    state = stepDay(state, day);
    series.push({
      expenditureKcal: state.expenditureKcal,
      trendWeightKg: state.trendWeightKg,
      confidence: confidenceFromState(state),
    });
  }
  return { state, series };
}
