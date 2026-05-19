// Pure, dependency-free macro-status classifier for the Diario targets card
// (Theme 1 / B1). Fixes the prior "over anything = red" bug: protein/fiber
// are floors, kcal is a phase-aware budget/goal, carbs/fat are informational.

export type MacroKey = 'kcal' | 'proteinG' | 'carbsG' | 'fatG' | 'fiberG';
export type PhaseType = 'cut' | 'maintenance' | 'bulk';

export type MacroTone =
  | 'budget' // in budget / to-go (blue)
  | 'overBudget' // over a kcal ceiling (red)
  | 'floorMet' // floor reached: protein/fiber met, bulk kcal reached (green)
  | 'floorUnderSoft' // protein under: just "remaining" (neutral)
  | 'floorUnderWarn' // fiber under a health minimum (amber)
  | 'flex'; // carbs/fat informational, or no target (grey)

export interface MacroStatus {
  /** target - consumed; may be negative when over. */
  remaining: number;
  /** clamp(consumed / target, 0, 1) * 100. */
  fillPct: number;
  tone: MacroTone;
}

/** Maintenance kcal is "on target" within ±this percent of the target. */
export const KCAL_MAINTENANCE_BAND_PCT = 5 as const;

/**
 * Classify a macro's status for the Diario targets card.
 *
 * @param phaseType Active dietary phase. Defaults to `'cut'` for kcal when
 *   `undefined` (e.g. before phase data resolves); callers should pass the
 *   real phase once loaded so bulk/maintenance kcal isn't shown as a deficit.
 */
export function classifyMacro(
  key: MacroKey,
  consumed: number,
  target: number | undefined,
  phaseType: PhaseType | undefined,
): MacroStatus {
  if (target == null || target <= 0) {
    return { remaining: 0, fillPct: 0, tone: 'flex' };
  }

  const remaining = target - consumed;
  const fillPct = Math.max(0, Math.min(consumed / target, 1)) * 100;

  let tone: MacroTone;
  if (key === 'kcal') {
    const pt = phaseType ?? 'cut';
    if (pt === 'bulk') {
      tone = consumed >= target ? 'floorMet' : 'budget';
    } else if (pt === 'maintenance') {
      const band = (target * KCAL_MAINTENANCE_BAND_PCT) / 100;
      if (consumed > target + band) tone = 'overBudget';
      else if (consumed < target - band) tone = 'budget';
      else tone = 'floorMet';
    } else {
      // cut
      tone = consumed > target ? 'overBudget' : 'budget';
    }
  } else if (key === 'proteinG') {
    tone = consumed >= target ? 'floorMet' : 'floorUnderSoft';
  } else if (key === 'fiberG') {
    tone = consumed >= target ? 'floorMet' : 'floorUnderWarn';
  } else {
    // carbsG, fatG — informational
    tone = 'flex';
  }

  return { remaining, fillPct, tone };
}
