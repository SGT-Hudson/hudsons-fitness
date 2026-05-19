// Goal-date ETA from the adaptive filter's own dynamics (R-07 / D-B4).
//
// The Kalman process model is w_k = w_{k-1} + (intake − expenditure)/α, so
// the model-implied trend-weight rate is exactly (avgIntake − expenditure)/α
// with α = KCAL_PER_KG. We project the current trend weight to the derived
// target weight at that rate. This is the "Kalman trend-weight rate" path
// (chosen 2026-05-19) — it reuses the filter's persisted quantities, adds no
// new estimator, and is purely derived (never stored), same rule as
// estimatedBmr / computeTargetWeightKg. Dependency-free + deterministic so
// it is unit-tested in isolation (R-16 Tier-1).

import { KCAL_PER_KG } from '@/core/tdee';

export interface GoalEtaInput {
  /** Best current weight anchor — the Kalman filter's trend weight (kg). */
  currentWeightKg: number;
  /** Derived target weight (kg). */
  targetWeightKg: number;
  /** Recent average intake the filter folded (tdee_estimates.avg_kcal_intake). */
  avgIntakeKcal: number;
  /** Current expenditure estimate (tdee_estimates.estimated_tdee_kcal). */
  expenditureKcal: number;
}

export type GoalEtaStatus =
  | 'reached'
  | 'on_track'
  | 'stalled'
  | 'wrong_direction';

export interface GoalEta {
  status: GoalEtaStatus;
  /** Signed trend-weight rate (kg/day); negative = losing. */
  rateKgPerDay: number;
  /** Whole days until the target at the current rate; null when not finite/meaningful. */
  daysToTarget: number | null;
}

/** Within this of target → already there. */
const AT_TARGET_EPS_KG = 0.1;
/** |intake − expenditure| below this is maintenance within estimate noise. */
const MAINTENANCE_NOISE_KCAL = 25;
/** Beyond this the ETA is not actionable; report as stalled instead. */
const MAX_HORIZON_DAYS = 730;

export function computeGoalEta(input: GoalEtaInput): GoalEta | null {
  const { currentWeightKg, targetWeightKg, avgIntakeKcal, expenditureKcal } =
    input;

  if (
    !Number.isFinite(currentWeightKg) ||
    !Number.isFinite(targetWeightKg) ||
    !Number.isFinite(avgIntakeKcal) ||
    !Number.isFinite(expenditureKcal) ||
    currentWeightKg <= 0 ||
    targetWeightKg <= 0
  ) {
    return null;
  }

  const kcalDelta = avgIntakeKcal - expenditureKcal;
  const rateKgPerDay = kcalDelta / KCAL_PER_KG;
  const deltaKg = targetWeightKg - currentWeightKg;

  if (Math.abs(deltaKg) <= AT_TARGET_EPS_KG) {
    return { status: 'reached', rateKgPerDay, daysToTarget: 0 };
  }

  if (Math.abs(kcalDelta) < MAINTENANCE_NOISE_KCAL) {
    return { status: 'stalled', rateKgPerDay, daysToTarget: null };
  }

  if (Math.sign(rateKgPerDay) !== Math.sign(deltaKg)) {
    return { status: 'wrong_direction', rateKgPerDay, daysToTarget: null };
  }

  const days = Math.ceil(deltaKg / rateKgPerDay);
  if (days > MAX_HORIZON_DAYS) {
    return { status: 'stalled', rateKgPerDay, daysToTarget: null };
  }
  return { status: 'on_track', rateKgPerDay, daysToTarget: days };
}
