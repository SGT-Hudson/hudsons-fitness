// Tier-1 unit test for the shared numeric form boundary (invariant 6).
//
// The bug this pins: `<input type="number">` silently strips a decimal comma
// before JS ever sees the value (`1,2` → `12`). The fix is `type="text"
// inputMode="decimal"` at the DOM plus THIS parser at the schema boundary.
// Accept-both (`,` and `.`), emit-point, reject ambiguity.
import { describe, it, expect } from 'vitest';
import { parseDecimalInput } from './number';

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
