import { describe, expect, it } from 'vitest';
import { reconcile, FINE_CODES, type Verdict } from './reconcile-review';

const reviewIds = new Set(['A', 'B', 'C', 'D']);
const existingOverrides = new Set(['Z_already_corrected']);

const base: Verdict[] = [
  { external_id: 'A', tier: 'bulk', current_fine: ['biceps'], decision: 'confirm' },
  { external_id: 'B', tier: 'deep', current_fine: ['delt_side'], decision: 'correct', corrected_fine: ['delt_rear'] },
  { external_id: 'C', tier: 'deep', current_fine: ['quads'], decision: 'hold' },
  { external_id: 'D', tier: 'deep', current_fine: ['abs_upper'], decision: 'correct', corrected_fine: ['obliques'] },
];

describe('reconcile', () => {
  it('partitions confirm / correct / hold', () => {
    const r = reconcile(base, reviewIds, existingOverrides);
    expect(r.confirmed.map((v) => v.external_id)).toEqual(['A']);
    expect(r.corrections.map((v) => v.external_id).sort()).toEqual(['B', 'D']);
    expect(r.held.map((v) => v.external_id)).toEqual(['C']);
  });
  it('counts reconcile to the full review set', () => {
    const r = reconcile(base, reviewIds, existingOverrides);
    expect(r.confirmed.length + r.corrections.length + r.held.length).toBe(reviewIds.size);
  });
  it('verified list = confirmed UNION corrected ids', () => {
    const r = reconcile(base, reviewIds, existingOverrides);
    expect([...r.verifiedIds].sort()).toEqual(['A', 'B', 'D']);
  });
  it('throws when a verdict id is not in the review set', () => {
    const bad = [...base, { external_id: 'X', tier: 'bulk' as const, current_fine: ['lat'], decision: 'confirm' as const }];
    expect(() => reconcile(bad, reviewIds, existingOverrides)).toThrow(/not in the 469 review set/);
  });
  it('throws when a review id has no verdict', () => {
    expect(() => reconcile(base.slice(1), reviewIds, existingOverrides)).toThrow(/missing a verdict/);
  });
  it('throws on a duplicate verdict for the same id', () => {
    const dup = [...base, { external_id: 'A', tier: 'bulk' as const, current_fine: ['biceps'], decision: 'confirm' as const }];
    expect(() => reconcile(dup, reviewIds, existingOverrides)).toThrow(/duplicate verdict/);
  });
  it('throws on a correct decision with no corrected_fine', () => {
    const bad = base.map((v) => (v.external_id === 'B' ? { ...v, corrected_fine: undefined } : v));
    expect(() => reconcile(bad, reviewIds, existingOverrides)).toThrow(/must list corrected_fine/);
  });
  it('throws on an empty corrected_fine array', () => {
    const bad = base.map((v) => (v.external_id === 'B' ? { ...v, corrected_fine: [] } : v));
    expect(() => reconcile(bad, reviewIds, existingOverrides)).toThrow(/at least one/);
  });
  it('throws on an invalid fine code', () => {
    const bad = base.map((v) => (v.external_id === 'B' ? { ...v, corrected_fine: ['pec_mid'] } : v));
    expect(() => reconcile(bad, reviewIds, existingOverrides)).toThrow(/unknown fine code "pec_mid"/);
  });
  it('throws on a no-op correction (corrected_fine equals current_fine)', () => {
    const bad = base.map((v) => (v.external_id === 'B' ? { ...v, corrected_fine: ['delt_side'] } : v));
    expect(() => reconcile(bad, reviewIds, existingOverrides)).toThrow(/no-op correction/);
  });
  it('throws when a correction targets an id already in existing overrides (404 set)', () => {
    // Keep the review set complete so the missing-verdict guard does NOT fire first:
    // B is renamed to the already-overridden id AND that id is in reviewIds.
    const bad = base.map((v) => (v.external_id === 'B' ? { ...v, external_id: 'Z_already_corrected' } : v));
    const ids = new Set(['A', 'Z_already_corrected', 'C', 'D']);
    expect(() => reconcile(bad, ids, existingOverrides)).toThrow(/already in primary-overrides/);
  });
  it('FINE_CODES has the 25 valid codes', () => {
    expect(FINE_CODES.size).toBe(25);
    expect(FINE_CODES.has('obliques')).toBe(true);
    expect(FINE_CODES.has('full_body')).toBe(true);
    expect(FINE_CODES.has('tibialis')).toBe(true);
  });
});
