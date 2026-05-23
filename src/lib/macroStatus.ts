// Pure, dependency-free macro-status classifier for the Diario targets card
// (Theme 1 / B1). Fixes the prior "over anything = red" bug: protein/fiber
// are floors, kcal is a phase-aware budget/goal, carbs/fat are informational.

export type MacroKey = 'kcal' | 'proteinG' | 'carbsG' | 'fatG' | 'fiberG';
export type PhaseType = 'cut' | 'maintenance' | 'bulk';

/** Which protein basis the active target was computed on (D-B1). */
export type ProteinBasis = 'lean' | 'fallback';

export type MacroTone =
  | 'budget'      // blue  — comfortably in budget (cut under, maintenance under-band)
  | 'onTarget'    // green — kcal within the on-target band
  | 'floorMet'    // green — protein/fiber floor met or exceeded
  | 'slightOver'  // amber — cut kcal +50..+100 tolerance
  | 'surplusHigh' // amber — bulk kcal > +200
  | 'over'        // red   — cut > +100 / maintenance > +5% / bulk under (not there yet)
  | 'fatLow'      // red   — fat below the essential floor
  | 'neutral';    // grey  — informational (carbs; protein/fiber under; fat in [floor,target]; no target)

/** Colour of the over-target segment: good (dark green), bad (dark red), tolerance (dark amber), or none. */
export type ExcessKind = 'good' | 'bad' | 'tolerance' | null;

export interface MacroStatus {
  /** target - consumed; negative when over. */
  remaining: number;
  /** clamp(consumed/target, 0, 1) * 100 — the in-budget fill. */
  fillPct: number;
  /** max(0, consumed - target). */
  overG: number;
  tone: MacroTone;
  excess: ExcessKind;
  /** Fat only: the essential floor in grams, set when fat is low (drives the min tick). */
  minFloorG?: number;
}

/** Maintenance kcal is "on target" within ±this percent of the target. */
export const KCAL_MAINTENANCE_BAND_PCT = 5 as const;

/** Absolute kcal margins (named so they're trivially tunable). */
export const KCAL_CUT_GREEN_MARGIN = 50 as const;
export const KCAL_CUT_AMBER_MARGIN = 100 as const;
export const KCAL_BULK_GREEN_UNDER_MARGIN = 50 as const;
export const KCAL_BULK_SURPLUS_HIGH_MARGIN = 200 as const;

/** Essential-fat floor as a percent of target energy (U-5). */
export const ESSENTIAL_FAT_PCT_OF_KCAL = 20 as const;

/** Essential-fat minimum in grams, derived from target kcal (9 kcal/g). */
export function essentialFatFloorG(targetKcal: number): number {
  if (!Number.isFinite(targetKcal) || targetKcal <= 0) return 0;
  return Math.round((ESSENTIAL_FAT_PCT_OF_KCAL / 100) * targetKcal / 9);
}

export function classifyMacro(
  key: MacroKey,
  consumed: number,
  target: number | undefined,
  phaseType: PhaseType | undefined,
  opts?: { essentialFatFloorG?: number },
): MacroStatus {
  if (target == null || target <= 0) {
    return { remaining: 0, fillPct: 0, overG: 0, tone: 'neutral', excess: null };
  }
  const remaining = target - consumed;
  const fillPct = Math.max(0, Math.min(consumed / target, 1)) * 100;
  const overG = Math.max(0, consumed - target);

  if (key === 'kcal') {
    const d = consumed - target;
    const pt = phaseType ?? 'cut';
    if (pt === 'bulk') {
      if (d < -KCAL_BULK_GREEN_UNDER_MARGIN) return { remaining, fillPct, overG, tone: 'over', excess: null };
      if (d > KCAL_BULK_SURPLUS_HIGH_MARGIN) return { remaining, fillPct, overG, tone: 'surplusHigh', excess: 'tolerance' };
      return { remaining, fillPct, overG, tone: 'onTarget', excess: null };
    }
    if (pt === 'maintenance') {
      const band = (target * KCAL_MAINTENANCE_BAND_PCT) / 100;
      if (d > band) return { remaining, fillPct, overG, tone: 'over', excess: 'bad' };
      if (d < -band) return { remaining, fillPct, overG, tone: 'budget', excess: null };
      return { remaining, fillPct, overG, tone: 'onTarget', excess: null };
    }
    // cut
    if (d > KCAL_CUT_AMBER_MARGIN) return { remaining, fillPct, overG, tone: 'over', excess: 'bad' };
    if (d > KCAL_CUT_GREEN_MARGIN) return { remaining, fillPct, overG, tone: 'slightOver', excess: 'tolerance' };
    if (d < -KCAL_CUT_GREEN_MARGIN) return { remaining, fillPct, overG, tone: 'budget', excess: null };
    return { remaining, fillPct, overG, tone: 'onTarget', excess: null };
  }

  if (key === 'proteinG' || key === 'fiberG') {
    if (consumed >= target) return { remaining, fillPct, overG, tone: 'floorMet', excess: overG > 0 ? 'good' : null };
    return { remaining, fillPct, overG, tone: 'neutral', excess: null }; // under = informational (no warning)
  }

  if (key === 'fatG') {
    const floor = opts?.essentialFatFloorG ?? 0;
    if (floor > 0 && consumed < floor) {
      return { remaining, fillPct, overG, tone: 'fatLow', excess: null, minFloorG: floor };
    }
    return { remaining, fillPct, overG, tone: 'neutral', excess: overG > 0 ? 'bad' : null };
  }

  // carbsG — informational; over is mildly bad
  return { remaining, fillPct, overG, tone: 'neutral', excess: overG > 0 ? 'bad' : null };
}
