import { z } from 'zod';
import { pickFirstError } from '@/lib/zod';

// Co-located zod schema for the template editor form (D-C2/D-C3, R-09).
// PlantillaEditorPage has no page feature folder; `templates` (api.ts/hooks.ts
// already here) is the natural home.
//
// Parity with the prior hand-rolled checks in handleSave:
//   1. name.trim() === ''        → editor.errors.nameRequired
//   2. mealTimes.length === 0    → editor.errors.timesRequired
//
// meal_times is part of the form state (driven by MealTimesEditor); slots are
// a separate sub-editor and were never validated, so they stay out of the
// schema (behavior preserved). The component renders ONE localized message,
// resolving precedence by the legacy code carried in the issue message.
export const TEMPLATE_ERROR_ORDER = ['nameRequired', 'timesRequired'] as const;
export type TemplateErrorCode = (typeof TEMPLATE_ERROR_ORDER)[number];

export const templateFormSchema = z
  .object({
    name: z.string(),
    meal_times: z.array(z.string()),
  })
  .superRefine((v, ctx) => {
    if (v.name.trim() === '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['name'], message: 'nameRequired' });
    }
    if (v.meal_times.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['meal_times'],
        message: 'timesRequired',
      });
    }
  });

export type TemplateFormValues = z.infer<typeof templateFormSchema>;

export function firstTemplateError(
  errors: Record<string, { message?: string } | undefined>,
): TemplateErrorCode | null {
  return pickFirstError(errors, ['name', 'meal_times'], TEMPLATE_ERROR_ORDER);
}
