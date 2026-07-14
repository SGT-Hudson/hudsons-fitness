import { z } from 'zod';
import { requiredNumericString } from '@/lib/zod';

// Co-located zod schema for the goal form on ObjetivosPage (D-C2/D-C3, R-09).
// Parity with the prior `register('target_body_fat_pct', { required, min: 3,
// max: 50 })`: a target body-fat % bounded 3–50. The component still renders
// the localized `t('goal.errors.targetBf')` message off
// `errors.target_body_fat_pct`; the schema only decides validity.
//
// The field is STRING-in: it renders as a `NumberField` (`type="text"
// inputMode="decimal"`) so a decimal COMMA survives to JS — which means
// `valueAsNumber` (it returns NaN on `"1,2"`) is gone and the schema parses the
// raw string via `parseDecimalInput`. ⚠️ `type="text"` also drops the native
// `min`/`max` gates, so the 3–50 bound below is now the ONLY thing enforcing
// them. The `step="0.1"` attribute is deliberately not ported: it was a spinner
// increment, and as a validation rule it would reject a legitimate 12.25 %.
export const goalFormSchema = z.object({
  target_body_fat_pct: requiredNumericString(3, 50, 'targetBf'),
  notes: z.string(),
});

export type GoalFormValues = z.input<typeof goalFormSchema>;
export type ParsedGoalForm = z.output<typeof goalFormSchema>;
