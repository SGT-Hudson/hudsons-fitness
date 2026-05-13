import type { Macros } from '@/features/recipes/macros';
import type { Phase } from './api';

export function computePhaseTargets(
  phase: Phase,
  weightKg: number,
  bodyFatPct?: number | null,
  estimatedTdeeKcal?: number | null,
): Macros | null {
  const leanMassKg =
    bodyFatPct != null ? weightKg * (1 - bodyFatPct / 100) : weightKg;

  const proteinG = phase.protein_g_per_kg * leanMassKg;

  let kcal: number | null;
  if (phase.kcal_mode === 'fixed') {
    kcal = phase.kcal_value;
  } else if (phase.kcal_mode === 'per_kg') {
    kcal = phase.kcal_value * leanMassKg;
  } else {
    // tdee_delta — needs a TDEE estimate; null means we can't compute targets yet
    kcal = estimatedTdeeKcal != null ? estimatedTdeeKcal + phase.kcal_value : null;
  }

  if (kcal == null) return null;

  const fatG = ((phase.fat_pct_of_kcal / 100) * kcal) / 9;
  const carbsG = Math.max(0, (kcal - proteinG * 4 - fatG * 9) / 4);
  const fiberG =
    phase.fiber_mode === 'fixed' ? phase.fiber_value : phase.fiber_value * weightKg;

  return {
    kcal: Math.round(kcal),
    proteinG: Math.round(proteinG),
    carbsG: Math.round(carbsG),
    fatG: Math.round(fatG),
    fiberG: Math.round(fiberG),
  };
}
