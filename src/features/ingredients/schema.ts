import { z } from 'zod';
import { parseDecimalInput } from '@/lib/number';
import { pickFirstError, type FieldErrors } from '@/lib/zod';

// Co-located zod schema for the ingredient form (D-C2/D-C3, R-09).
//
// Parity with the prior `parseForm` in ingredientForm.ts (which the
// OLD dialog used as an all-or-nothing validator that, on any failure, showed
// the single localized `t('errors.invalid')` message and never looked at
// which field or code failed):
//
//  - name: required (trimmed non-empty)
//  - unit_type: 'gram' | 'unit'
//  - kcal / protein / carbs / fat per unit: required, parseable, >= 0
//  - fiber per unit: blank is allowed and means 0; otherwise parseable >= 0
//  - sugar / saturated fat / salt: blank means NULL (unknown); otherwise >= 0
//  - brand: optional (trimmed-to-null in the dialog's submit mapping)
//
// Inputs are strings (the form keeps `IngredientFormState` string fields, used
// as-is for the OFF-search seed + edit prefill), so the numeric fields carry
// the parse: `parseDecimalInput` + the `>= 0` rule, plus fiber's blank→0 and a
// sub-macro's blank→null special cases.
//
// R-33 wave 6 (Task 1) adds STABLE issue codes (R-09 convention — see
// `recipes/schema.ts`, `templates/schema.ts`) so the editor page can show real
// per-field precedence via `firstIngredientError`, instead of the old dialog's
// one collapsed line.
//
// Every numeric field parses through `parseDecimalInput` (@/lib/number — hard
// invariant 6's shared boundary), so a decimal COMMA is accepted: `"8,5"` →
// 8.5. It only reaches here because the fields render as `NumberField`
// (`type="text" inputMode="decimal"`) — a `type="number"` element strips the
// comma before JS ever sees it. What PARSES changed; what BLANK means did not:
// fiber's blank is still 0, a sub-macro's blank is still null (unknown ≠ 0),
// and a garbage sub-macro is still an error, never a silent null.
//
// The one deliberate change: kcal/protein/carbs/fat used to lean on the
// editor's native `<input required>` to block a blank, because a blank parses
// to 0 and this schema waved it through. That attribute is gone with the move
// to `NumberField` (the browser's bubble also preempted this schema's own
// localized message), so zod owns the gate now: `numberRequired`. Without it, a
// blank protein would silently save 0 g.
const NUMBER_CODE = 'invalidNumber';
const REQUIRED_CODE = 'numberRequired';

/** Shared reject condition for every numeric field below: unparseable or negative. */
function isInvalidNonNegNumber(n: number | null): boolean {
  return n === null || n < 0;
}

// STRING-input → non-negative number, blank → 0. `z.input === string` keeps the
// form (which doubles as the OFF-search seed / edit-prefill carrier)
// string-valued and the RHF field type string; `z.output` is the parsed number
// `parseForm` ships.
//
// Blank → 0 is FIBER's contract ("no fibre" — a real claim, as opposed to a
// sub-macro's blank, which is "unknown"). The four required figures below layer
// a required gate on top of this one, so a blank never reaches the 0.
const nonNegNumberFromString = z
  .string()
  .superRefine((s, ctx) => {
    if (s.trim() === '') return; // blank means 0 — not an error
    if (isInvalidNonNegNumber(parseDecimalInput(s))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: NUMBER_CODE });
    }
  })
  .transform((s) => (s.trim() === '' ? 0 : (parseDecimalInput(s) as number)));

// kcal / protein / carbs / fat: the four figures every label carries and the
// macro math needs. The required gate runs BEFORE the blank→0 parse above and
// short-circuits it (a `pipe` whose input schema failed never runs its output
// schema), so a blank emits `numberRequired` instead of quietly becoming 0.
const requiredNonNegNumberFromString = z
  .string()
  .superRefine((s, ctx) => {
    if (s.trim() === '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: REQUIRED_CODE });
    }
  })
  .pipe(nonNegNumberFromString);

// Optional sub-macro (sugar / saturated fat, U-1; salt, R-33 wave 6): blank
// string means NULL (unknown ≠ 0 — distinct from fiber's blank→0). A
// non-blank, unparseable (incl. non-numeric) or negative value emits
// `invalidNumber` — NOT silently coerced to null, so a garbage value never
// masquerades as "unknown".
const optionalNonNegFromString = z
  .string()
  .superRefine((s, ctx) => {
    if (s.trim() === '') return; // blank means null — not an error
    if (isInvalidNonNegNumber(parseDecimalInput(s))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: NUMBER_CODE });
    }
  })
  .transform((s) => (s.trim() === '' ? null : parseDecimalInput(s)));

export const INGREDIENT_ERROR_ORDER = ['nameRequired', REQUIRED_CODE, NUMBER_CODE] as const;
export type IngredientErrorCode = (typeof INGREDIENT_ERROR_ORDER)[number];

export const ingredientFormSchema = z.object({
  name: z.string().trim().superRefine((s, ctx) => {
    if (s === '') ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'nameRequired' });
  }),
  brand: z.string(),
  unit_type: z.enum(['gram', 'unit']),
  kcal_per_unit: requiredNonNegNumberFromString,
  protein_g_per_unit: requiredNonNegNumberFromString,
  carbs_g_per_unit: requiredNonNegNumberFromString,
  fat_g_per_unit: requiredNonNegNumberFromString,
  // Blank fiber means 0 g of fibre, not "unknown" — the one field on the
  // blank→0 contract (see `nonNegNumberFromString`).
  fiber_g_per_unit: nonNegNumberFromString,
  sugar_g_per_unit: optionalNonNegFromString,
  saturated_fat_g_per_unit: optionalNonNegFromString,
  salt_g_per_unit: optionalNonNegFromString,
});

export type IngredientFormValues = z.input<typeof ingredientFormSchema>;
export type ParsedIngredientForm = z.output<typeof ingredientFormSchema>;

/**
 * Pick the single message code to show, preserving field precedence (name
 * first, then the macro/sub-macro fields in their form order). The component
 * maps the returned code to `t('errors.<code>')` — mirrors `firstRecipeError`
 * / `firstTemplateError`.
 */
export function firstIngredientError(errors: FieldErrors): IngredientErrorCode | null {
  return pickFirstError(
    errors,
    [
      'name',
      'kcal_per_unit',
      'protein_g_per_unit',
      'carbs_g_per_unit',
      'fat_g_per_unit',
      'fiber_g_per_unit',
      'sugar_g_per_unit',
      'saturated_fat_g_per_unit',
      'salt_g_per_unit',
    ],
    INGREDIENT_ERROR_ORDER,
  );
}
