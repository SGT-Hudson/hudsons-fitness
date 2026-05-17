import { describe, it, expect } from 'vitest';
import { interpolateSeries, type Point } from './interpolate';

// Characterization tests for the gap-filling interpolation extracted from
// CompositionChart (D-F1 / R-16). Component behavior must stay identical.

function pts(bodyFat: (number | null)[]): Point[] {
  return bodyFat.map((v, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    bodyFat: v,
    muscle: null,
    water: null,
  }));
}

describe('interpolateSeries', () => {
  it('linearly fills interior gaps between known points', () => {
    const r = interpolateSeries(pts([10, null, null, 16]), 'bodyFat');
    // span 3 over 6 => step 2 per index
    expect(r).toEqual([10, 12, 14, 16]);
  });

  it('leaves leading and trailing nulls untouched', () => {
    const r = interpolateSeries(pts([null, 20, null, 24, null]), 'bodyFat');
    expect(r).toEqual([null, 20, 22, 24, null]);
  });

  it('returns all-null input unchanged', () => {
    const r = interpolateSeries(pts([null, null, null]), 'bodyFat');
    expect(r).toEqual([null, null, null]);
  });

  it('keeps existing values and only fills the holes', () => {
    const r = interpolateSeries(pts([5, 5, null, 5, 5]), 'bodyFat');
    expect(r).toEqual([5, 5, 5, 5, 5]);
  });

  it('handles a single known point', () => {
    const r = interpolateSeries(pts([null, 7, null]), 'bodyFat');
    expect(r).toEqual([null, 7, null]);
  });

  it('interpolates independently per key', () => {
    const points: Point[] = [
      { date: 'a', bodyFat: 10, muscle: 40, water: null },
      { date: 'b', bodyFat: null, muscle: null, water: null },
      { date: 'c', bodyFat: 20, muscle: 50, water: null },
    ];
    expect(interpolateSeries(points, 'bodyFat')).toEqual([10, 15, 20]);
    expect(interpolateSeries(points, 'muscle')).toEqual([40, 45, 50]);
    expect(interpolateSeries(points, 'water')).toEqual([null, null, null]);
  });
});
