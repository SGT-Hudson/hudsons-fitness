import { z } from 'zod';
import { parseDecimalInput } from '@/lib/number';
import { pickFirstError, type FieldErrors } from '@/lib/zod';
import { MEAL_TYPE_ORDER } from './api';

// Co-located zod schema for the meal-log entry form (D-C2/D-C3, R-09).
//
// The dialog is multi-mode: create has a recipe / ingredient / custom tab;
// edit is locked to whatever the existing log was. The recipe/ingredient
// autocomplete entities stay in component state (entity objects, not form
// primitives); the schema validates the numeric/text primitives and is told,
// via `hasRecipe` / `hasIngredient` booleans, whether an entity is selected.
//
// Parity with the prior hand-rolled cascade in handleSubmit (each branch's
// FIRST failing check, mapped to its exact i18n key):
//   recipe   : !recipe → pickRecipe ; servings invalid/<=0 → servingsInvalid
//   ingredient: !ingredient → pickIngredient ; qty invalid/<=0 → quantityInvalid
//   custom   : name blank → customNameRequired ; kcal blank/NaN → customKcalRequired
//              (+ negative kcal/macro → customMacroInvalid — the zod rule that
//               replaced the inputs' `min={0}`, which `type="text"` dropped)
//
// Edit mode follows the same per-kind rules (recipe→servings, ingredient→qty,
// custom→name+kcal) keyed off the existing log's kind.
//
// The component renders ONE localized message, preserving precedence by the
// legacy code carried in the issue message — no raw English zod text surfaces.

const mealType = z.enum(
  MEAL_TYPE_ORDER as unknown as [string, ...string[]],
);

export const MEAL_LOG_ERROR_ORDER = [
  'pickRecipe',
  'servingsInvalid',
  'pickIngredient',
  'quantityInvalid',
  'customNameRequired',
  'customKcalRequired',
  'customMacroInvalid',
] as const;
export type MealLogErrorCode = (typeof MEAL_LOG_ERROR_ORDER)[number];

/**
 * A required numeric `<input>` value → number, with NaN as "no number here"
 * (blank, garbage, or an ambiguous separator pair). Every rule below reads it
 * through `Number.isFinite`, so NaN is what makes the field's own error fire.
 *
 * The parse is `parseDecimalInput` (invariant 6's shared boundary), so a
 * decimal COMMA is accepted — `"30,5"` → 30.5. It only reaches here because the
 * fields render as `NumberField` (`type="text" inputMode="decimal"`): a
 * `type="number"` element strips the comma before JS sees it. What blank means
 * is unchanged — NaN, i.e. the field's own required failure.
 */
function num(v: string): number {
  return parseDecimalInput(v) ?? NaN;
}

/**
 * The custom entry's macro inputs carried `min={0}`, and `type="text"` stops
 * the browser enforcing it — so this schema is now the only thing between a
 * negative macro and the DB. Blank/unparseable is NOT rejected here: a blank
 * sub-macro means UNKNOWN (null), which is the point of the field.
 */
function refuseNegative(v: string, field: string, ctx: z.RefinementCtx) {
  const n = parseDecimalInput(v);
  if (n !== null && n < 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: 'customMacroInvalid' });
  }
}

export const mealLogFormSchema = z
  .object({
    mealType,
    // 'recipe' | 'ingredient' | 'custom' for create; for edit the component
    // passes the locked kind so the same rules apply.
    source: z.enum(['recipe', 'ingredient', 'custom']),
    hasRecipe: z.boolean(),
    hasIngredient: z.boolean(),
    servings: z.string(),
    quantity: z.string(),
    customName: z.string(),
    customKcal: z.string(),
    customProtein: z.string(),
    customCarbs: z.string(),
    customFat: z.string(),
    customFiber: z.string(),
    notes: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.source === 'recipe') {
      if (!v.hasRecipe) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['source'], message: 'pickRecipe' });
        return;
      }
      const s = num(v.servings);
      if (!Number.isFinite(s) || s <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['servings'],
          message: 'servingsInvalid',
        });
      }
    } else if (v.source === 'ingredient') {
      if (!v.hasIngredient) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['source'],
          message: 'pickIngredient',
        });
        return;
      }
      const q = num(v.quantity);
      if (!Number.isFinite(q) || q <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['quantity'],
          message: 'quantityInvalid',
        });
      }
    } else {
      if (v.customName.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['customName'],
          message: 'customNameRequired',
        });
        return;
      }
      const kcal = num(v.customKcal);
      if (!Number.isFinite(kcal)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['customKcal'],
          message: 'customKcalRequired',
        });
        return;
      }
      refuseNegative(v.customKcal, 'customKcal', ctx);
      refuseNegative(v.customProtein, 'customProtein', ctx);
      refuseNegative(v.customCarbs, 'customCarbs', ctx);
      refuseNegative(v.customFat, 'customFat', ctx);
      refuseNegative(v.customFiber, 'customFiber', ctx);
    }
  });

export type MealLogFormValues = z.infer<typeof mealLogFormSchema>;

export function firstMealLogError(errors: FieldErrors): MealLogErrorCode | null {
  return pickFirstError(
    errors,
    [
      'source',
      'servings',
      'quantity',
      'customName',
      'customKcal',
      'customProtein',
      'customCarbs',
      'customFat',
      'customFiber',
    ],
    MEAL_LOG_ERROR_ORDER,
  );
}
