import { useMemo } from 'react';
import { useActivePhase } from '@/features/phases/hooks';
import { useLatestMeasurement } from '@/features/measurements/hooks';
import { useLatestTdee } from '@/features/tdee/hooks';
import { computePhaseTargets } from '@/features/phases/targets';
import type { Macros } from '@/features/recipes/macros';
import type { PhaseType } from '@/lib/macroStatus';
import type { ProteinBasis } from '@/features/diario/components/DayTotalsCard';

export interface DailyTarget {
  targets?: Macros;
  phaseType?: PhaseType;
  proteinBasis: ProteinBasis;
}

/** The user's current daily macro target (phase + latest weight), shared by
 *  the planner, template editor, and diario. Mirrors DiarioPage's wiring. */
export function useDailyTarget(): DailyTarget {
  const activePhase = useActivePhase();
  const latestMeasurement = useLatestMeasurement();
  const latestTdee = useLatestTdee();

  const targets = useMemo(() => {
    if (!activePhase.data || !latestMeasurement.data?.weight_kg) return undefined;
    return (
      computePhaseTargets(
        activePhase.data,
        latestMeasurement.data.weight_kg,
        latestMeasurement.data.body_fat_pct,
        latestTdee.data?.estimated_tdee_kcal ?? null,
      ) ?? undefined
    );
  }, [activePhase.data, latestMeasurement.data, latestTdee.data]);

  return {
    targets,
    phaseType: activePhase.data?.phase_type as PhaseType | undefined,
    proteinBasis: latestMeasurement.data?.body_fat_pct != null ? 'lean' : 'fallback',
  };
}
