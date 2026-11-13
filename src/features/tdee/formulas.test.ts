import { describe, it, expect } from 'vitest';
import { mifflinStJeor } from '@/lib/macros';
import {
  ACTIVITY_LEVELS,
  computeFormulaTdee,
  computeKatchTdee,
  type TdeeFormulaInputs,
} from './formulas';

// R-37 Tier-1. The calculator is the only thing in the app that turns a
// formula into a kcal target the user can apply, so the arithmetic is pinned
// exactly: a changed multiplier or a changed Katch constant must turn a test
// red (mutation-bite requirement, see the plan's Step 2 below).

const base: TdeeFormulaInputs = {
  sex: 'male',
  ageYears: 36,
  heightCm: 180,
  weightKg: 80,
  activity: 'sedentary',
};
// Mifflin, male, 80 kg / 180 cm / 36 y:
//   10*80 + 6.25*180 - 5*36 + 5 = 800 + 1125 - 180 + 5 = 1750

describe('ACTIVITY_LEVELS', () => {
  it('is the canonical five-row table, in ascending order', () => {
    expect(ACTIVITY_LEVELS.map((l) => l.key)).toEqual([
      'sedentary',
      'light',
      'moderate',
      'active',
      'very_active',
    ]);
    expect(ACTIVITY_LEVELS.map((l) => l.multiplier)).toEqual([
      1.2, 1.375, 1.55, 1.725, 1.9,
    ]);
  });
});

describe('computeFormulaTdee', () => {
  it('returns the Mifflin BMR alongside the multiplied TDEE', () => {
    const result = computeFormulaTdee(base);
    expect(result).not.toBeNull();
    expect(result!.bmrKcal).toBe(1750);
    expect(result!.bmrKcal).toBe(
      mifflinStJeor({ weightKg: 80, heightCm: 180, ageYears: 36, sex: 'male' }),
    );
    expect(result!.multiplier).toBe(1.2);
    expect(result!.tdeeKcal).toBeCloseTo(2100, 10);
  });

  it('applies every activity multiplier', () => {
    for (const level of ACTIVITY_LEVELS) {
      const result = computeFormulaTdee({ ...base, activity: level.key });
      expect(result!.multiplier).toBe(level.multiplier);
      expect(result!.tdeeKcal).toBeCloseTo(1750 * level.multiplier, 10);
    }
  });

  it('follows mifflinStJeor for female and other', () => {
    // base = 800 + 1125 - 180 = 1745 ; female/other = base - 161 = 1584
    expect(computeFormulaTdee({ ...base, sex: 'female' })!.bmrKcal).toBe(1584);
    expect(computeFormulaTdee({ ...base, sex: 'other' })!.bmrKcal).toBe(1584);
  });

  it('returns null when an input is missing', () => {
    expect(computeFormulaTdee({ ...base, weightKg: null })).toBeNull();
    expect(computeFormulaTdee({ ...base, heightCm: null })).toBeNull();
    expect(computeFormulaTdee({ ...base, ageYears: null })).toBeNull();
  });

  it('returns null for a cleared field (useDecimalDraft commits 0)', () => {
    // The body's inputs commit 0 on blank, so 0 must never render a confident
    // number — this is the guard that keeps an emptied weight from painting one.
    expect(computeFormulaTdee({ ...base, weightKg: 0 })).toBeNull();
    expect(computeFormulaTdee({ ...base, heightCm: 0 })).toBeNull();
    expect(computeFormulaTdee({ ...base, ageYears: 0 })).toBeNull();
  });

  it('returns null for non-sensible values', () => {
    expect(computeFormulaTdee({ ...base, weightKg: -1 })).toBeNull();
    expect(computeFormulaTdee({ ...base, ageYears: 120 })).toBeNull();
    expect(computeFormulaTdee({ ...base, ageYears: 200 })).toBeNull();
  });
});

describe('computeKatchTdee', () => {
  it('matches a hand-computed case', () => {
    // lean = 80 * (1 - 20/100) = 64 kg
    // BMR  = 370 + 21.6 * 64 = 370 + 1382.4 = 1752.4
    // TDEE = 1752.4 * 1.55 = 2716.22
    const result = computeKatchTdee({
      weightKg: 80,
      bodyFatPct: 20,
      activity: 'moderate',
    });
    expect(result!.bmrKcal).toBeCloseTo(1752.4, 10);
    expect(result!.multiplier).toBe(1.55);
    expect(result!.tdeeKcal).toBeCloseTo(2716.22, 10);
  });

  it('returns null without a usable body-fat reading', () => {
    expect(
      computeKatchTdee({ weightKg: 80, bodyFatPct: null, activity: 'moderate' }),
    ).toBeNull();
    expect(
      computeKatchTdee({ weightKg: 80, bodyFatPct: 0, activity: 'moderate' }),
    ).toBeNull();
    expect(
      computeKatchTdee({ weightKg: 80, bodyFatPct: 100, activity: 'moderate' }),
    ).toBeNull();
    expect(
      computeKatchTdee({ weightKg: null, bodyFatPct: 20, activity: 'moderate' }),
    ).toBeNull();
    expect(
      computeKatchTdee({ weightKg: 0, bodyFatPct: 20, activity: 'moderate' }),
    ).toBeNull();
  });
});
