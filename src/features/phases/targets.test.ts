import { describe, it, expect } from 'vitest';
import { computePhaseTargets } from './targets';
import type { Phase } from './api';

// Tests for the thin phase-targets wrapper (D-F1 / R-16).
// Verifies: tdee_delta null-guard, that it passes TRUE bodyweight + bf% +
// phaseType through to the canonical fn (which owns the protein rule per
// D-B1 / R-05 — see macros.test.ts for the full protein matrix), and integer
// rounding. The protein assertions were updated for the D-B1 behavior change.

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

  it('bf% absent → 1.6 g/kg bodyweight fallback (D-B1; was raw weight × g/kg)', () => {
    const r = computePhaseTargets(phase(), 80, null, null);
    expect(r).not.toBeNull();
    // D-B1: no bf% → proteinG = round(80 * 1.6) = 128 (stored 2 g/kg ignored)
    expect(r!.proteinG).toBe(128);
    expect(r!.kcal).toBe(2000);
  });

  it('bf% present → lean mass × the phase stored protein_g_per_kg (D-B1)', () => {
    // lean = 80 * (1 - 25/100) = 60 ; proteinG = round(60 * 2) = 120
    const r = computePhaseTargets(phase(), 80, 25, null);
    expect(r!.proteinG).toBe(120);
  });

  it('bf% present, no stored protein_g_per_kg → phase-aware table default (D-B1)', () => {
    // cut table = 2.4 ; lean = 80 * 0.8 = 64 ; round(64 * 2.4) = 154
    const r = computePhaseTargets(
      phase({ phase_type: 'cut', protein_g_per_kg: null as unknown as number }),
      80,
      20,
      null,
    );
    expect(r!.proteinG).toBe(154);
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
