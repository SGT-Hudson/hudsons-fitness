import { z } from 'zod';
import { pickFirstError } from '@/lib/zod';
import { recipeMealTypeSchema } from './mealTypes';

// Co-located zod schema for the recipe editor form (D-C2/D-C3, R-09).
//
// The editor keeps its string-valued, dynamic-row shape (rows carry an
// Ingredient object + a string quantity + a per_serving flag, plus a stable
// rowId for React keys and the LiveMacrosPanel). Validation parity with the
// prior hand-rolled cascade in RecipeEditorForm.handleSubmit:
//
//   1. name.trim() === ''                    → errors.nameRequired
//   2. !Number.isFinite(servings) || <= 0    → errors.servingsInvalid
//   3. prep time set but not whole minutes   → errors.prepTimeInvalid  (R-33 w5)
//   4. filledRows.length === 0               → errors.noIngredients
//   5. a filled row with no ingredient       → errors.rowMissingIngredient
//   6. a filled row with bad/<=0 quantity    → errors.rowInvalidQuantity
//
// "filled row" = ingredient set OR quantity string non-empty (unchanged). The
// component still renders ONE localized message and preserves this exact
// precedence by mapping the zod issue back to the original i18n key — no raw
// English zod text ever surfaces. Each rule carries a stable `code` in the
// issue path/message-key so the component can resolve precedence + i18n.

// We validate the structural rules with superRefine so we can emit issues in
// the original priority order and tag them with the legacy error code.
const rowSchema = z.object({
  rowId: z.string(),
  ingredient: z.any().nullable(),
  quantity: z.string(),
  per_serving: z.boolean(),
});

export const RECIPE_ERROR_ORDER = [
  'nameRequired',
  'servingsInvalid',
  'prepTimeInvalid',
  'noIngredients',
  'rowMissingIngredient',
  'rowInvalidQuantity',
] as const;

export type RecipeErrorCode = (typeof RECIPE_ERROR_ORDER)[number];

/**
 * R-33 wave 5 — the prep-time form boundary (invariant 6).
 *
 * The `<input>` value is a string; `recipes.prep_time_minutes` is nullable
 * positive-integer MINUTES. Empty (or whitespace-only) → `null`, i.e. "no time
 * recorded" — a legitimate permanent state, not a validation failure. Anything
 * that is not a positive whole number of minutes (0, negatives, fractions,
 * free text) → `'invalid'`; the schema below turns that into a form error, and
 * the column's check constraint is the DB-side backstop.
 */
export function parsePrepTimeMinutes(raw: string): number | null | 'invalid' {
  const s = raw.trim();
  if (s === '') return null;
  if (!/^\d+$/.test(s)) return 'invalid';
  const n = Number(s);
  return n > 0 ? n : 'invalid';
}

export const recipeFormSchema = z
  .object({
    name: z.string(),
    servings: z.string(),
    description: z.string(),
    instructions: z.string(),
    // R-33 wave 5: optional prep time in minutes (empty = no time recorded).
    prepTime: z.string().default(''),
    rows: z.array(rowSchema),
    // U-2: optional meal-type tags, any combination (empty = untagged).
    mealTypes: z.array(recipeMealTypeSchema).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.name.trim() === '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['name'], message: 'nameRequired' });
    }
    const servings = Number(v.servings);
    if (!Number.isFinite(servings) || servings <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['servings'],
        message: 'servingsInvalid',
      });
    }
    if (parsePrepTimeMinutes(v.prepTime) === 'invalid') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['prepTime'],
        message: 'prepTimeInvalid',
      });
    }
    const filled = v.rows.filter((r) => r.ingredient || r.quantity.trim() !== '');
    if (filled.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rows'], message: 'noIngredients' });
      return;
    }
    for (const row of filled) {
      if (!row.ingredient) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rows'],
          message: 'rowMissingIngredient',
        });
        return;
      }
      const q = Number(row.quantity);
      if (!Number.isFinite(q) || q <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rows'],
          message: 'rowInvalidQuantity',
        });
        return;
      }
    }
  });

export type RecipeFormValues = z.infer<typeof recipeFormSchema>;

/**
 * Pick the single message to show, preserving the original check precedence.
 * Returns the legacy error code (the component maps it to `t('errors.<code>')`).
 */
export function firstRecipeError(
  errors: Record<string, { message?: string } | undefined>,
): RecipeErrorCode | null {
  return pickFirstError(errors, ['name', 'servings', 'prepTime', 'rows'], RECIPE_ERROR_ORDER);
}
