import { z } from 'zod';

// Co-located zod schema for the goal form on ObjetivosPage (D-C2/D-C3, R-09).
// Parity with the prior `register('target_body_fat_pct', { required, min: 3,
// max: 50 })`: a numeric target body-fat % bounded 3–50. The component still
// renders the localized `t('goal.errors.targetBf')` message off
// `errors.target_body_fat_pct`; the schema only decides validity.
export const goalFormSchema = z.object({
  target_body_fat_pct: z.number().min(3).max(50),
  notes: z.string(),
});

export type GoalFormValues = z.infer<typeof goalFormSchema>;
