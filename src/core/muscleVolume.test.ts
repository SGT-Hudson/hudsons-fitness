import { describe, expect, it } from 'vitest';
import { computeMuscleVolume, SECONDARY_SET_WEIGHT, type SetInput } from './muscleVolume';

const s = (o: Partial<SetInput>): SetInput => ({
  performedOn: '2026-05-20',
  isWarmup: false,
  primaryMuscles: ['pec_lower'],
  secondaryMuscles: [],
  ...o,
});

describe('computeMuscleVolume (fine codes)', () => {
  it('each primary +1, each secondary +0.5 per working set', () => {
    const r = computeMuscleVolume(
      [s({ primaryMuscles: ['pec_lower'], secondaryMuscles: ['delt_front', 'tri_lateral'] })],
      null,
    );
    expect(r.byMuscle.pec_lower).toBe(1);
    expect(r.byMuscle.delt_front).toBe(SECONDARY_SET_WEIGHT);
    expect(r.byMuscle.tri_lateral).toBe(0.5);
    expect(r.totalWorkingSets).toBe(1);
    expect(r.maxMuscleValue).toBe(1);
  });

  it('multiple primaries each earn 1.0 (does not conserve sets)', () => {
    const r = computeMuscleVolume(
      [s({ primaryMuscles: ['lower_back', 'glutes'], secondaryMuscles: ['hamstrings'] })],
      null,
    );
    expect(r.byMuscle.lower_back).toBe(1);
    expect(r.byMuscle.glutes).toBe(1);
    expect(r.byMuscle.hamstrings).toBe(0.5);
    expect(r.totalWorkingSets).toBe(1);
  });

  it('excludes warm-up sets', () => {
    const r = computeMuscleVolume([s({ isWarmup: true })], null);
    expect(r.totalWorkingSets).toBe(0);
    expect(r.byMuscle.pec_lower).toBe(0);
  });

  it('full_body → footnote count, not shaded; its secondaries ignored', () => {
    const r = computeMuscleVolume(
      [s({ primaryMuscles: ['full_body'], secondaryMuscles: ['abs_upper'] })],
      null,
    );
    expect(r.fullBodySetCount).toBe(1);
    expect(r.byMuscle.abs_upper).toBe(0);
    expect(r.totalWorkingSets).toBe(1);
  });

  it('empty primaries array contributes nothing but still counts as a working set', () => {
    const r = computeMuscleVolume([s({ primaryMuscles: [], secondaryMuscles: [] })], null);
    expect(r.totalWorkingSets).toBe(1);
    expect(r.maxMuscleValue).toBe(0);
  });

  it('respects the inclusive window lower bound (a set ON the bound is kept)', () => {
    const r = computeMuscleVolume(
      [
        s({ performedOn: '2026-05-01' }), // before the bound → dropped
        s({ performedOn: '2026-05-10' }), // exactly the bound → kept (inclusive)
        s({ performedOn: '2026-05-20' }), // after the bound → kept
      ],
      '2026-05-10',
    );
    // 2 kept — guards against a `<=` regression that would drop the boundary date.
    expect(r.totalWorkingSets).toBe(2);
  });
});
