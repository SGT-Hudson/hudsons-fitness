// Tier-1 unit test for the shared numeric form boundary (invariant 6).
//
// The bug this pins: `<input type="number">` silently strips a decimal comma
// before JS ever sees the value (`1,2` → `12`). The fix is `type="text"
// inputMode="decimal"` at the DOM plus THIS parser at the schema boundary.
// Accept-both (`,` and `.`), emit-point, reject ambiguity.
import { describe, it, expect } from 'vitest';
import { parseDecimalInput, formatDecimal, formatQuantity } from './number';

describe('parseDecimalInput', () => {
  it('accepts the decimal comma (the whole point)', () => {
    expect(parseDecimalInput('1,2')).toBe(1.2);
    expect(parseDecimalInput('82,4')).toBe(82.4);
    expect(parseDecimalInput('0,5')).toBe(0.5);
  });

  it('accepts the decimal point', () => {
    expect(parseDecimalInput('1.2')).toBe(1.2);
    expect(parseDecimalInput('82.4')).toBe(82.4);
  });

  it('is not locale-aware: both separators parse the same, always', () => {
    expect(parseDecimalInput('1,2')).toBe(parseDecimalInput('1.2'));
  });

  it('parses plain integers', () => {
    expect(parseDecimalInput('0')).toBe(0);
    expect(parseDecimalInput('82')).toBe(82);
  });

  it('rejects ambiguity instead of guessing a thousands separator', () => {
    expect(parseDecimalInput('1,2,3')).toBeNull();
    expect(parseDecimalInput('1.2,3')).toBeNull();
    expect(parseDecimalInput('1,2.3')).toBeNull();
    expect(parseDecimalInput('1,234.5')).toBeNull();
    expect(parseDecimalInput('1.234,5')).toBeNull();
    expect(parseDecimalInput('1.2.3')).toBeNull();
  });

  it('treats a single separator as the decimal one, even when it looks like thousands', () => {
    // Deliberate: `1,234` is a decimal 1.234, not 1234. A single separator is
    // never a thousands separator — that is the accept-both contract.
    expect(parseDecimalInput('1,234')).toBe(1.234);
  });

  it('blank → null (the caller schema decides whether blank is legal)', () => {
    expect(parseDecimalInput('')).toBeNull();
    expect(parseDecimalInput('   ')).toBeNull();
    expect(parseDecimalInput('\t\n')).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(parseDecimalInput('  1,2  ')).toBe(1.2);
    expect(parseDecimalInput('\t82.4\n')).toBe(82.4);
  });

  it('parses negatives', () => {
    expect(parseDecimalInput('-1,5')).toBe(-1.5);
    expect(parseDecimalInput('-1.5')).toBe(-1.5);
    expect(parseDecimalInput('  -0,25 ')).toBe(-0.25);
  });

  it('parses exponents', () => {
    expect(parseDecimalInput('1e3')).toBe(1000);
    expect(parseDecimalInput('1,5e2')).toBe(150);
    expect(parseDecimalInput('2.5e-2')).toBe(0.025);
  });

  it('rejects garbage', () => {
    expect(parseDecimalInput('abc')).toBeNull();
    expect(parseDecimalInput('12kg')).toBeNull();
    expect(parseDecimalInput('1 2')).toBeNull();
    expect(parseDecimalInput('-')).toBeNull();
    expect(parseDecimalInput(',')).toBeNull();
    expect(parseDecimalInput('.')).toBeNull();
  });

  it('rejects non-finite values', () => {
    expect(parseDecimalInput('Infinity')).toBeNull();
    expect(parseDecimalInput('-Infinity')).toBeNull();
    expect(parseDecimalInput('NaN')).toBeNull();
  });
});

// The emit-locale counterpart to the parser: turns a number into a display
// string. Spanish wants a comma (`82,4 kg`), English a point. This is the
// output-side mirror of the accept-both parser above; the two together are the
// numeric locale boundary (invariant 6).
describe('formatDecimal', () => {
  it('emits the locale decimal separator', () => {
    expect(formatDecimal(82.4, { lang: 'es' })).toBe('82,4');
    expect(formatDecimal(82.4, { lang: 'en' })).toBe('82.4');
  });

  it('preserves fixed fraction digits (no precision change vs toFixed)', () => {
    expect(formatDecimal(82, { lang: 'es' })).toBe('82,0'); // default digits 1
    expect(formatDecimal(82, { lang: 'es', digits: 2 })).toBe('82,00');
    expect(formatDecimal(82, { lang: 'es', digits: 0 })).toBe('82');
    expect(formatDecimal(82.456, { lang: 'en', digits: 2 })).toBe('82.46');
  });

  it('groups thousands per CLDR (es does not group 4 digits; en does)', () => {
    // Deliberate: Spanish omits the grouping separator for 4-digit numbers
    // (`1234`), and only groups from 5 digits (`12.345`). This matches what the
    // app already renders via toLocaleString('es-ES'); the formatter preserves
    // it rather than forcing a separator the locale does not want.
    expect(formatDecimal(1234, { lang: 'es', digits: 0 })).toBe('1234');
    expect(formatDecimal(12345, { lang: 'es', digits: 0 })).toBe('12.345');
    expect(formatDecimal(1234, { lang: 'en', digits: 0 })).toBe('1,234');
  });

  it('signed: + on positive, - on negative, no sign on zero', () => {
    expect(formatDecimal(82.4, { lang: 'es', signed: true })).toBe('+82,4');
    expect(formatDecimal(-1.3, { lang: 'es', signed: true })).toBe('-1,3');
    expect(formatDecimal(0, { lang: 'es', signed: true })).toBe('0,0');
  });

  it('signed absorbs the -0.0 rounding artefact as 0,0', () => {
    // -0.04 rounds to -0.0, which is zero → exceptZero emits no sign.
    expect(formatDecimal(-0.04, { lang: 'es', signed: true })).toBe('0,0');
  });

  it('unsigned negatives keep their minus', () => {
    expect(formatDecimal(-1.3, { lang: 'es' })).toBe('-1,3');
  });

  it('an unknown language falls back to es-ES', () => {
    expect(formatDecimal(82.4, { lang: 'de' })).toBe('82,4');
    expect(formatDecimal(82.4, { lang: 'es-ES' })).toBe('82,4');
  });
});

// The natural-quantity formatter: locale separator, but variable decimals with
// trailing zeros trimmed (a step control's readout, not a fixed column).
describe('formatQuantity', () => {
  it('keeps whole numbers whole and shows fractions when present', () => {
    expect(formatQuantity(100, { lang: 'es' })).toBe('100');
    expect(formatQuantity(1.5, { lang: 'es' })).toBe('1,5');
    expect(formatQuantity(0.25, { lang: 'es' })).toBe('0,25');
    expect(formatQuantity(1.5, { lang: 'en' })).toBe('1.5');
  });

  it('trims trailing zeros (unlike fixed-digit formatDecimal)', () => {
    expect(formatQuantity(2.5, { lang: 'es' })).toBe('2,5');
    expect(formatQuantity(3, { lang: 'es' })).toBe('3');
  });

  it('groups thousands per locale', () => {
    expect(formatQuantity(12345, { lang: 'es' })).toBe('12.345');
    expect(formatQuantity(12345, { lang: 'en' })).toBe('12,345');
  });
});
