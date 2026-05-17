import { describe, it, expect } from 'vitest';
import { computePhaseTargets } from './targets';
import type { Phase } from './api';

// Characterization tests for the phase-targets wrapper (D-F1 / R-16).
// Verifies: tdee_delta null-guard, lean-mass substitution, integer rounding.

function phase(overrides: Partial<Phase> = {}): Phase {
  return {
    created_at: '2026-01-01T00:00:00Z',
    end_date: null,
    fat_pct_of_kcal: 0.3,
    fiber_mode: 'fixed_g',
    fiber_value: 30,
    id: 'p1',
    kcal_mode: 'absolute',
    kcal_value: 2000,
    name: 'Test phase',
    notes: null,
    phase_type: 'maintenance',
    protein_g_per_kg: 2,
    start_date: '2026-01-01',
    user_id: 'u1',
    ...overrides,
  };
}

describe('computePhaseTargets', () => {
  it('returns null when kcal_mode is tdee_delta and TDEE is missing', () => {
    expect(
      computePhaseTargets(phase({ kcal_mode: 'tdee_delta' }), 80, 20, null),
    ).toBeNull();
    expect(
      computePhaseTargets(phase({ kcal_mode: 'tdee_delta' }), 80),
    ).toBeNull();
  });

  it('uses raw weight when bodyFatPct is null/undefined', () => {
    const r = computePhaseTargets(phase(), 80, null, null);
    expect(r).not.toBeNull();
    // proteinG = round(80 * 2) = 160
    expect(r!.proteinG).toBe(160);
    expect(r!.kcal).toBe(2000);
  });

  it('substitutes lean mass for weight when bodyFatPct is provided', () => {
    // lean = 80 * (1 - 25/100) = 60 ; proteinG = round(60 * 2) = 120
    const r = computePhaseTargets(phase(), 80, 25, null);
    expect(r!.proteinG).toBe(120);
  });

  it('rounds every macro to an integer', () => {
    const r = computePhaseTargets(
      phase({ kcal_value: 2001, fat_pct_of_kcal: 0.31 }),
      77,
      13,
      null,
    );
    expect(r).not.toBeNull();
    for (const v of Object.values(r!)) {
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('adds the tdee delta when TDEE is supplied', () => {
    const r = computePhaseTargets(
      phase({ kcal_mode: 'tdee_delta', kcal_value: -500 }),
      80,
      null,
      2400,
    );
    // kcal = 2400 - 500 = 1900
    expect(r!.kcal).toBe(1900);
  });
});
