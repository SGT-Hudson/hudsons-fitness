import { z } from 'zod';
import { pickFirstError, type FieldErrors } from '@/lib/zod';

// Co-located zod schema for the ingredient form (D-C2/D-C3, R-09).
//
// Parity with the prior `parseForm` in IngredientFormFields.tsx (which the
// OLD dialog used as an all-or-nothing validator that, on any failure, showed
// the single localized `t('errors.invalid')` message and never looked at
// which field or code failed):
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
// fiber's blank→0 special case.
//
// R-33 wave 6 (Task 1) adds STABLE issue codes (R-09 convention — see
// `recipes/schema.ts`, `templates/schema.ts`) so the new editor page can show
// real per-field precedence via `firstIngredientError`, instead of the old
// dialog's one collapsed line. The ACCEPT/REJECT set below is unchanged from
// before this task — only the issue `message` (now a code, not zod's default
// English text) is new. In particular: a blank kcal/protein/carbs/fat still
// parses to 0 (not rejected) — that blank-blocking today is the dialog's
// native `<input required>`, not this schema; `nameRequired` is the one
// genuine "required" code because `name` has no such native gate upstream of
// this schema. A future task can tighten the numeric fields to a real
// `*Required` code if the new editor needs it; not touched here to avoid
// changing what saves.
const NUMBER_CODE = 'invalidNumber';

// STRING-input → non-negative number. `z.input === string` keeps the form
// (which doubles as the OFF-search seed / edit-prefill carrier) string-valued
// and the RHF field type string; `z.output` is the parsed number `parseForm`
// ships. Blank parses to 0 (Number('') === 0); non-finite or negative emits
// `invalidNumber`.
const nonNegNumberFromString = z
  .string()
  .superRefine((s, ctx) => {
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: NUMBER_CODE });
    }
  })
  .transform((s) => Number(s));

// Fiber: blank string means 0 (parity with the old `fiber.trim() === '' ? 0`).
const fiberFromString = z
  .string()
  .superRefine((s, ctx) => {
    if (s.trim() === '') return; // blank means 0 — not an error
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: NUMBER_CODE });
    }
  })
  .transform((s) => (s.trim() === '' ? 0 : Number(s)));

// Optional sub-macro (sugar / saturated fat, U-1; salt, R-33 wave 6): blank
// string means NULL (unknown ≠ 0 — distinct from fiber's blank→0). A
// non-blank, non-finite (incl. non-numeric) or negative value emits
// `invalidNumber` — NOT silently coerced to null, so a garbage value never
// masquerades as "unknown".
const optionalNonNegFromString = z
  .string()
  .superRefine((s, ctx) => {
    if (s.trim() === '') return; // blank means null — not an error
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: NUMBER_CODE });
    }
  })
  .transform((s) => (s.trim() === '' ? null : Number(s)));

export const INGREDIENT_ERROR_ORDER = ['nameRequired', NUMBER_CODE] as const;
export type IngredientErrorCode = (typeof INGREDIENT_ERROR_ORDER)[number];

export const ingredientFormSchema = z.object({
  name: z.string().trim().superRefine((s, ctx) => {
    if (s === '') ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'nameRequired' });
  }),
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
