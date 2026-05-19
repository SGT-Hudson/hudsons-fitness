// Pure trend math for Progreso (Theme 3). Deterministic — all fns are pure
// over the supplied points array. Dates are 'YYYY-MM-DD' (lexicographically orderable).

export type DeltaMetric = 'weight' | 'bodyFat' | 'muscle' | 'water';
export type DeltaTone = 'good' | 'bad' | 'neutral';
export type PhaseType = 'cut' | 'maintenance' | 'bulk';

export const TREND_LOOKBACK_DAYS = 7;

export interface SmoothedPoint {
  measuredOn: string;
  ma5: number | null;
}

export interface CompositionPoint {
  measuredOn: string;
  value: number | null;
}

function daysBetween(aISO: string, bISO: string): number {
  const a = Date.parse(`${aISO}T00:00:00Z`);
  const b = Date.parse(`${bISO}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

function isoMinusDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** kg/week from the latest smoothed point vs the most recent point at least
 *  TREND_LOOKBACK_DAYS older. null if not derivable.
 *  Cutoff is derived from the latest point in `points`; no external date needed. */
export function smoothedRatePerWeek(
  points: SmoothedPoint[],
): number | null {
  const usable = points
    .filter((p) => p.ma5 != null)
    .sort((a, b) => a.measuredOn.localeCompare(b.measuredOn));
  if (usable.length < 2) return null;
  const latest = usable[usable.length - 1];
  const cutoff = isoMinusDays(latest.measuredOn, TREND_LOOKBACK_DAYS);
  // Fallback when no point is ≥7d older: use the OLDEST usable point so the rate is measured over the longest available span (a more stable slope on sparse data).
  const prior =
    [...usable].reverse().find((p) => p.measuredOn <= cutoff) ?? usable[0];
  if (prior.measuredOn === latest.measuredOn) return null;
  const days = daysBetween(prior.measuredOn, latest.measuredOn);
  if (days <= 0) return null;
  return (((latest.ma5 as number) - (prior.ma5 as number)) / days) * 7;
}

/** latest non-null minus the most recent non-null at least
 *  TREND_LOOKBACK_DAYS older (fallback: nearest prior non-null).
 *  Cutoff is derived from the latest point in `points`; no external date needed. */
export function compositionDelta(
  points: CompositionPoint[],
): number | null {
  const usable = points
    .filter((p) => p.value != null)
    .sort((a, b) => a.measuredOn.localeCompare(b.measuredOn));
  if (usable.length < 2) return null;
  const latest = usable[usable.length - 1];
  const cutoff = isoMinusDays(latest.measuredOn, TREND_LOOKBACK_DAYS);
  const older = [...usable]
    .slice(0, -1)
    .reverse();
  // Fallback: nearest prior non-null point (point-to-point delta, not a slope).
  const prior = older.find((p) => p.measuredOn <= cutoff) ?? older[0];
  if (!prior) return null;
  return (latest.value as number) - (prior.value as number);
}

export function deltaTone(
  metric: DeltaMetric,
  deltaSign: number,
  phaseType?: PhaseType,
): DeltaTone {
  const s = Math.sign(deltaSign);
  if (s === 0) return 'neutral';
  if (metric === 'muscle') return s > 0 ? 'good' : 'bad';
  if (metric === 'water') return 'neutral';
  if (metric === 'bodyFat') {
    if (!phaseType) return 'neutral';
    return s < 0 ? 'good' : 'bad';
  }
  // weight
  if (phaseType === 'cut') return s < 0 ? 'good' : 'bad';
  if (phaseType === 'bulk') return s > 0 ? 'good' : 'bad';
  return 'neutral'; // maintenance or no phase
}
