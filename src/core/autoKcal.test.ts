import { describe, it, expect } from 'vitest';
import { deriveAutoKcal } from './autoKcal';

// R-33 wave 6 — auto-kcal (spec §3). Pure Atwater derivation: `4·protein +
// 4·carbs + 9·fat`, rounded to the whole kcal that every kcal DISPLAY in the
// app already rounds to (`Math.round(...)` at every `*.kcal` render site —
// RecipeCard, RecipeMacrosCard, WeekSummaryCard, etc.). The stored
// `kcal_per_unit` column tolerates a decimal (the form's `step="0.1"`), but
// the AUTO chip's whole point is to read like a real nutrition label, and
// labels are whole kcal.

describe('deriveAutoKcal — Atwater arithmetic', () => {
  it('sums 4·protein + 4·carbs + 9·fat', () => {
    expect(deriveAutoKcal({ proteinG: 10, carbsG: 20, fatG: 5 })).toBe(4 * 10 + 4 * 20 + 9 * 5);
  });

  it('fat alone (9 kcal/g)', () => {
    expect(deriveAutoKcal({ proteinG: 0, carbsG: 0, fatG: 10 })).toBe(90);
  });

  it('protein and carbs alone (4 kcal/g each)', () => {
    expect(deriveAutoKcal({ proteinG: 10, carbsG: 0, fatG: 0 })).toBe(40);
    expect(deriveAutoKcal({ proteinG: 0, carbsG: 10, fatG: 0 })).toBe(40);
  });

  it('all-zero macros derive to 0 kcal', () => {
    expect(deriveAutoKcal({ proteinG: 0, carbsG: 0, fatG: 0 })).toBe(0);
  });
});

describe('deriveAutoKcal — rounding', () => {
  it('rounds to the nearest whole kcal', () => {
    // 4*1.1 + 4*1.1 + 9*1.1 = 18.7
    expect(deriveAutoKcal({ proteinG: 1.1, carbsG: 1.1, fatG: 1.1 })).toBe(19);
  });

  it('rounds .5 up (banker-unaware, matches Math.round elsewhere in the app)', () => {
    // 4*0 + 4*0 + 9*(0.5/9) is awkward to construct exactly; use a direct .5 case instead
    expect(deriveAutoKcal({ proteinG: 0.125, carbsG: 0, fatG: 0 })).toBe(1); // 0.5 → 1
  });
});

describe('deriveAutoKcal — blank/partial inputs', () => {
  // A blank macro field is a DERIVATION input, not a stored sub-macro — it
  // contributes 0 here, same as any other 0. This is NOT the U-1 null-means-
  // unknown contract (Constraint 3): that governs sugar/satFat/salt columns,
  // not the live protein/carbs/fat numbers feeding this arithmetic.
  it('a partially-filled macro set derives from only the filled fields', () => {
    expect(deriveAutoKcal({ proteinG: 20, carbsG: 0, fatG: 0 })).toBe(80);
  });

  it('non-finite inputs (NaN from a blank/invalid string parse) contribute 0, not NaN', () => {
    expect(deriveAutoKcal({ proteinG: NaN, carbsG: 20, fatG: 0 })).toBe(80);
    expect(deriveAutoKcal({ proteinG: NaN, carbsG: NaN, fatG: NaN })).toBe(0);
  });

  it('negative inputs contribute 0, not a negative derivation', () => {
    expect(deriveAutoKcal({ proteinG: -5, carbsG: 20, fatG: 0 })).toBe(80);
  });
});
