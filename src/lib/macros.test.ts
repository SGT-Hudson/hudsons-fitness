import { describe, it, expect } from 'vitest';
import {
  computeDailyMacroTargets,
  computeTargetWeightKg,
  mifflinStJeor,
  estimateBoneKg,
  type PhaseInputs,
} from './macros';

// Characterization tests — assert CURRENT behavior of the pure macro core.
// These are a safety net for later refactors (D-F1 / R-16 Tier-1).

const basePhase: PhaseInputs = {
  kcal_mode: 'absolute',
  kcal_value: 2000,
  protein_g_per_kg: 2,
  fat_pct_of_kcal: 0.3,
  fiber_mode: 'fixed_g',
  fiber_value: 30,
};

describe('computeDailyMacroTargets', () => {
  it('computes macros with absolute kcal mode and fixed fiber', () => {
    const r = computeDailyMacroTargets({
      weightKg: 80,
      phase: basePhase,
      estimatedTDEE: 2500,
    });
    // kcal = absolute => 2000 (TDEE ignored)
    expect(r.kcal).toBe(2000);
    // proteinG = 80 * 2 = 160
    expect(r.proteinG).toBe(160);
    // fatKcal = 2000 * 0.3 = 600 ; fatG = 600 / 9
    expect(r.fatG).toBeCloseTo(600 / 9, 10);
    // carbsKcal = 2000 - (160*4) - 600 = 2000 - 640 - 600 = 760 ; /4 = 190
    expect(r.carbsG).toBeCloseTo(190, 10);
    // fixed fiber
    expect(r.fiberG).toBe(30);
  });

  it('uses estimatedTDEE + kcal_value when kcal_mode is tdee_delta', () => {
    const r = computeDailyMacroTargets({
      weightKg: 70,
      phase: { ...basePhase, kcal_mode: 'tdee_delta', kcal_value: -500 },
      estimatedTDEE: 2400,
    });
    // kcal = 2400 + (-500) = 1900
    expect(r.kcal).toBe(1900);
    expect(r.proteinG).toBe(140);
    expect(r.fatG).toBeCloseTo((1900 * 0.3) / 9, 10);
  });

  it('clamps carbs at 0 when protein+fat kcal exceed total kcal', () => {
    const r = computeDailyMacroTargets({
      weightKg: 100,
      phase: {
        ...basePhase,
        kcal_value: 1000,
        protein_g_per_kg: 3, // 300g protein => 1200 kcal alone
        fat_pct_of_kcal: 0.4,
      },
      estimatedTDEE: 0,
    });
    expect(r.carbsG).toBe(0);
  });

  it('computes per_1000_kcal fiber from the resolved kcal target', () => {
    const r = computeDailyMacroTargets({
      weightKg: 80,
      phase: {
        ...basePhase,
        kcal_value: 2500,
        fiber_mode: 'per_1000_kcal',
        fiber_value: 14,
      },
      estimatedTDEE: 0,
    });
    // (2500 / 1000) * 14 = 35
    expect(r.fiberG).toBeCloseTo(35, 10);
  });
});

describe('computeTargetWeightKg', () => {
  it('holds lean mass constant while changing body-fat target', () => {
    // lean = 100 * (1 - 0.20) = 80 ; target = 80 / (1 - 0.10) = 88.888...
    const w = computeTargetWeightKg({
      currentWeightKg: 100,
      currentBodyFatPct: 20,
      targetBodyFatPct: 10,
    });
    expect(w).toBeCloseTo(80 / 0.9, 10);
  });

  it('returns current weight when body-fat target equals current', () => {
    const w = computeTargetWeightKg({
      currentWeightKg: 90,
      currentBodyFatPct: 18,
      targetBodyFatPct: 18,
    });
    expect(w).toBeCloseTo(90, 10);
  });
});

describe('mifflinStJeor', () => {
  const common = { weightKg: 80, heightCm: 180, ageYears: 30 };
  // base = 10*80 + 6.25*180 - 5*30 = 800 + 1125 - 150 = 1775

  it('adds 5 for male', () => {
    expect(mifflinStJeor({ ...common, sex: 'male' })).toBe(1780);
  });

  it('subtracts 161 for female', () => {
    expect(mifflinStJeor({ ...common, sex: 'female' })).toBe(1614);
  });

  it('treats "other" like female (base - 161)', () => {
    expect(mifflinStJeor({ ...common, sex: 'other' })).toBe(1614);
  });
});

describe('estimateBoneKg', () => {
  it('applies the sex factor and rounds to 2 decimals', () => {
    // base = -0.25 + 0.046*180 + 0.036*80 - 0.012*30
    //      = -0.25 + 8.28 + 2.88 - 0.36 = 10.55
    const base = -0.25 + 0.046 * 180 + 0.036 * 80 - 0.012 * 30;
    const male = estimateBoneKg({
      heightCm: 180,
      weightKg: 80,
      ageYears: 30,
      sex: 'male',
    });
    expect(male).toBe(Math.round(base * 1.05 * 100) / 100);

    const female = estimateBoneKg({
      heightCm: 180,
      weightKg: 80,
      ageYears: 30,
      sex: 'female',
    });
    expect(female).toBe(Math.round(base * 0.95 * 100) / 100);

    const other = estimateBoneKg({
      heightCm: 180,
      weightKg: 80,
      ageYears: 30,
      sex: 'other',
    });
    expect(other).toBe(Math.round(base * 1.0 * 100) / 100);
  });
});
