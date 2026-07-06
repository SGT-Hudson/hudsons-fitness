/**
 * Map a value in [0, max] to the gym-blue heat ramp (zero → --heat-zero,
 * max → --gym), token-driven via color-mix so light/dark both resolve.
 */
export function muscleColor(value: number, max: number): string {
  if (value <= 0 || max <= 0) return 'var(--heat-zero)';
  const t = Math.min(1, value / max);
  const pct = Math.round(15 + t * 85); // floor 15% so the lowest load is visibly tinted
  return `color-mix(in oklab, var(--gym) ${pct}%, var(--heat-zero))`;
}

/** Fill for non-muscle parts (head/hands/feet) — distinct from the zero fill. */
export const NEUTRAL_PART = 'var(--heat-part)';
