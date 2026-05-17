import { z } from 'zod';

// Co-located zod schemas for the planning dialogs (D-C2/D-C3, R-09).
// All error copy stays in the components (localized `t(...)`); the schemas
// only decide validity.

// ApplyTemplateDialog: a template must be picked. Parity with the prior
// `if (!templateId) → t('apply.errors.pickTemplate')`.
export const applyTemplateFormSchema = z.object({
  templateId: z.string().min(1),
});
export type ApplyTemplateFormValues = z.infer<typeof applyTemplateFormSchema>;

// SaveAsTemplateDialog: name required (trimmed non-empty). Parity with the
// prior `if (trimmed === '') → t('save.errors.nameRequired')`.
export const saveAsTemplateFormSchema = z.object({
  name: z.string().trim().min(1),
});
export type SaveAsTemplateFormValues = z.infer<typeof saveAsTemplateFormSchema>;

// RecipePickerDialog: a recipe must be selected and servings must be a finite
// number > 0. Parity with the prior `!recipe → pickRecipe` then
// `!Number.isFinite(s) || s <= 0 → servings`. The recipe object is carried
// outside the schema (autocomplete sets it); we validate its presence via a
// boolean the component feeds in, plus the numeric servings string.
export const RECIPE_PICKER_ERROR_ORDER = ['pickRecipe', 'servings'] as const;
export type RecipePickerErrorCode = (typeof RECIPE_PICKER_ERROR_ORDER)[number];

export const recipePickerFormSchema = z
  .object({
    hasRecipe: z.boolean(),
    servings: z.string(),
  })
  .superRefine((v, ctx) => {
    if (!v.hasRecipe) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['hasRecipe'],
        message: 'pickRecipe',
      });
    }
    const s = Number(v.servings);
    if (!Number.isFinite(s) || s <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['servings'],
        message: 'servings',
      });
    }
  });
export type RecipePickerFormValues = z.infer<typeof recipePickerFormSchema>;

export function firstRecipePickerError(
  errors: Record<string, { message?: string } | undefined>,
): RecipePickerErrorCode | null {
  const codes = new Set<string>();
  for (const key of ['hasRecipe', 'servings']) {
    const m = errors[key]?.message;
    if (m) codes.add(m);
  }
  for (const code of RECIPE_PICKER_ERROR_ORDER) {
    if (codes.has(code)) return code;
  }
  return null;
}
