import { z } from 'zod';
import { requiredNumericString } from '@/lib/zod';

/**
 * Zod schemas for the SessionEditor form. The DB column constraints
 * (workout_sets CHECK rpe in 6.0–10.0; reps >= 0; weight_kg >= 0) are
 * re-asserted here so the form rejects bad input BEFORE submitting,
 * preserving the "fast, specific" form errors convention (R-09).
 *
 * `weight_kg` is STRING-in: it renders as a `NumberField` (`type="text"
 * inputMode="decimal"`) so a decimal COMMA survives to JS — `82,4` is what a
 * Spanish keyboard types, and a `type="number"` element silently handed back
 * `"824"`. That means no `valueAsNumber` (it returns NaN on a real comma); the
 * schema parses the raw string via `parseDecimalInput`. ⚠️ `type="text"` also
 * drops the native `min`/`max` gates, so the 0–1000 bound below is now the only
 * thing enforcing them. The old `step={0.5}` is deliberately NOT ported as a
 * zod rule: it was a spinner increment, and as validation it would reject the
 * very decimals this change exists to accept (an 82.4 kg load, a 2.25 kg
 * microplate) — the DB has no such CHECK either.
 *
 * Everything else here stays `valueAsNumber` + `type="number"` with its
 * spinner: they are integers, and an integer cannot carry a decimal separator.
 */

export const setSchema = z.object({
  set_index: z.number().int().min(1),
  reps: z.number().int().min(0).max(200),
  weight_kg: requiredNumericString(0, 1000, 'weightRequired'),
  // RPE is an INTEGER everywhere (it used to allow 0.5 steps here while the
  // routine builder's target_rpe was already `.int()`). Whole numbers satisfy
  // the DB's 0.5-step CHECK, so no migration is needed; the rule is app-level.
  rpe: z.number().int().min(6).max(10).nullable().optional(),
  // No .default(false) — the form always provides an explicit boolean,
  // and adding a default makes z.input vs z.output diverge (RHF's
  // resolver typing then complains the form values don't match).
  is_warmup: z.boolean(),
});

export const exerciseBlockSchema = z.object({
  exercise_id: z.string().uuid(),
  sets: z.array(setSchema).min(1, { message: 'At least one set per exercise' }),
});

export const sessionSchema = z.object({
  performed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'YYYY-MM-DD required',
  }),
  title: z.string().max(100).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  blocks: z
    .array(exerciseBlockSchema)
    .min(1, { message: 'A session needs at least one exercise' }),
});

// `z.input` is what the DOM/RHF hold (weight_kg is the raw string); `z.output`
// is what the submit handler receives (parsed numbers).
export type SetFormValues = z.input<typeof setSchema>;
export type ExerciseBlockFormValues = z.input<typeof exerciseBlockSchema>;
export type SessionFormValues = z.input<typeof sessionSchema>;
export type ParsedSessionForm = z.output<typeof sessionSchema>;
