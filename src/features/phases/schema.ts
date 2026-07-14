import { z } from 'zod';
import { requiredNumericString } from '@/lib/zod';

// Co-located zod schema for the phase form (D-C2/D-C3, R-09). The form type is
// `z.input<typeof phaseFormSchema>` (what the DOM holds — strings for the
// numeric fields) and the submit handler receives `z.output` (parsed numbers).
//
// Behavior parity is exact with the prior `register(...)`/`validate(...)`
// rules in PhaseDialog:
//  - name required (was `register('name', { required: true })`)
//  - start_date required
//  - end_date optional; when present must be > start_date (cross-field rule,
//    was the `validate` callback comparing `getValues('start_date')`)
//  - kcal_value: when kcal_mode === 'absolute' must be > 0; in 'tdee_delta'
//    any number is allowed (was the `validate` callback gating on kcal_mode)
//  - protein_g_per_kg: 0.1–4
//  - fat_pct_input (UI percent): 10–60
//  - fiber_value: min 0.1
//
// The four numeric fields are STRING-in: they render as `NumberField`
// (`type="text" inputMode="decimal"`) so a decimal COMMA survives to JS, which
// means `valueAsNumber` (it returns NaN on `"1,2"`) is gone and the schema
// parses the raw string via `parseDecimalInput`. ⚠️ `type="text"` also drops
// the native `min`/`max` gates, so the bounds below are now the ONLY thing
// enforcing them — `protein_g_per_kg`'s max of 4 lived only in the DOM before.
// The `step` attributes are deliberately NOT ported: they were spinner
// increments, and as validation rules they would reject exactly the decimals
// this form must now accept (a 27.5 % fat, a 1.25 g/kg protein).
//
// Error messages are NOT baked into the schema: PhaseDialog renders localized
// i18n strings (`t('phases.form.errors.*')`) keyed off `errors.<field>` exactly
// as before. The schema only decides validity; the component owns the copy —
// so the issue codes below are never read, one per field is enough.
// `notesOnly` mode (R-02) still saves through the same submit path — every
// non-notes field keeps its real value (the dialog disables the inputs, it
// does not blank them), so the full schema still validates a notes-only save.
export const phaseFormSchema = z
  .object({
    name: z.string().min(1),
    phase_type: z.enum(['cut', 'maintenance', 'bulk']),
    start_date: z.string().min(1),
    end_date: z.string(),
    kcal_mode: z.enum(['absolute', 'tdee_delta']),
    // Unbounded on purpose (parity): in `tdee_delta` mode this is a signed
    // delta, and in `absolute` mode the `> 0` rule is the refine below.
    kcal_value: requiredNumericString(-Infinity, Infinity, 'kcalValue'),
    protein_g_per_kg: requiredNumericString(0.1, 4, 'protein'),
    // Percent in the UI (10–60); converted to a DB fraction at the form
    // boundary via the R-06 pctToFraction helper (unchanged — parseDecimalInput
    // runs BEFORE it, never instead of it).
    fat_pct_input: requiredNumericString(10, 60, 'fat'),
    fiber_mode: z.enum(['fixed_g', 'per_1000_kcal']),
    fiber_value: requiredNumericString(0.1, Infinity, 'fiberValue'),
    notes: z.string(),
  })
  .refine(
    (v) => !v.end_date || v.end_date > v.start_date,
    { path: ['end_date'] },
  )
  .refine(
    (v) => v.kcal_mode === 'tdee_delta' || v.kcal_value > 0,
    { path: ['kcal_value'] },
  );

export type PhaseFormValues = z.input<typeof phaseFormSchema>;
export type ParsedPhaseForm = z.output<typeof phaseFormSchema>;
