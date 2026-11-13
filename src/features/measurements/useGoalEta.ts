// Split out of `hooks.ts` on purpose (R-38): `hooks.ts` imports `./api` and
// (transitively, via other hooks) `@/features/auth/AuthProvider`, both of
// which load `@/lib/supabase` at module scope — a component test that ends
// up importing `hooks.ts`, even indirectly, crashes without a Supabase env.
// This module's only imports are `@/features/tdee/hooks` and `./eta`, so
// anything that consumes `useGoalEta` stays testable with just the tdee
// hooks mocked, no Supabase env required.

import { useMemo } from 'react';
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
  const trendWeightKg = tdeeState.data?.trend_weight_kg;
  const avgIntakeKcal = latestTdee.data?.avg_kcal_intake;
  const expenditureKcal = latestTdee.data?.estimated_tdee_kcal;

  // Memoized on the real, primitive inputs — `computeGoalEta` otherwise
  // returns a fresh object every render, and callers that hand the result
  // straight to a chart (WeightChart's `projection` prop) would recompute
  // that chart's own data/domain memos on every render for no reason.
  return useMemo(() => {
    if (
      targetWeightKg == null ||
      trendWeightKg == null ||
      avgIntakeKcal == null ||
      expenditureKcal == null
    ) {
      return null;
    }
    return computeGoalEta({
      currentWeightKg: trendWeightKg,
      targetWeightKg,
      avgIntakeKcal,
      expenditureKcal,
    });
  }, [targetWeightKg, trendWeightKg, avgIntakeKcal, expenditureKcal]);
}
