// Pure linear-interpolation helper extracted from CompositionChart so it can be
// unit-tested in isolation (D-F1 Tier-1). Behavior is identical to the original
// inline implementation — do not change without updating the chart's golden tests.

export interface Point {
  date: string;
  bodyFat: number | null;
  muscle: number | null;
  water: number | null;
}

export type Key = 'bodyFat' | 'muscle' | 'water';

export function interpolateSeries(points: Point[], key: Key): (number | null)[] {
  const values = points.map((p) => p[key]);
  // first/last non-null indices
  let firstIdx = -1;
  let lastIdx = -1;
  for (let i = 0; i < values.length; i++) {
    if (values[i] != null) {
      if (firstIdx === -1) firstIdx = i;
      lastIdx = i;
    }
  }
  if (firstIdx === -1) return values;

  const result: (number | null)[] = values.slice();
  let prevIdx = firstIdx;
  for (let i = firstIdx + 1; i <= lastIdx; i++) {
    if (result[i] != null) {
      prevIdx = i;
      continue;
    }
    // find next non-null
    let nextIdx = i + 1;
    while (nextIdx <= lastIdx && result[nextIdx] == null) nextIdx++;
    const prev = result[prevIdx] as number;
    const next = result[nextIdx] as number;
    const span = nextIdx - prevIdx;
    const step = i - prevIdx;
    result[i] = prev + ((next - prev) * step) / span;
  }
  return result;
}
