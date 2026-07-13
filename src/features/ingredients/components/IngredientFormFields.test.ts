import { describe, expect, it } from 'vitest';
import { emptyForm, ingredientToForm, offResultToForm, parseForm } from './IngredientFormFields';
import type { OFFSearchResult } from '@/lib/openfoodfacts';

// Tier-1 (pure logic, no DOM): the ingredient form's string ↔ value boundary.
//
// The contract under test is the U-1 sub-macro rule, which R-33 wave 6 extends
// to salt: a NULL sub-macro means UNKNOWN, never 0. So `ingredientToForm` must
// map `null` to a BLANK input (not "0"), and `parseForm` must map a blank input
// back to `null` (not 0) — while fiber, which is NOT an optional sub-macro,
// keeps its blank→0 behaviour.

const storedRow = {
  name: 'Pan de molde',
  brand: 'Bimbo',
  unit_type: 'gram',
  kcal_per_unit: 265,
  protein_g_per_unit: 9,
  carbs_g_per_unit: 49,
  fat_g_per_unit: 3.2,
  fiber_g_per_unit: 2.7,
  sugar_g_per_unit: 5,
  saturated_fat_g_per_unit: 0.6,
  salt_g_per_unit: 1.1,
};

const validForm = {
  ...emptyForm,
  name: 'Pan',
  kcal_per_unit: '265',
  protein_g_per_unit: '9',
  carbs_g_per_unit: '49',
  fat_g_per_unit: '3.2',
};

describe('ingredientToForm — salt', () => {
  it('renders a known salt value as its string', () => {
    expect(ingredientToForm(storedRow).salt_g_per_unit).toBe('1.1');
  });

  it('renders an UNKNOWN (null) salt as a blank string, NOT "0"', () => {
    const form = ingredientToForm({ ...storedRow, salt_g_per_unit: null });
    expect(form.salt_g_per_unit).toBe('');
    expect(form.salt_g_per_unit).not.toBe('0');
  });

  it('renders an absent salt column (legacy row) as blank', () => {
    const { salt_g_per_unit: _omitted, ...legacyRow } = storedRow;
    expect(ingredientToForm(legacyRow).salt_g_per_unit).toBe('');
  });

  it('renders an explicit 0 salt as "0" (a real claim, distinct from unknown)', () => {
    expect(ingredientToForm({ ...storedRow, salt_g_per_unit: 0 }).salt_g_per_unit).toBe('0');
  });
});

describe('parseForm — salt', () => {
  it('parses a blank salt input to null (unknown), NOT 0', () => {
    const parsed = parseForm({ ...validForm, salt_g_per_unit: '' });
    expect(parsed).not.toBeNull();
    expect(parsed!.salt_g_per_unit).toBeNull();
    expect(parsed!.salt_g_per_unit).not.toBe(0);
  });

  it('parses a whitespace-only salt input to null', () => {
    expect(parseForm({ ...validForm, salt_g_per_unit: '  ' })!.salt_g_per_unit).toBeNull();
  });

  it('parses a filled salt input to its number', () => {
    expect(parseForm({ ...validForm, salt_g_per_unit: '1.25' })!.salt_g_per_unit).toBe(1.25);
  });

  it('parses an explicit "0" salt to 0, not null', () => {
    expect(parseForm({ ...validForm, salt_g_per_unit: '0' })!.salt_g_per_unit).toBe(0);
  });

  it('rejects a negative salt (mirrors the DB CHECK)', () => {
    expect(parseForm({ ...validForm, salt_g_per_unit: '-1' })).toBeNull();
  });

  it('rejects a non-numeric salt', () => {
    expect(parseForm({ ...validForm, salt_g_per_unit: 'mucha' })).toBeNull();
  });

  it('keeps fiber (not an optional sub-macro) at blank→0', () => {
    expect(parseForm({ ...validForm, fiber_g_per_unit: '' })!.fiber_g_per_unit).toBe(0);
  });
});

describe('blank ↔ null round-trip', () => {
  it('null → blank → null (an unknown salt survives an edit that does not touch it)', () => {
    const form = ingredientToForm({ ...storedRow, salt_g_per_unit: null });
    const parsed = parseForm(form);
    expect(parsed!.salt_g_per_unit).toBeNull();
    // the sibling sub-macros keep the same contract
    expect(parseForm(ingredientToForm({ ...storedRow, sugar_g_per_unit: null }))!.sugar_g_per_unit)
      .toBeNull();
  });

  it('value → string → value', () => {
    const parsed = parseForm(ingredientToForm(storedRow));
    expect(parsed!.salt_g_per_unit).toBe(1.1);
    expect(parsed!.sugar_g_per_unit).toBe(5);
    expect(parsed!.saturated_fat_g_per_unit).toBe(0.6);
  });
});

// offResultToForm — the OFF→form mapping extracted from IngredientDialog
// (R-33 wave 6, Task 1). It was written out TWICE inline (the off-tab pick
// and the barcode onResolved handler); both call sites now share this one
// function. Same U-1 null-preservation contract as ingredientToForm: OFF
// reporting no value for a sub-macro must render as a BLANK input, never "0".
const offProduct: OFFSearchResult = {
  code: '5000112637922',
  name: 'Coca-Cola',
  brand: 'Coca-Cola',
  thumbnailUrl: null,
  kcalPer100g: 42,
  proteinPer100g: 0,
  carbsPer100g: 10.6,
  fatPer100g: 0,
  fiberPer100g: 0,
  sugarPer100g: 10.6,
  satFatPer100g: 0,
  saltPer100g: 0.01,
};

describe('offResultToForm', () => {
  it('maps a fully-known OFF product to string form fields, unit_type always gram', () => {
    const form = offResultToForm(offProduct);
    expect(form.name).toBe('Coca-Cola');
    expect(form.brand).toBe('Coca-Cola');
    expect(form.unit_type).toBe('gram');
    expect(form.kcal_per_unit).toBe('42');
    expect(form.protein_g_per_unit).toBe('0');
    expect(form.carbs_g_per_unit).toBe('10.6');
    expect(form.fat_g_per_unit).toBe('0');
    expect(form.fiber_g_per_unit).toBe('0');
    expect(form.sugar_g_per_unit).toBe('10.6');
    expect(form.saturated_fat_g_per_unit).toBe('0');
    expect(form.salt_g_per_unit).toBe('0.01');
  });

  it('maps a null brand to a blank string', () => {
    expect(offResultToForm({ ...offProduct, brand: null }).brand).toBe('');
  });

  it('preserves NULL sugar/satFat/salt as blank strings, NOT "0" (U-1)', () => {
    const form = offResultToForm({
      ...offProduct,
      sugarPer100g: null,
      satFatPer100g: null,
      saltPer100g: null,
    });
    expect(form.sugar_g_per_unit).toBe('');
    expect(form.saturated_fat_g_per_unit).toBe('');
    expect(form.salt_g_per_unit).toBe('');
    expect(form.sugar_g_per_unit).not.toBe('0');
    expect(form.saturated_fat_g_per_unit).not.toBe('0');
    expect(form.salt_g_per_unit).not.toBe('0');
  });

  it('keeps a real OFF-reported 0 as "0", distinct from an unknown/null value', () => {
    const form = offResultToForm({ ...offProduct, saltPer100g: 0 });
    expect(form.salt_g_per_unit).toBe('0');
  });
});
