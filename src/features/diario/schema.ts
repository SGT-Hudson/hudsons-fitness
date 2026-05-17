import { z } from 'zod';
import { MEAL_TYPE_ORDER } from './api';

// Co-located zod schema for the meal-log entry form (D-C2/D-C3, R-09).
//
// The dialog is multi-mode: create has a recipe / ingredient / custom tab;
// edit is locked to whatever the existing log was. The recipe/ingredient
// autocomplete entities stay in component state (entity objects, not form
// primitives — same pattern as RecipePickerDialog); the schema validates the
// numeric/text primitives and is told, via `hasRecipe` / `hasIngredient`
// booleans, whether an entity is selected.
//
// Parity with the prior hand-rolled cascade in handleSubmit (each branch's
// FIRST failing check, mapped to its exact i18n key):
//   recipe   : !recipe → pickRecipe ; servings invalid/<=0 → servingsInvalid
//   ingredient: !ingredient → pickIngredient ; qty invalid/<=0 → quantityInvalid
//   custom   : name blank → customNameRequired ; kcal blank/NaN → customKcalRequired
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
] as const;
export type MealLogErrorCode = (typeof MEAL_LOG_ERROR_ORDER)[number];

function num(v: string): number {
  const t = v.trim();
  if (t === '') return NaN;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
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
      }
    }
  });

export type MealLogFormValues = z.infer<typeof mealLogFormSchema>;

export function firstMealLogError(
  errors: Record<string, { message?: string } | undefined>,
): MealLogErrorCode | null {
  const codes = new Set<string>();
  for (const key of ['source', 'servings', 'quantity', 'customName', 'customKcal']) {
    const m = errors[key]?.message;
    if (m) codes.add(m);
  }
  for (const code of MEAL_LOG_ERROR_ORDER) {
    if (codes.has(code)) return code;
  }
  return null;
}
