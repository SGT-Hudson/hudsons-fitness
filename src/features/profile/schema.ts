import { z } from 'zod';
import { requiredNumericString } from '@/lib/zod';

// Co-located zod schemas for the profile-backed forms (D-C2/D-C3, R-09).
// OnboardingPage and the SettingsPage cards have no page feature folder; the
// `profile` feature (api.ts/hooks.ts already here) is their natural home.
//
// Parity with the prior hand-rolled validation:
//
// Onboarding (`!sex || !birthDate || !heightCm || !initialWeightKg || !boneKg`
// → `t('errors.required')`, plus input min/max attributes):
//  - sex required (one of male/female/other)
//  - birth_date required
//  - height_cm 100–250
//  - initial_weight_kg 20–400
//  - bone_kg 0.5–20  (kept as-is — R-03 removes bone_kg later, NOT in R-09;
//    R-09 is a behavior-preserving refactor)
//
// Settings biometrics (`!sex || !birthDate || !heightCm || !boneKg` →
// `t('errors.required')`): same fields minus initial_weight_kg (read-only).
//
// Settings profile card: display_name optional, trimmed to null when blank
// (preserved in the component's submit mapping, not the schema).
//
// All error copy stays in the component (localized `t(...)`); the schema only
// decides validity. Numeric fields are STRING-input → bounded-number via a
// shared `numericString` helper: its `z.input` is genuinely `string` (so the
// RHF field type is string and register() needs no `valueAsNumber`), and its
// `z.output` is the bounded number the mutation receives.

// The Select carries '' while unchosen; input allows '' but validation
// rejects it (parity with the old `!sex → required` guard). Output narrows
// to the real enum.
const sexInput = z
  .enum(['male', 'female', 'other', ''])
  .pipe(z.enum(['male', 'female', 'other']));

// Per the R-09 convention (see templates/schema.ts) the issue `message`
// carries a STABLE CODE the page maps to a localized string — NOT English
// copy. A blank required field still emits the `required` code (so the
// existing combined "fill in all fields" copy is preserved); a non-empty
// value outside the declared bound emits the distinct `range` code so the
// form can surface a range-specific message. The rejection set is unchanged
// (blank/non-finite still fails) — only which message is shown.
//
// This is the shared `requiredNumericString` helper from `@/lib/zod` (R-09
// pattern A) bound to the `required` code these profile forms use.
/** string `<input>` value → bounded number; blank/non-finite fails the bound. */
const numericString = (min: number, max: number) =>
  requiredNumericString(min, max, 'required');

export const onboardingFormSchema = z.object({
  sex: sexInput,
  birth_date: z.string().min(1),
  height_cm: numericString(100, 250),
  initial_weight_kg: numericString(20, 400),
  bone_kg: numericString(0.5, 20),
});

// z.input is string-typed (the numericString helper), so this matches the RHF
// field shape exactly; z.output is the numeric mutation shape.
export type OnboardingFormValues = z.input<typeof onboardingFormSchema>;
export type ParsedOnboardingForm = z.output<typeof onboardingFormSchema>;

export const biometricsFormSchema = z.object({
  sex: sexInput,
  birth_date: z.string().min(1),
  height_cm: numericString(100, 250),
  bone_kg: numericString(0.5, 20),
});

export type BiometricsFormValues = z.input<typeof biometricsFormSchema>;
export type ParsedBiometricsForm = z.output<typeof biometricsFormSchema>;

export const displayNameFormSchema = z.object({
  display_name: z.string(),
});

export type DisplayNameFormValues = z.infer<typeof displayNameFormSchema>;
