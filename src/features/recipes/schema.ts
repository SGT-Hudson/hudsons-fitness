import { z } from 'zod';
import { parseDecimalInput } from '@/lib/number';
import { pickFirstError, type FieldErrors } from '@/lib/zod';
import { recipeMealTypeSchema } from './mealTypes';

// Co-located zod schema for the recipe editor form (D-C2/D-C3, R-09).
//
// The editor keeps its string-valued, dynamic-row shape (rows carry an
// Ingredient object + a string quantity + a per_serving flag, plus a stable
// rowId for React keys and the live macros card). Validation parity with the
// prior hand-rolled cascade in RecipeEditorForm.handleSubmit:
//
//   1. name.trim() === ''                    → errors.nameRequired
//   2. !Number.isFinite(servings) || <= 0    → errors.servingsInvalid
//   3. prep time set but not whole minutes   → errors.prepTimeInvalid  (R-33 w5)
//   4. prep time above PREP_TIME_MAX_MINUTES → errors.prepTimeTooLarge (R-33 w5)
//   5. filledRows.length === 0               → errors.noIngredients
//   6. a filled row with no ingredient       → errors.rowMissingIngredient
//   7. a filled row with bad/<=0 quantity    → errors.rowInvalidQuantity
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

const stepSchema = z.object({
  stepId: z.string(),
  text: z.string(),
});

export const RECIPE_ERROR_ORDER = [
  'nameRequired',
  'servingsInvalid',
  'prepTimeInvalid',
  'prepTimeTooLarge',
  'noIngredients',
  'rowMissingIngredient',
  'rowInvalidQuantity',
  'stepEmpty',
] as const;

export type RecipeErrorCode = (typeof RECIPE_ERROR_ORDER)[number];

/**
 * A day of minutes. `prep_time_minutes` is an `int4`, and until PR-B no input
 * rendered it — so nothing stopped `'99999999999'` from passing validation,
 * overflowing the column and surfacing a raw Postgres error in the editor's
 * error box. The cap is the form's job (invariant 6): a recipe's prep time is
 * hours, not weeks, and 24 h leaves room for the long ones (slow ferments,
 * overnight marinades) while making the overflow unreachable.
 */
export const PREP_TIME_MAX_MINUTES = 1440;

/**
 * The smallest recipe: half a serving. This was the servings input's native
 * `min` (`min={0.5} step="0.5"`) until the field became a `NumberField` — the
 * browser stops enforcing `min` on `type="text"`, so the rule moved into the
 * schema, where it should have been all along (invariant 6).
 */
export const SERVINGS_MIN = 0.5;

/** What the prep-time string parses to: minutes, "no time recorded", or why it failed. */
export type PrepTimeParse = number | null | 'invalid' | 'tooLarge';

/**
 * R-33 wave 5 — the prep-time form boundary (invariant 6).
 *
 * The `<input>` value is a string; `recipes.prep_time_minutes` is nullable
 * positive-integer MINUTES. Empty (or whitespace-only) → `null`, i.e. "no time
 * recorded" — a legitimate permanent state, not a validation failure. Anything
 * that is not a positive whole number of minutes (0, negatives, fractions,
 * free text) → `'invalid'`; above the cap → `'tooLarge'`. The schema below
 * turns both into (distinct, localized) form errors, and the column's check
 * constraint is the DB-side backstop.
 */
export function parsePrepTimeMinutes(raw: string): PrepTimeParse {
  const s = raw.trim();
  if (s === '') return null;
  if (!/^\d+$/.test(s)) return 'invalid';
  const n = Number(s);
  if (n <= 0) return 'invalid';
  return n > PREP_TIME_MAX_MINUTES ? 'tooLarge' : n;
}

export const recipeFormSchema = z
  .object({
    name: z.string(),
    servings: z.string(),
    description: z.string(),
    // R-36: structured steps replace the old free-text `instructions` column.
    // An empty list is valid — not every recipe needs a method.
    steps: z.array(stepSchema).default([]),
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
    // Servings is NOT an integer, whatever the column name suggests: the input
    // has always been `min={0.5} step="0.5"` and half a serving is a legitimate
    // recipe ("media ración"). So it is fraction-capable → a `NumberField`, and
    // a typed decimal comma reaches this parse. The `min` gate died with
    // `type="number"`, so it lives here now (0.5 — the input's own floor, which
    // is stricter than the old `> 0` and so cannot let anything new through).
    const servings = parseDecimalInput(v.servings);
    if (servings === null || servings < SERVINGS_MIN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['servings'],
        message: 'servingsInvalid',
      });
    }
    const prep = parsePrepTimeMinutes(v.prepTime);
    if (prep === 'invalid' || prep === 'tooLarge') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['prepTime'],
        message: prep === 'tooLarge' ? 'prepTimeTooLarge' : 'prepTimeInvalid',
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
      // A quantity is fraction-capable (82,4 g of chicken), so it renders as a
      // `NumberField` and a typed decimal comma reaches this parse. So does
      // `servings` (half a serving is real). `prepTime` above is integer
      // minutes — it keeps its `type="number"` spinner and its integer parse (a
      // comma there is a typo, not a decimal).
      const q = parseDecimalInput(row.quantity);
      if (q === null || q <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rows'],
          message: 'rowInvalidQuantity',
        });
        return;
      }
    }
    for (const step of v.steps) {
      if (step.text.trim() === '') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['steps'], message: 'stepEmpty' });
        return;
      }
    }
  });

export type RecipeFormValues = z.infer<typeof recipeFormSchema>;

/**
 * Pick the single message to show, preserving the original check precedence.
 * Returns the legacy error code (the component maps it to `t('errors.<code>')`).
 */
export function firstRecipeError(errors: FieldErrors): RecipeErrorCode | null {
  return pickFirstError(errors, ['name', 'servings', 'prepTime', 'rows', 'steps'], RECIPE_ERROR_ORDER);
}
