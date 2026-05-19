import { describe, it, expect } from 'vitest';
import {
  computeDailyMacroTargets,
  computeTargetWeightKg,
  mifflinStJeor,
  ageYearsFromBirthDate,
  estimatedBmr,
  fractionToPct,
  pctToFraction,
  PHASE_PROTEIN_DEFAULTS_G_PER_KG_LBM,
  PROTEIN_FALLBACK_G_PER_KG_BODYWEIGHT,
  type PhaseInputs,
} from './macros';

// Characterization tests for the pure macro core (D-F1 / R-16 Tier-1).
// NOTE (D-B1 / R-05): the PROTEIN assertions below were intentionally updated
// from the old `weightKg × protein_g_per_kg` behavior to the new canonical
// rule — phase-aware lean-mass table when a body-fat % is present, and a
// 1.6 g/kg-bodyweight fallback when it is absent. The canonical fn now owns
// the rule (the thin `computePhaseTargets` wrapper no longer pre-feeds lean
// mass through a misnamed `weightKg`). kcal / fat / carb / fiber assertions
// are UNCHANGED.

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
      bodyFatPct: 20,
      phaseType: 'maintenance',
      phase: basePhase,
      estimatedTDEE: 2500,
    });
    // kcal = absolute => 2000 (TDEE ignored)
    expect(r.kcal).toBe(2000);
    // D-B1: bf% present → lean = 80 * (1 - 0.20) = 64 ; protein = 64 * 2 = 128
    expect(r.proteinG).toBe(128);
    // fatKcal = 2000 * 0.3 = 600 ; fatG = 600 / 9 (unchanged)
    expect(r.fatG).toBeCloseTo(600 / 9, 10);
    // carbsKcal = 2000 - (128*4) - 600 = 2000 - 512 - 600 = 888 ; /4 = 222
    expect(r.carbsG).toBeCloseTo(222, 10);
    // fixed fiber (unchanged)
    expect(r.fiberG).toBe(30);
  });

  it('uses estimatedTDEE + kcal_value when kcal_mode is tdee_delta', () => {
    const r = computeDailyMacroTargets({
      weightKg: 70,
      bodyFatPct: 20,
      phaseType: 'maintenance',
      phase: { ...basePhase, kcal_mode: 'tdee_delta', kcal_value: -500 },
      estimatedTDEE: 2400,
    });
    // kcal = 2400 + (-500) = 1900 (unchanged)
    expect(r.kcal).toBe(1900);
    // D-B1: lean = 70 * 0.8 = 56 ; protein = 56 * 2 = 112
    expect(r.proteinG).toBe(112);
    expect(r.fatG).toBeCloseTo((1900 * 0.3) / 9, 10);
  });

  it('clamps carbs at 0 when protein+fat kcal exceed total kcal', () => {
    const r = computeDailyMacroTargets({
      weightKg: 100,
      bodyFatPct: 10,
      phaseType: 'cut',
      phase: {
        ...basePhase,
        kcal_value: 1000,
        protein_g_per_kg: 3, // lean = 90 ; 270g protein => 1080 kcal alone
        fat_pct_of_kcal: 0.4,
      },
      estimatedTDEE: 0,
    });
    expect(r.carbsG).toBe(0);
  });

  it('computes per_1000_kcal fiber from the resolved kcal target', () => {
    const r = computeDailyMacroTargets({
      weightKg: 80,
      bodyFatPct: 20,
      phaseType: 'maintenance',
      phase: {
        ...basePhase,
        kcal_value: 2500,
        fiber_mode: 'per_1000_kcal',
        fiber_value: 14,
      },
      estimatedTDEE: 0,
    });
    // (2500 / 1000) * 14 = 35 (unchanged — kcal-derived, not protein)
    expect(r.fiberG).toBeCloseTo(35, 10);
  });
});

