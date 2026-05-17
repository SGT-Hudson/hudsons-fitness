import {
  computeDailyMacroTargets,
  type FiberMode,
  type KcalMode,
  type PhaseType,
} from '@/lib/macros';
import type { Macros } from '@/features/recipes/macros';
import type { Phase } from './api';

/**
 * Thin shape adapter over the canonical {@link computeDailyMacroTargets}.
 *
 * The protein rule (lean-mass, phase-aware table + 1.6 g/kg bodyweight
 * fallback) now lives entirely in the canonical fn — D-B1. This wrapper only
 * maps a `Phase` row + true scale `weightKg` + optional `bodyFatPct` into the
 * canonical inputs and rounds the result. It no longer pre-computes lean mass
 * or feeds it through a misnamed `weightKg` parameter.
 */
export function computePhaseTargets(
  phase: Phase,
  weightKg: number,
  bodyFatPct?: number | null,
  estimatedTdeeKcal?: number | null,
): Macros | null {
  if (phase.kcal_mode === 'tdee_delta' && estimatedTdeeKcal == null) return null;

  const t = computeDailyMacroTargets({
    weightKg,
    bodyFatPct,
    phaseType: phase.phase_type as PhaseType,
    phase: {
      kcal_mode: phase.kcal_mode as KcalMode,
      kcal_value: phase.kcal_value,
      protein_g_per_kg: phase.protein_g_per_kg,
      fat_pct_of_kcal: phase.fat_pct_of_kcal,
      fiber_mode: phase.fiber_mode as FiberMode,
      fiber_value: phase.fiber_value,
    },
    estimatedTDEE: estimatedTdeeKcal ?? 0,
  });

  return {
    kcal: Math.round(t.kcal),
    proteinG: Math.round(t.proteinG),
    carbsG: Math.round(t.carbsG),
    fatG: Math.round(t.fatG),
    fiberG: Math.round(t.fiberG),
  };
}
