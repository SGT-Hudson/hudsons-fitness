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
// non-finite→null (matching the old `parseOptional`). The component renders
// the localized `t('errors.weightRequired')` off `errors.weight_kg`.

const requiredNumericString = (min: number, max: number) =>
  z
    .string()
    .transform((s) => Number(s))
    .pipe(z.number().min(min).max(max));

const optionalNumericString = (max: number) =>
  z
    .string()
    .transform((s) => {
      if (s.trim() === '') return null;
      const n = Number(s);
      return Number.isFinite(n) ? n : null; // non-finite → null (parseOptional parity)
    })
    .pipe(z.number().min(0).max(max).nullable());

export const measurementFormSchema = z.object({
  measured_on: z.string().min(1),
  weight_kg: requiredNumericString(20, 400),
  body_fat_pct: optionalNumericString(70),
  muscle_pct: optionalNumericString(100),
  water_pct: optionalNumericString(100),
  notes: z.string(),
});

export type MeasurementFormValues = z.input<typeof measurementFormSchema>;
export type ParsedMeasurementForm = z.output<typeof measurementFormSchema>;
