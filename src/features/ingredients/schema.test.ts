import { describe, it, expect } from 'vitest';
import { firstIngredientError, ingredientFormSchema } from './schema';

// R-33 wave 6 (Task 1): `firstIngredientError` wraps `pickFirstError` the way
// `firstRecipeError` / `firstTemplateError` do, so the new editor (Task 2/3)
// can show a precedence-ordered message instead of the old dialog's single
// collapsed `errors.invalid` line. Getting there means the schema itself now
// carries STABLE issue codes (previously it relied on zod's default English
// text, which the old dialog never surfaced — it only checked pass/fail).
//
// The accept/reject SET is unchanged from before this task: a blank
// name is still the only genuinely "required" failure (kcal/protein/carbs/fat
// blank still parses as 0 — unchanged behavior, gated today by the dialog's
// native `required` inputs); fiber blank still means 0; sugar/satFat/salt
// blank still means null. Only the issue MESSAGE (code) is new.

const validForm = {
  name: 'Pan',
  brand: '',
  unit_type: 'gram' as const,
  kcal_per_unit: '265',
  protein_g_per_unit: '9',
  carbs_g_per_unit: '49',
  fat_g_per_unit: '3.2',
  fiber_g_per_unit: '',
  sugar_g_per_unit: '',
  saturated_fat_g_per_unit: '',
  salt_g_per_unit: '',
};

