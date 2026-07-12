import { z } from 'zod';

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

/**
 * Required string `<input>` value → bounded number.
 *
 * Blank (after trim) emits `requiredCode`; a non-blank value that is
 * non-finite or outside `[min, max]` emits the distinct `range` code so the
 * form can surface a range-specific message instead of the required one. The
 * accept/reject set is unchanged from the prior inline helpers; only which
 * message text is shown differs (blank → required copy, bad value → range).
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
    const n = Number(s);
    if (!Number.isFinite(n) || n < min || n > max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'range' });
    }
  }).transform((s) => Number(s));

/**
 * Optional string `<input>` value → bounded number | null.
 *
 * Blank or non-finite → null (passes — parity with the prior `parseOptional`).
 * Only a finite value outside `[min, max]` is rejected, with the distinct
 * `range` code so the message isn't the required copy.
 */
export const optionalNumericString = (min: number, max: number) =>
  z
    .string()
    .transform((s) => {
      if (s.trim() === '') return null;
      const n = Number(s);
      return Number.isFinite(n) ? n : null; // non-finite → null (parseOptional parity)
    })
    .superRefine((n, ctx) => {
      if (n !== null && (n < min || n > max)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'range' });
      }
    });

// ---------------------------------------------------------------------------
// First-error precedence (multi-rule superRefine schemas)
// ---------------------------------------------------------------------------

/**
 * Pick the single message code to show, preserving the original check
 * precedence. `errors` is the RHF errors object; `orderedKeys` is the list of
 * field keys to scan; `order` is the canonical code precedence. Returns the
 * first code (in `order`) that any scanned field carries, else null. The
 * component maps the returned code to `t('errors.<code>')`.
 *
 * A scanned key may be a FIELD ARRAY (`useFieldArray`): react-hook-form parks
 * an error aimed at the array itself under `errors.<key>.root`, because
 * `errors.<key>` is the per-index array. Scanning only `.message` there finds
 * nothing and the form falls silent — a submit that visibly does nothing. So
 * both shapes are read.
 */
export function pickFirstError<Code extends string>(
  errors: Record<string, { message?: string; root?: { message?: string } } | undefined>,
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