describe('computeDailyMacroTargets — protein rule (D-B1 / R-05)', () => {
  const proteinPhase = (over: Partial<PhaseInputs> = {}): PhaseInputs => ({
    ...basePhase,
    ...over,
  });

  it('bf% present + explicit protein_g_per_kg: lean × override beats the table', () => {
    // lean = 80 * (1 - 0.25) = 60 ; override 2.5 → 150 (NOT the cut table 2.4)
    const r = computeDailyMacroTargets({
      weightKg: 80,
      bodyFatPct: 25,
      phaseType: 'cut',
      phase: proteinPhase({ protein_g_per_kg: 2.5 }),
      estimatedTDEE: 0,
    });
    expect(r.proteinG).toBeCloseTo(60 * 2.5, 10);
  });

  it('bf% present + no stored override: uses the cut table default (2.4 g/kg LBM)', () => {
    // lean = 80 * 0.8 = 64 ; 64 * 2.4 = 153.6
    const r = computeDailyMacroTargets({
      weightKg: 80,
      bodyFatPct: 20,
      phaseType: 'cut',
      phase: proteinPhase({ protein_g_per_kg: null }),
      estimatedTDEE: 0,
    });
    expect(r.proteinG).toBeCloseTo(64 * PHASE_PROTEIN_DEFAULTS_G_PER_KG_LBM.cut, 10);
    expect(PHASE_PROTEIN_DEFAULTS_G_PER_KG_LBM.cut).toBe(2.4);
  });

  it('bf% present + no override: maintenance table default (2.0 g/kg LBM)', () => {
    const r = computeDailyMacroTargets({
      weightKg: 90,
      bodyFatPct: 30,
      phaseType: 'maintenance',
      phase: proteinPhase({ protein_g_per_kg: undefined }),
      estimatedTDEE: 0,
    });
    // lean = 90 * 0.7 = 63 ; 63 * 2.0 = 126
    expect(r.proteinG).toBeCloseTo(63 * PHASE_PROTEIN_DEFAULTS_G_PER_KG_LBM.maintenance, 10);
    expect(PHASE_PROTEIN_DEFAULTS_G_PER_KG_LBM.maintenance).toBe(2.0);
  });

  it('bf% present + no override: bulk table default (1.8 g/kg LBM)', () => {
    const r = computeDailyMacroTargets({
      weightKg: 100,
      bodyFatPct: 15,
      phaseType: 'bulk',
      phase: proteinPhase({ protein_g_per_kg: null }),
      estimatedTDEE: 0,
    });
    // lean = 100 * 0.85 = 85 ; 85 * 1.8 = 153
    expect(r.proteinG).toBeCloseTo(85 * PHASE_PROTEIN_DEFAULTS_G_PER_KG_LBM.bulk, 10);
    expect(PHASE_PROTEIN_DEFAULTS_G_PER_KG_LBM.bulk).toBe(1.8);
  });

  it('bf% ABSENT: ignores the table/override and uses 1.6 g/kg of total bodyweight', () => {
    // null bf% → fallback path; override 2.5 and cut table are both ignored
    const r = computeDailyMacroTargets({
      weightKg: 80,
      bodyFatPct: null,
      phaseType: 'cut',
      phase: proteinPhase({ protein_g_per_kg: 2.5 }),
      estimatedTDEE: 0,
    });
    expect(r.proteinG).toBeCloseTo(80 * PROTEIN_FALLBACK_G_PER_KG_BODYWEIGHT, 10);
    expect(PROTEIN_FALLBACK_G_PER_KG_BODYWEIGHT).toBe(1.6);
  });

  it('bf% undefined behaves the same as null (fallback path)', () => {
    const r = computeDailyMacroTargets({
      weightKg: 70,
      phaseType: 'maintenance',
      phase: proteinPhase(),
      estimatedTDEE: 0,
    });
    expect(r.proteinG).toBeCloseTo(70 * PROTEIN_FALLBACK_G_PER_KG_BODYWEIGHT, 10);
  });

  it('fallback under-targets vs the lean path for a bf%-less cutter (the deliberate nudge)', () => {
    const withBf = computeDailyMacroTargets({
      weightKg: 80,
      bodyFatPct: 15,
      phaseType: 'cut',
      phase: proteinPhase({ protein_g_per_kg: null }),
      estimatedTDEE: 0,
    });
    const withoutBf = computeDailyMacroTargets({
      weightKg: 80,
      bodyFatPct: null,
      phaseType: 'cut',
      phase: proteinPhase({ protein_g_per_kg: null }),
      estimatedTDEE: 0,
    });
    // 80*0.85*2.4 = 163.2  vs  80*1.6 = 128 → fallback is lower
    expect(withoutBf.proteinG).toBeLessThan(withBf.proteinG);
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

describe('ageYearsFromBirthDate (R-08 / D-B5)', () => {
  it('counts a birthday that has already passed this year', () => {
    expect(ageYearsFromBirthDate('1990-01-15', '2026-05-18')).toBe(36);
  });

  it('does not count a birthday still upcoming this year', () => {
    expect(ageYearsFromBirthDate('1990-11-20', '2026-05-18')).toBe(35);
  });

  it('counts the birthday exactly on the day', () => {
    expect(ageYearsFromBirthDate('1990-05-18', '2026-05-18')).toBe(36);
  });
});

describe('estimatedBmr (R-08 / D-B5 — derived, never stored)', () => {
  const ok = {
    sex: 'male' as const,
    birthDate: '1990-05-18',
    heightCm: 180,
    weightKg: 80,
    asOfISO: '2026-05-18',
  };

  it('matches mifflinStJeor for a complete profile', () => {
    // age = 36 → base = 800 + 1125 - 180 = 1745 ; male +5 = 1750
    expect(estimatedBmr(ok)).toBe(1750);
    expect(estimatedBmr(ok)).toBe(
      mifflinStJeor({ weightKg: 80, heightCm: 180, ageYears: 36, sex: 'male' }),
    );
  });

  it('returns null when any input is missing', () => {
    expect(estimatedBmr({ ...ok, sex: null })).toBeNull();
    expect(estimatedBmr({ ...ok, birthDate: null })).toBeNull();
    expect(estimatedBmr({ ...ok, heightCm: null })).toBeNull();
    expect(estimatedBmr({ ...ok, weightKg: null })).toBeNull();
  });

  it('returns null for non-sensible inputs', () => {
    expect(estimatedBmr({ ...ok, sex: 'unknown' })).toBeNull();
    expect(estimatedBmr({ ...ok, heightCm: 0 })).toBeNull();
    expect(estimatedBmr({ ...ok, weightKg: -1 })).toBeNull();
    expect(estimatedBmr({ ...ok, birthDate: '2030-01-01' })).toBeNull();
  });
});

describe('fractionToPct / pctToFraction (D-B3 / R-06)', () => {
  it('fractionToPct multiplies by 100', () => {
    expect(fractionToPct(0.3)).toBeCloseTo(30, 10);
  });

  it('pctToFraction divides by 100', () => {
    expect(pctToFraction(30)).toBeCloseTo(0.3, 10);
  });

  it('maps the 0.10 / 0.60 storage bounds to 10 / 60 percent', () => {
    expect(fractionToPct(0.1)).toBeCloseTo(10, 10);
    expect(fractionToPct(0.6)).toBeCloseTo(60, 10);
    expect(pctToFraction(10)).toBeCloseTo(0.1, 10);
    expect(pctToFraction(60)).toBeCloseTo(0.6, 10);
  });

  it('round-trips fraction → pct → fraction', () => {
    for (const f of [0.1, 0.25, 0.333, 0.5, 0.6]) {
      expect(pctToFraction(fractionToPct(f))).toBeCloseTo(f, 10);
    }
  });

  it('round-trips pct → fraction → pct', () => {
    for (const p of [10, 25, 30, 45, 60]) {
      expect(fractionToPct(pctToFraction(p))).toBeCloseTo(p, 10);
    }
  });

  it('does no clamping (bound is enforced by the caller / DB CHECK, not here)', () => {
    expect(fractionToPct(0)).toBe(0);
    expect(fractionToPct(1)).toBe(100);
    expect(pctToFraction(0)).toBe(0);
    expect(pctToFraction(100)).toBe(1);
  });
});
