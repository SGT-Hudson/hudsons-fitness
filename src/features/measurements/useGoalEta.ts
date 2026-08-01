// Split out of `hooks.ts` on purpose (R-38): `hooks.ts` imports `./api` and
// (transitively, via other hooks) `@/features/auth/AuthProvider`, both of
// which load `@/lib/supabase` at module scope — a component test that ends
// up importing `hooks.ts`, even indirectly, crashes without a Supabase env.
// This module's only imports are `@/features/tdee/hooks` and `./eta`, so
// anything that consumes `useGoalEta` stays testable with just the tdee
// hooks mocked, no Supabase env required.

import { useLatestTdee, useTdeeState } from '@/features/tdee/hooks';
import { computeGoalEta, type GoalEta } from './eta';

/**
 * The goal-date ETA, in one place (R-38). `LatestMeasurementCard` used to build
 * this inline; the weight chart's projection needs the same number, and two
 * copies of a Kalman projection is one copy too many.
 *
 * Anchored at the filter's de-noised trend weight; rate = (avgIntake −
 * expenditure)/7700. Purely derived, never stored.
 */
export function useGoalEta(targetWeightKg: number | null | undefined): GoalEta | null {
  const tdeeState = useTdeeState();
  const latestTdee = useLatestTdee();
  const ts = tdeeState.data;
  const te = latestTdee.data;
  if (targetWeightKg == null || ts == null || te == null) return null;
  return computeGoalEta({
    currentWeightKg: ts.trend_weight_kg,
    targetWeightKg,
    avgIntakeKcal: te.avg_kcal_intake,
    expenditureKcal: te.estimated_tdee_kcal,
  });
}
