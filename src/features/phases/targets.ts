import { computeDailyMacroTargets, type FiberMode, type KcalMode } from '@/lib/macros';
import type { Macros } from '@/features/recipes/macros';
import type { Phase } from './api';

export function computePhaseTargets(
  phase: Phase,
  weightKg: number,
  bodyFatPct?: number | null,
  estimatedTdeeKcal?: number | null,
): Macros | null {
  if (phase.kcal_mode === 'tdee_delta' && estimatedTdeeKcal == null) return null;

  const leanMassKg =
    bodyFatPct != null ? weightKg * (1 - bodyFatPct / 100) : weightKg;

  const t = computeDailyMacroTargets({
    weightKg: leanMassKg,
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
