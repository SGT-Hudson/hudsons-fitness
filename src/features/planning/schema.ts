import { z } from 'zod';

// Co-located zod schemas for the planning dialogs (D-C2/D-C3, R-09).
// All error copy stays in the components (localized `t(...)`); the schemas
// only decide validity.

// ApplyTemplateDialog validates a single "a template is picked" boolean and so
// carries no schema — it is a radio list, not a form of fields.

// SaveAsTemplateDialog: name required (trimmed non-empty). Parity with the
// prior `if (trimmed === '') → t('save.errors.nameRequired')`.
export const saveAsTemplateFormSchema = z.object({
  name: z.string().trim().min(1),
});
export type SaveAsTemplateFormValues = z.infer<typeof saveAsTemplateFormSchema>;
