import { describe, it, expect } from 'vitest';
import { leanPct, fatKg, leanKg, pctToKg } from './composition';

// Unit tests for the R-11 (D-D5) pure composition arithmetic. These guard the
// fat/lean 100% partition and the %→kg decomposition (presentational only).

describe('leanPct', () => {
  it('lean% = 100 − bodyFat% (true partition, sums to exactly 100)', () => {
    expect(leanPct(20)).toBe(80);
    expect(20 + (leanPct(20) as number)).toBe(100);
  });

  it('returns null when bodyFat% is null (same gating as interpolation)', () => {
    expect(leanPct(null)).toBeNull();
  });

  it('handles edge values without clipping', () => {
    expect(leanPct(0)).toBe(100);
    expect(leanPct(100)).toBe(0);
  });
});

describe('fatKg / leanKg', () => {
  it('decomposes weight 80kg @ bodyFat 20% into fat 16kg / lean 64kg (sums to weight)', () => {
    expect(fatKg(20, 80)).toBe(16);
    expect(leanKg(20, 80)).toBe(64);
    expect((fatKg(20, 80) as number) + (leanKg(20, 80) as number)).toBe(80);
  });

  it('returns null when bodyFat% or weight is null', () => {
    expect(fatKg(null, 80)).toBeNull();
    expect(fatKg(20, null)).toBeNull();
    expect(leanKg(null, 80)).toBeNull();
    expect(leanKg(20, null)).toBeNull();
  });
});

describe('pctToKg', () => {
  it('muscle 40% of 80kg = 32kg; water 55% of 80kg = 44kg', () => {
    expect(pctToKg(40, 80)).toBe(32);
    expect(pctToKg(55, 80)).toBeCloseTo(44, 10);
  });

  it('returns null when pct or weight is null', () => {
    expect(pctToKg(null, 80)).toBeNull();
    expect(pctToKg(40, null)).toBeNull();
  });
});
