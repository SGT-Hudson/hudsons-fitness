import { z } from 'zod';
import { optionalNumericString, requiredNumericString } from '@/lib/zod';

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
//
// `requiredNumericString` / `optionalNumericString` are the shared helpers in
// `@/lib/zod` (R-09 pattern A). The optional helper's min was implicitly 0
// here; the shared helper takes it explicitly, so the call sites pass 0.

export const measurementFormSchema = z.object({
  measured_on: z.string().min(1),
  weight_kg: requiredNumericString(20, 400, 'weightRequired'),
  body_fat_pct: optionalNumericString(0, 70),
  muscle_pct: optionalNumericString(0, 100),
  water_pct: optionalNumericString(0, 100),
  notes: z.string(),
});

export type MeasurementFormValues = z.input<typeof measurementFormSchema>;
export type ParsedMeasurementForm = z.output<typeof measurementFormSchema>;
