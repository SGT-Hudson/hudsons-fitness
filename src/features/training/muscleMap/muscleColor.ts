function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/** Map a value in [0, max] to grey→amber→red. Zero/no-data returns the neutral grey. */
export function muscleColor(value: number, max: number): string {
  if (value <= 0 || max <= 0) return '#e5e7eb';
  const t = Math.min(1, value / max);
  if (t < 0.5) {
    const k = t / 0.5;
    return `rgb(${lerp(229, 253, k)},${lerp(231, 186, k)},${lerp(235, 116, k)})`;
  }
  const k = (t - 0.5) / 0.5;
  return `rgb(${lerp(253, 220, k)},${lerp(186, 38, k)},${lerp(116, 38, k)})`;
}

/** Fill for non-muscle parts (head/hands/feet) — slightly distinct from the zero-set grey. */
export const NEUTRAL_PART = '#e3e5e9';
