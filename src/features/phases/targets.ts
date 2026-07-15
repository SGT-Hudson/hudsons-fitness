import {
  computeDailyMacroTargets,
  type FiberMode,
  type KcalMode,
  type PhaseType,
} from '@/lib/macros';
import type { Macros } from '@/features/recipes/macros';
import type { Phase } from './api';

/**
 * The subset of a phase the macro maths reads — structurally satisfied both by
 * a stored `Phase` row and by the editor's live `PhaseDraft`, whose numeric
 * fields are `null` while half-typed (never 0: a blank is not a number).
 */
export interface PhaseTargetInputs {
  phase_type: string;
  kcal_mode: string;
  kcal_value: number | null;
  protein_g_per_kg: number | null;
  fat_pct_of_kcal: number | null;
  fiber_mode: string;
  fiber_value: number | null;
}

/**
 * Thin shape adapter over the canonical {@link computeDailyMacroTargets}.
 *
 * The protein rule (lean-mass, phase-aware table + 1.6 g/kg bodyweight
 * fallback) now lives entirely in the canonical fn — D-B1. This wrapper only
 * maps the phase fields + true scale `weightKg` + optional `bodyFatPct` into
 * the canonical inputs and rounds the result.
 *
 * Returns `null` — a real "no number to show", never zeros — when any numeric
 * input is still blank (a live draft), or for a `tdee_delta` phase with no
 * TDEE estimate.
 */
export function computeDraftTargets(
  draft: PhaseTargetInputs,
  weightKg: number,
  bodyFatPct?: number | null,
  estimatedTdeeKcal?: number | null,
): Macros | null {
  // A DRAFT with a blank protein field is incomplete — the schema will reject
  // the save, so the preview must not paint the table-default instead. (For a
  // stored row this gate never fires; the canonical fn's D-B1 table fallback
  // stays reachable through `computePhaseTargets`.)
  if (draft.protein_g_per_kg == null) return null;
  return computeTargets(draft, weightKg, bodyFatPct, estimatedTdeeKcal);
}

/** {@link computeDraftTargets}, for a stored row — where a null
 *  `protein_g_per_kg` is not "half-typed" but "use the D-B1 table default". */
export function computePhaseTargets(
  phase: Phase,
  weightKg: number,
  bodyFatPct?: number | null,
  estimatedTdeeKcal?: number | null,
): Macros | null {
  return computeTargets(phase, weightKg, bodyFatPct, estimatedTdeeKcal);
}

function computeTargets(
  draft: PhaseTargetInputs,
  weightKg: number,
  bodyFatPct?: number | null,
  estimatedTdeeKcal?: number | null,
): Macros | null {
  if (
    draft.kcal_value == null ||
    draft.fat_pct_of_kcal == null ||
    draft.fiber_value == null
  ) {
    return null;
  }
  if (draft.kcal_mode === 'tdee_delta' && estimatedTdeeKcal == null) return null;

  const t = computeDailyMacroTargets({
    weightKg,
    bodyFatPct,
    phaseType: draft.phase_type as PhaseType,
    phase: {
      kcal_mode: draft.kcal_mode as KcalMode,
      kcal_value: draft.kcal_value,
      protein_g_per_kg: draft.protein_g_per_kg,
      fat_pct_of_kcal: draft.fat_pct_of_kcal,
      fiber_mode: draft.fiber_mode as FiberMode,
      fiber_value: draft.fiber_value,
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
