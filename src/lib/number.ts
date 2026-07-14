// The shared numeric form boundary (hard invariant 6).
//
// WHY THIS EXISTS: `<input type="number">` accepts only `.` as the decimal
// separator, whatever the locale. The browser strips a typed comma BEFORE
// React or react-hook-form ever see the value — the element hands back `"12"`
// for `1,2`. A Spanish keyboard puts `,` on the numeric keypad, so that is
// what a user types by default, and it silently corrupted stored numbers
// (including body weight). No schema-level fix can reach it: the DOM element
// itself must be `type="text" inputMode="decimal"` (see `NumberField`), and
// then THIS parser turns the raw string into a number.

/**
 * Parse a raw `<input>` string into a number.
 *
 * Accept-both, emit-point: `,` and `.` are both read as the decimal
 * separator, unconditionally. This is **deliberately not locale-aware** — a
 * locale-dependent parser is a footgun, because a user switching ES→EN would
 * change how their own stored data parses.
 *
 * - Trimmed; blank → `null`. Blank is NOT a decision this function makes:
 *   the caller's schema decides whether blank is legal (required → error,
 *   optional → null, some feature parsers → 0).
 * - At most ONE separator, of either kind. `"1,2,3"`, `"1.2,3"`, `"1,234.5"`
 *   → `null`. Ambiguity is rejected, never guessed: we do not try to infer a
 *   thousands separator. A lone separator is always the decimal one, so
 *   `"1,234"` is 1.234.
 * - Anything that is not a finite number → `null`.
 */
export function parseDecimalInput(s: string): number | null {
  const trimmed = s.trim();
  if (trimmed === '') return null;

  const separators = trimmed.match(/[.,]/g);
  if (separators && separators.length > 1) return null;

  const n = Number(trimmed.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
