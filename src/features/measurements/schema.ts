import { z } from 'zod';

// Co-located zod schema for the measurement entry form (D-C2/D-C3, R-09).
// Parity with the prior hand-rolled `parseOptional` + `weight === null →
// t('errors.weightRequired')` logic plus the input min/max attributes:
//
//  - measured_on: required date string
//  - weight_kg: required, 20–400 (was the only hard-required field; empty →
//    weightRequired error)
//  - body_fat_pct: optional, 0–70
//  - muscle_pct / water_pct: optional, 0–100
//  - notes: optional, trimmed-to-null in the component submit mapping
//
// All fields are STRING-input (the DOM value). The helpers below keep
// `z.input === string` so the RHF field type is string (register() needs no
// valueAsNumber), while `z.output` is the numeric / null shape onSubmit ships.
// Behavior parity: weight required & bounded; optional fields blank→null,
// non-finite→null (matching the old `parseOptional`).
//
// Per the R-09 convention (see templates/schema.ts), the issue `message`
// carries a STABLE CODE the component maps to a localized string — NOT
// English copy. A blank required field still emits the `*Required` code (so
// the existing required copy is preserved); a non-empty value outside the
// declared bound emits the distinct `range` code so the form can surface a
// range-specific message instead of the misleading "required" one. The
// rejection itself is unchanged — only which message text is shown.

const requiredNumericString = (min: number, max: number, requiredCode: string) =>
  z.string().superRefine((s, ctx) => {
    if (s.trim() === '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: requiredCode });
      return;
    }
    const n = Number(s);
    if (!Number.isFinite(n) || n < min || n > max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'range' });
    }
  }).transform((s) => Number(s));

const optionalNumericString = (max: number) =>
  z
    .string()
    .transform((s) => {
      if (s.trim() === '') return null;
      const n = Number(s);
      return Number.isFinite(n) ? n : null; // non-finite → null (parseOptional parity)
    })
    .superRefine((n, ctx) => {
      // null passes (blank / non-finite → null, parseOptional parity); only a
      // finite, in-range out-of-bound number is rejected — same accept/reject
      // set as the prior `.pipe(z.number().min(0).max(max).nullable())`, just
      // with the distinct `range` code so the message isn't the required copy.
      if (n !== null && (n < 0 || n > max)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'range' });
      }
    });

export const measurementFormSchema = z.object({
  measured_on: z.string().min(1),
  weight_kg: requiredNumericString(20, 400, 'weightRequired'),
  body_fat_pct: optionalNumericString(70),
  muscle_pct: optionalNumericString(100),
  water_pct: optionalNumericString(100),
  notes: z.string(),
});

export type MeasurementFormValues = z.input<typeof measurementFormSchema>;
export type ParsedMeasurementForm = z.output<typeof measurementFormSchema>;
