// Pure, dependency-free semantic tone core for nutrition targets, ported
// verbatim from the design canvas's `planificador-tone.jsx` (see
// docs/superpowers/specs/2026-07-09-r33-tone-core.md §2.2). Replaces
// src/lib/macroStatus.ts (D-F17): canvas thresholds and tone vocabulary win.
//
// IMPORTANT — `over` is colour-semantic, not direction-semantic. It means
// "outside the acceptable range, on the bad side", not "above target".
// Protein 20% under target is `over`; fat below the essential floor is
// `over`. This is a wart inherited from the canvas palette keys — read every
// `over` in this file as "red", never as "too much".

export type Tone = 'good' | 'onTarget' | 'slightOver' | 'low' | 'over' | 'neutral';
export type Excess = 'neutral' | 'warn' | 'bad';
export type PhaseType = 'cut' | 'maintenance' | 'bulk';
export type Metric = 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber';

export interface ToneStatus {
  tone: Tone;
  excess: Excess;
  remaining: number; // target - consumed
  overG: number; // max(0, consumed - target)
  minFloorG?: number; // fat only, set when a floor was supplied
}

/** Essential dietary fat floor, in grams per kg of bodyweight (D-F18). */
export const FAT_FLOOR_G_PER_KG = 0.6;

/** Essential fat floor in grams, derived at render — never stored (hard invariant 5). */
export function essentialFatFloorG(weightKg: number): number {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return 0;
  return Math.round(FAT_FLOOR_G_PER_KG * weightKg);
}

/** kcal tone: phase-aware band around target, driven by (consumed - target) / target. */
export function getKcalStatus(consumed: number, target: number, phase: PhaseType): Tone {
  const pct = (consumed - target) / target;
  if (phase === 'cut') {
    if (pct > 0.05) return 'over';
    if (pct > 0.015) return 'slightOver';
    return 'good';
  }
  if (phase === 'bulk') {
    if (pct < -0.05) return 'low';
    if (pct < -0.015) return 'slightOver';
    return 'good';
  }
  // maintenance
  if (Math.abs(pct) <= 0.03) return 'onTarget';
  return pct > 0 ? 'slightOver' : 'low';
}

/** Macro tone (everything but kcal); rule per metric, `pct = (consumed - target) / target`. */
export function getMacroStatus(
  metric: Exclude<Metric, 'kcal'>,
  consumed: number,
  target: number,
  phase: PhaseType,
  fatFloorG?: number,
): Tone {
  const pct = (consumed - target) / target;
  switch (metric) {
    case 'protein':
      if (pct >= -0.03) return 'good';
      if (pct >= -0.1) return 'slightOver';
      return 'over';
    case 'fiber':
      // Overshoot is never penalised — fiber has no ceiling.
      return consumed >= target * 0.9 ? 'good' : 'slightOver';
    case 'fat':
      if (fatFloorG != null && consumed < fatFloorG) return 'over';
      if (pct > 0.1) return 'slightOver';
      return 'good';
    case 'carbs':
      // No phase gate other than cut — deliberate, see spec §2.2.
      return phase === 'cut' && pct > 0.08 ? 'slightOver' : 'good';
  }
}

/** Bar-segment/text urgency implied by a tone. Reads only `status` (the canvas's `metric`/`phase` params are unused). */
export function getExcessTone(status: Tone): Excess {
  if (status === 'over') return 'bad';
  if (status === 'slightOver' || status === 'low') return 'warn';
  return 'neutral';
}

/**
 * App-facing wrapper: guards a missing/non-positive target BEFORE any
 * division (the canvas classifiers above divide by `target` unguarded),
 * dispatches to the right classifier, and derives `excess`.
 *
 * `phase` undefined defaults to `'cut'` — matches the retired
 * `src/lib/macroStatus.ts`'s behaviour.
 */
export function classify(
  metric: Metric,
  consumed: number,
  target: number | undefined,
  phase: PhaseType | undefined,
  opts?: { fatFloorG?: number },
): ToneStatus {
  if (target == null || !Number.isFinite(target) || target <= 0) {
    return { tone: 'neutral', excess: 'neutral', remaining: 0, overG: 0 };
  }

  const resolvedPhase = phase ?? 'cut';
  const tone =
    metric === 'kcal'
      ? getKcalStatus(consumed, target, resolvedPhase)
      : getMacroStatus(metric, consumed, target, resolvedPhase, opts?.fatFloorG);

  const result: ToneStatus = {
    tone,
    excess: getExcessTone(tone),
    remaining: target - consumed,
    overG: Math.max(0, consumed - target),
  };
  if (metric === 'fat' && opts?.fatFloorG != null) {
    result.minFloorG = opts.fatFloorG;
  }
  return result;
}
