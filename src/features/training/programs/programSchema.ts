import { z } from 'zod';

export const programDaySchema = z
  .object({
    day_index: z.number().int().min(0),
    is_rest: z.boolean(),
    routine_id: z.string().uuid().nullable(),
  })
  .refine((d) => (d.is_rest ? d.routine_id === null : d.routine_id !== null), {
    message: 'A slot is either a rest day or has a routine',
    path: ['routine_id'],
  });

export const programSchema = z.object({
  name: z.string().min(1, 'Name required').max(100),
  days: z.array(programDaySchema).min(1, 'A program needs at least one day'),
});

export type ProgramFormValues = z.infer<typeof programSchema>;