describe('ingredientFormSchema — issue codes', () => {
  it('accepts a valid form with no issues', () => {
    expect(ingredientFormSchema.safeParse(validForm).success).toBe(true);
  });

  it('a blank name fails with the nameRequired code', () => {
    const res = ingredientFormSchema.safeParse({ ...validForm, name: '   ' });
    expect(res.success).toBe(false);
    if (!res.success) {
      const issue = res.error.issues.find((i) => i.path[0] === 'name');
      expect(issue?.message).toBe('nameRequired');
    }
  });

  it('a negative required macro fails with the invalidNumber code', () => {
    const res = ingredientFormSchema.safeParse({ ...validForm, kcal_per_unit: '-1' });
    expect(res.success).toBe(false);
    if (!res.success) {
      const issue = res.error.issues.find((i) => i.path[0] === 'kcal_per_unit');
      expect(issue?.message).toBe('invalidNumber');
    }
  });

  it('a non-numeric required macro fails with the invalidNumber code', () => {
    const res = ingredientFormSchema.safeParse({ ...validForm, protein_g_per_unit: 'mucha' });
    expect(res.success).toBe(false);
    if (!res.success) {
      const issue = res.error.issues.find((i) => i.path[0] === 'protein_g_per_unit');
      expect(issue?.message).toBe('invalidNumber');
    }
  });

  // The decimal-comma fix moved these four fields to `NumberField`
  // (`type="text"`), which drops the native `required` gate the editor's inputs
  // carried. The blank→0 transform CANNOT double as that gate — without an
  // explicit zod rule a blank protein would silently save 0 g. So zod owns it
  // now, with its own code (and the app's own message, not a browser bubble).
  it.each(['kcal_per_unit', 'protein_g_per_unit', 'carbs_g_per_unit', 'fat_g_per_unit'])(
    'a blank %s is rejected with the numberRequired code (zod owns the gate `required` used to)',
    (field) => {
      const res = ingredientFormSchema.safeParse({ ...validForm, [field]: '  ' });
      expect(res.success).toBe(false);
      if (!res.success) {
        const issue = res.error.issues.find((i) => i.path[0] === field);
        expect(issue?.message).toBe('numberRequired');
      }
    },
  );

  // A Spanish keyboard puts `,` on the numeric keypad. The DOM half of the fix
  // is `NumberField`; this is the schema half.
  it('accepts a decimal comma in every numeric field, and stores the point value', () => {
    const res = ingredientFormSchema.safeParse({
      ...validForm,
      kcal_per_unit: '265,5',
      protein_g_per_unit: '9,1',
      fiber_g_per_unit: '2,4',
      salt_g_per_unit: '1,2',
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.kcal_per_unit).toBe(265.5);
      expect(res.data.protein_g_per_unit).toBe(9.1);
      expect(res.data.fiber_g_per_unit).toBe(2.4);
      expect(res.data.salt_g_per_unit).toBe(1.2);
    }
  });

  it('rejects an ambiguous separator pair rather than guessing a thousands separator', () => {
    const res = ingredientFormSchema.safeParse({ ...validForm, kcal_per_unit: '1,234.5' });
    expect(res.success).toBe(false);
    if (!res.success) {
      const issue = res.error.issues.find((i) => i.path[0] === 'kcal_per_unit');
      expect(issue?.message).toBe('invalidNumber');
    }
  });

  // `MacroField` hardcoded `max={100}`, which blocked a legitimate save on a
  // `unit_type='unit'` ingredient — 130 g of carbs in one unit is real. The
  // gate is gone with the `type` switch and it is NOT coming back as a zod rule.
  it('accepts a macro above 100 g (a per-unit ingredient can hold one)', () => {
    const res = ingredientFormSchema.safeParse({
      ...validForm,
      unit_type: 'unit',
      carbs_g_per_unit: '130',
    });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.carbs_g_per_unit).toBe(130);
  });

  it('blank fiber still parses to 0 (unchanged)', () => {
    const res = ingredientFormSchema.safeParse({ ...validForm, fiber_g_per_unit: '' });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.fiber_g_per_unit).toBe(0);
  });

  it('a negative fiber fails with the invalidNumber code', () => {
    const res = ingredientFormSchema.safeParse({ ...validForm, fiber_g_per_unit: '-1' });
    expect(res.success).toBe(false);
    if (!res.success) {
      const issue = res.error.issues.find((i) => i.path[0] === 'fiber_g_per_unit');
      expect(issue?.message).toBe('invalidNumber');
    }
  });

  it('blank sugar still parses to null (unchanged — U-1)', () => {
    const res = ingredientFormSchema.safeParse({ ...validForm, sugar_g_per_unit: '' });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.sugar_g_per_unit).toBeNull();
  });

  it('a negative optional sub-macro fails with the invalidNumber code', () => {
    const res = ingredientFormSchema.safeParse({ ...validForm, salt_g_per_unit: '-1' });
    expect(res.success).toBe(false);
    if (!res.success) {
      const issue = res.error.issues.find((i) => i.path[0] === 'salt_g_per_unit');
      expect(issue?.message).toBe('invalidNumber');
    }
  });

  it('a non-numeric optional sub-macro fails with the invalidNumber code (parity with the old reject-on-garbage behavior)', () => {
    const res = ingredientFormSchema.safeParse({ ...validForm, saturated_fat_g_per_unit: 'mucha' });
    expect(res.success).toBe(false);
    if (!res.success) {
      const issue = res.error.issues.find((i) => i.path[0] === 'saturated_fat_g_per_unit');
      expect(issue?.message).toBe('invalidNumber');
    }
  });
});

describe('firstIngredientError', () => {
  it('returns null when there are no errors', () => {
    expect(firstIngredientError({})).toBeNull();
  });

  it('surfaces nameRequired', () => {
    expect(firstIngredientError({ name: { message: 'nameRequired' } })).toBe('nameRequired');
  });

  it('surfaces invalidNumber from any numeric field', () => {
    expect(firstIngredientError({ kcal_per_unit: { message: 'invalidNumber' } })).toBe(
      'invalidNumber',
    );
    expect(firstIngredientError({ salt_g_per_unit: { message: 'invalidNumber' } })).toBe(
      'invalidNumber',
    );
  });

  it('name takes precedence over a numeric field error', () => {
    expect(
      firstIngredientError({
        name: { message: 'nameRequired' },
        kcal_per_unit: { message: 'invalidNumber' },
      }),
    ).toBe('nameRequired');
  });
});
