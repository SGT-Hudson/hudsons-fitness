import { z } from 'zod';

export const routineExerciseSchema = z
  .object({
    exercise_id: z.string().uuid(),
    target_sets: z.number().int().min(1).max(20),
    target_reps_min: z.number().int().min(1).max(100),
    target_reps_max: z.number().int().min(1).max(100),
    rest_seconds: z.number().int().min(0).max(3600).nullable().optional(),
    target_rpe: z
      .number()
      .min(6)
      .max(10)
      .refine((v) => v * 2 === Math.floor(v * 2), 'RPE must be in 0.5 steps')
      .nullable()
      .optional(),
  })
  .refine((e) => e.target_reps_max >= e.target_reps_min, {
    message: 'Max reps must be ≥ min reps',
    path: ['target_reps_max'],
  });

export const routineSchema = z.object({
  name: z.string().min(1, 'Name required').max(100),
  notes: z.string().max(2000).nullable().optional(),
  exercises: z.array(routineExerciseSchema).min(1, 'A routine needs at least one exercise'),
});

export type RoutineFormValues = z.infer<typeof routineSchema>;
