import { describe, expect, it } from 'vitest';
import { computeMuscleVolume, SECONDARY_SET_WEIGHT, type SetInput } from './muscleVolume';

const s = (o: Partial<SetInput>): SetInput => ({
  performedOn: '2026-05-20',
  isWarmup: false,
  primaryMuscle: 'chest',
  secondaryMuscles: [],
  ...o,
});

describe('computeMuscleVolume', () => {
  it('primary +1, secondary +0.5 per working set', () => {
    const r = computeMuscleVolume(
      [s({ primaryMuscle: 'chest', secondaryMuscles: ['shoulders', 'triceps'] })],
      null,
    );
    expect(r.byMuscle.chest).toBe(1);
    expect(r.byMuscle.shoulders).toBe(SECONDARY_SET_WEIGHT);
    expect(r.byMuscle.triceps).toBe(0.5);
    expect(r.totalWorkingSets).toBe(1);
    expect(r.maxMuscleValue).toBe(1);
  });

  it('excludes warm-up sets', () => {
    const r = computeMuscleVolume([s({ isWarmup: true })], null);
    expect(r.totalWorkingSets).toBe(0);
    expect(r.byMuscle.chest).toBe(0);
  });

  it('full_body → footnote count, not shaded; its secondaries ignored', () => {
    const r = computeMuscleVolume(
      [s({ primaryMuscle: 'full_body', secondaryMuscles: ['core'] })],
      null,
    );
    expect(r.fullBodySetCount).toBe(1);
    expect(r.byMuscle.core).toBe(0);
    expect(r.totalWorkingSets).toBe(1);
  });

  it('null primary counts toward total but shades nothing', () => {
    const r = computeMuscleVolume([s({ primaryMuscle: null })], null);
    expect(r.totalWorkingSets).toBe(1);
    expect(r.maxMuscleValue).toBe(0);
  });

  it('windowStart is inclusive; earlier sets dropped', () => {
    const sets = [s({ performedOn: '2026-05-01' }), s({ performedOn: '2026-05-10' })];
    const r = computeMuscleVolume(sets, '2026-05-10');
    expect(r.byMuscle.chest).toBe(1);
  });

  it('all-time (null) keeps everything', () => {
    const r = computeMuscleVolume(
      [s({ performedOn: '2020-01-01' }), s({ performedOn: '2026-05-10' })],
      null,
    );
    expect(r.byMuscle.chest).toBe(2);
  });

  it('empty input → zeros, max 0', () => {
    const r = computeMuscleVolume([], null);
    expect(r.totalWorkingSets).toBe(0);
    expect(r.maxMuscleValue).toBe(0);
    expect(r.fullBodySetCount).toBe(0);
  });
});
