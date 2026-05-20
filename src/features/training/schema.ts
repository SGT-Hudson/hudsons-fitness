import { z } from 'zod';

/**
 * Zod schemas for the SessionEditor form. The DB column constraints
 * (workout_sets CHECK rpe in 6.0–10.0 in 0.5 steps; reps >= 0;
 * weight_kg >= 0) are re-asserted here so the form rejects bad input
 * BEFORE submitting, preserving the "fast, specific" form errors
 * convention (R-09).
 */

export const setSchema = z.object({
  set_index: z.number().int().min(1),
  reps: z.number().int().min(0).max(200),
  weight_kg: z.number().min(0).max(1000),
  rpe: z
    .number()
    .min(6)
    .max(10)
    .refine((v) => v * 2 === Math.floor(v * 2), { message: 'RPE must be in 0.5 steps' })
    .nullable()
    .optional(),
  is_warmup: z.boolean().default(false),
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

export type SetFormValues = z.infer<typeof setSchema>;
export type ExerciseBlockFormValues = z.infer<typeof exerciseBlockSchema>;
export type SessionFormValues = z.infer<typeof sessionSchema>;
