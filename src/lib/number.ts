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

// The emit-locale counterpart to the parser above. Together they are the
// numeric locale boundary (invariant 6): accept both separators on the way IN,
// emit the ACTIVE language's separator on the way OUT. Spanish wants a comma
// (`82,4 kg`), English a point (`82.4 kg`).
//
// This is the ONLY place `lang → BCP-47 locale` is mapped. It is a pure
// function taking `lang` explicitly (not a hook, not the i18n singleton):
// several call sites are recharts formatter callbacks and module-level helpers
// where hooks are unavailable — callers pass `i18n.language`.

interface FormatDecimalOptions {
  /** The active i18n language. Anything that is not English maps to es-ES. */
  lang: string;
  /** Fixed fraction digits — preserved exactly (mirrors `toFixed`). Default 1. */
  digits?: number;
  /** `+82,4` / `-1,3` / `0,0`; a value that rounds to `-0` shows no sign. */
  signed?: boolean;
}

function localeFor(lang: string): 'en-US' | 'es-ES' {
  // Nullish-safe: a component may format before i18n has a language (or in a
  // test with a bare `useTranslation` mock). Default to the app's base locale.
  return lang?.startsWith('en') ? 'en-US' : 'es-ES';
}

/**
 * Format a number for display in the active locale.
 *
 * Fixed fraction digits are preserved (`82` → `82,0` at digits 1), so no
 * displayed precision changes when a `toFixed()` call site is migrated here.
 * Thousands grouping follows CLDR: Spanish does not group 4-digit numbers,
 * English does — this matches the existing `toLocaleString('es-ES')` output.
 */
export function formatDecimal(n: number, opts: FormatDecimalOptions): string {
  const { lang, digits = 1, signed = false } = opts;
  return new Intl.NumberFormat(localeFor(lang), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: signed ? 'exceptZero' : 'auto',
  }).format(n);
}

/**
 * Format a "natural" quantity — servings, grams, unidades — where the value may
 * be whole OR fractional and trailing zeros are NOT wanted: `1` stays `1`, `1.5`
 * is `1,5`, `0.25` is `0,25`. This is the up-to-N-digits counterpart to
 * `formatDecimal`'s fixed digits; use it for a step control's readout, never for
 * a measurement column that must align on a fixed decimal place.
 */
export function formatQuantity(
  n: number,
  opts: { lang: string; maxDigits?: number },
): string {
  return new Intl.NumberFormat(localeFor(opts.lang), {
    maximumFractionDigits: opts.maxDigits ?? 3,
  }).format(n);
}
