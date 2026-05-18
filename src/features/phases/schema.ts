import { z } from 'zod';

// Co-located zod schema for the phase form (D-C2/D-C3, R-09). The form type is
// `z.infer<typeof phaseFormSchema>` — no hand-written `type FormValues`.
//
// Behavior parity is exact with the prior `register(...)`/`validate(...)`
// rules in PhaseDialog:
//  - name required (was `register('name', { required: true })`)
//  - start_date required
//  - end_date optional; when present must be > start_date (cross-field rule,
//    was the `validate` callback comparing `getValues('start_date')`)
//  - kcal_value: when kcal_mode === 'absolute' must be > 0; in 'tdee_delta'
//    any number is allowed (was the `validate` callback gating on kcal_mode)
//  - protein_g_per_kg: min 0.1 (was `min: { value: 0.1 }`)
//  - fat_pct_input (UI percent): 10–60 (was `min`/`max` 10/60)
//  - fiber_value: min 0.1
//
// Error messages are NOT baked into the schema: PhaseDialog renders localized
// i18n strings (`t('phases.form.errors.*')`) keyed off `errors.<field>` exactly
// as before. The schema only decides validity; the component owns the copy.
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
    kcal_value: z.number(),
    protein_g_per_kg: z.number().min(0.1),
    // Percent in the UI (10–60); converted to a DB fraction at the form
    // boundary via the R-06 pctToFraction helper (unchanged).
    fat_pct_input: z.number().min(10).max(60),
    fiber_mode: z.enum(['fixed_g', 'per_1000_kcal']),
    fiber_value: z.number().min(0.1),
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

export type PhaseFormValues = z.infer<typeof phaseFormSchema>;
