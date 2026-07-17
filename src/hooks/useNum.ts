import { useTranslation } from 'react-i18next';
import { formatDecimal, formatQuantity } from '@/lib/number';

/**
 * Bind the shared number formatters to the active i18n language, for raw JSX
 * number rendering (`{num.dec(roundMacro(x))}`). This is the JSX-side partner to
 * i18next's `{{x, number}}` interpolation: use `{{x, number}}` for numbers that
 * live inside a translated string, and this hook for numbers rendered directly.
 *
 * - `dec(n, digits=1)` — fixed fraction digits (weights, macros, percentages).
 * - `int(n)` — no decimals, locale grouping (kcal, counts).
 * - `qty(n, maxDigits=3)` — natural quantity, trailing zeros trimmed (servings,
 *   grams). Pass `maxDigits: 1` for the compact ingredient-table figures that
 *   used to round via `formatMacro`.
 */
export function useNum() {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  return {
    dec: (n: number, digits = 1) => formatDecimal(n, { lang, digits }),
    int: (n: number) => formatDecimal(n, { lang, digits: 0 }),
    qty: (n: number, maxDigits?: number) => formatQuantity(n, { lang, maxDigits }),
  };
}
