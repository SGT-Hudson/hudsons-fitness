import { z } from 'zod';

// Co-located zod schema for the ingredient form (D-C2/D-C3, R-09).
//
// Parity with the prior `parseForm` in IngredientFormFields.tsx (which the
// dialog used as an all-or-nothing validator that, on any failure, showed the
// single localized `t('errors.invalid')` message):
//
//  - name: required (trimmed non-empty)
//  - unit_type: 'gram' | 'unit'
//  - kcal / protein / carbs / fat per unit: required, finite, >= 0
//  - fiber per unit: blank is allowed and means 0; otherwise finite >= 0
//  - brand: optional (trimmed-to-null in the dialog's submit mapping)
//
// Inputs are strings (the form keeps `IngredientFormState` string fields, used
// as-is for the OFF-search seed + edit prefill), so numeric fields use a
// preprocessor mirroring `parseForm`'s `Number.isFinite && >= 0` rule, and
// fiber's blank→0 special case. The dialog renders `t('errors.invalid')` off
// the form's invalid state exactly as before — the schema only decides
// validity, no English messages surface.

// STRING-input → non-negative number. `z.input === string` keeps the form
// (which doubles as the OFF-search seed / edit-prefill carrier) string-valued
// and the RHF field type string; `z.output` is the parsed number `parseForm`
// ships. NaN (non-numeric) fails `.min(0)` exactly like the old parser
// returning null.
const nonNegNumberFromString = z
  .string()
  .transform((s) => Number(s))
  .pipe(z.number().min(0));

// Fiber: blank string means 0 (parity with the old `fiber.trim() === '' ? 0`).
const fiberFromString = z
  .string()
  .transform((s) => (s.trim() === '' ? 0 : Number(s)))
  .pipe(z.number().min(0));

// Optional sub-macro (sugar / saturated fat, U-1; salt, R-33 wave 6): blank
// string means NULL (unknown ≠ 0 — distinct from fiber's blank→0). Otherwise
// non-negative number.
const optionalNonNegFromString = z
  .string()
  .transform((s) => (s.trim() === '' ? null : Number(s)))
  .pipe(z.number().min(0).nullable());

export const ingredientFormSchema = z.object({
  name: z.string().trim().min(1),
  brand: z.string(),
  unit_type: z.enum(['gram', 'unit']),
  kcal_per_unit: nonNegNumberFromString,
  protein_g_per_unit: nonNegNumberFromString,
  carbs_g_per_unit: nonNegNumberFromString,
  fat_g_per_unit: nonNegNumberFromString,
  fiber_g_per_unit: fiberFromString,
  sugar_g_per_unit: optionalNonNegFromString,
  saturated_fat_g_per_unit: optionalNonNegFromString,
  salt_g_per_unit: optionalNonNegFromString,
});

export type IngredientFormValues = z.input<typeof ingredientFormSchema>;
export type ParsedIngredientForm = z.output<typeof ingredientFormSchema>;
