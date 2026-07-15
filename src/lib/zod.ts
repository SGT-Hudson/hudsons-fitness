import { z } from 'zod';
import { parseDecimalInput } from './number';

// Shared zod helpers for the R-09 string-input form schemas (D-C2).
//
// Two duplicated helper families lived inline in feature schemas before this
// module; they are consolidated here with NO behavior change. The emitted
// issue `message` is a STABLE CODE (not English copy) the component maps to a
// localized string — keep these codes byte-identical so the component → i18n
// mapping is unaffected.

// ---------------------------------------------------------------------------
// Numeric string inputs (pattern A — see docs/conventions.md Forms section)
// ---------------------------------------------------------------------------
//
// The DOM `<input>` value is a string. `z.input` stays `string` (so the RHF
// field type is string and `register()` needs no `valueAsNumber`); `z.output`
// is the numeric / null shape the submit handler ships.
//
// Both helpers parse via `parseDecimalInput` (invariant 6's shared boundary),
// so a decimal COMMA is accepted: `"82,4"` → 82.4. That only reaches them
// because the fields render as `NumberField` (`type="text" inputMode="decimal"`)
// — a `type="number"` element strips the comma before JS sees it. What is
// accepted changed; what BLANK means did not.
//
// These fields lost their native `min`/`max`/`step` gates with `type="number"`,
// so the bounds below are now the only thing enforcing them.

/**
 * Required string `<input>` value → bounded number.
 *
 * Blank (after trim) emits `requiredCode`; a non-blank value that is
 * unparseable or outside `[min, max]` emits the distinct `range` code so the
 * form can surface a range-specific message instead of the required one.
 */
export const requiredNumericString = (
  min: number,
  max: number,
  requiredCode: string,
) =>
  z.string().superRefine((s, ctx) => {
    if (s.trim() === '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: requiredCode });
      return;
    }
    const n = parseDecimalInput(s);
    if (n === null || n < min || n > max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'range' });
    }
  }).transform((s) =>
    // Non-null: the refinement above rejected every unparseable string, and a
    // failed refinement short-circuits the transform.
    parseDecimalInput(s) as number,
  );

/**
 * Optional string `<input>` value → bounded number | null.
 *
 * Blank or unparseable → null (passes — parity with the prior `parseOptional`).
 * Only a finite value outside `[min, max]` is rejected, with the distinct
 * `range` code so the message isn't the required copy.
 */
export const optionalNumericString = (min: number, max: number) =>
  z
    .string()
    // blank → null, unparseable → null (parseOptional parity, unchanged)
    .transform((s) => parseDecimalInput(s))
    .superRefine((n, ctx) => {
      if (n !== null && (n < min || n > max)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'range' });
      }
    });

// ---------------------------------------------------------------------------
// First-error precedence (multi-rule superRefine schemas)
// ---------------------------------------------------------------------------

/**
 * Shape `pickFirstError` reads off an RHF `errors` object. A scanned key may
 * be a FIELD ARRAY (`useFieldArray`): react-hook-form parks an error aimed at
 * the array itself under `errors.<key>.root`, because `errors.<key>` is the
 * per-index array — so `root` is part of what's actually read, not incidental.
 * Callers that narrow their cast to `{ message?: string }` (dropping `root`)
 * still compile, because `root` is optional here, but that silently breaks
 * field-array error messages with no type error to catch it. Use this type
 * for every `errors as …` cast feeding `pickFirstError` (directly or via a
 * `firstXError` wrapper) so the cast can never drop what the helper reads.
 */
export type FieldErrors = Record<
  string,
  { message?: string; root?: { message?: string } } | undefined
>;

/**
 * Pick the single message code to show, preserving the original check
 * precedence. `errors` is the RHF errors object; `orderedKeys` is the list of
 * field keys to scan; `order` is the canonical code precedence. Returns the
 * first code (in `order`) that any scanned field carries, else null. The
 * component maps the returned code to `t('errors.<code>')`.
 */
export function pickFirstError<Code extends string>(
  errors: FieldErrors,
  orderedKeys: readonly string[],
  order: readonly Code[],
): Code | null {
  const codes = new Set<string>();
  for (const key of orderedKeys) {
    const entry = errors[key];
    const m = entry?.message ?? entry?.root?.message;
    if (m) codes.add(m);
  }
  for (const code of order) {
    if (codes.has(code)) return code;
  }
  return null;
}
