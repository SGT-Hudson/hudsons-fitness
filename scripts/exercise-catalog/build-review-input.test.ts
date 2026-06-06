import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseFlaggedIds,
  buildReviewRows,
  COARSE_DEEP,
  CAT_DEEP,
  type ReviewRow,
} from './build-review-input';
import type { RawExercise } from './build-seed';

const dir = resolve(import.meta.dirname);
const raws = JSON.parse(
  readFileSync(resolve(dir, 'exercises.json'), 'utf8'),
) as RawExercise[];
const esNames = JSON.parse(
  readFileSync(resolve(dir, 'es-names.json'), 'utf8'),
) as Record<string, string>;
const csv = readFileSync(resolve(dir, 'ingest-report.csv'), 'utf8');

describe('parseFlaggedIds', () => {
  it('extracts exactly 404 flagged external_ids from the real CSV', () => {
    expect(parseFlaggedIds(csv).size).toBe(404);
  });
  it("real CSV's first data column (external_id) never contains a comma or quote", () => {
    // The actually-true dataset invariant: all ids are underscore-cased slugs.
    for (const id of parseFlaggedIds(csv)) {
      expect(id.includes(',')).toBe(false);
      expect(id.includes('"')).toBe(false);
    }
  });
  it('the col-1 regex is anchored before any later-column comma can shift parsing', () => {
    // Defensive: a comma inside a quoted name_en must not bleed into the id.
    const sample =
      'external_id,name_en,name_es,primary_fine,secondary_count,flags,override\n' +
      '"Rowing_Stationary","Rowing, Stationary","Remo",lat,3,"big_compound","lat"\n';
    const ids = parseFlaggedIds(sample);
    expect(ids.has('Rowing_Stationary')).toBe(true);
    expect(ids.size).toBe(1);
  });
  it('defensively un-doubles CSV-escaped internal quotes in an id', () => {
    const sample =
      'external_id,name_en,name_es,primary_fine,secondary_count,flags,override\n' +
      '"Weird""Id","X","Y",lat,0,"f","o"\n';
    const ids = parseFlaggedIds(sample);
    expect(ids.has('Weird"Id')).toBe(true);
  });
});

describe('buildReviewRows', () => {
  const rows = buildReviewRows(raws, esNames, parseFlaggedIds(csv));

  it('produces exactly 469 reviewable rows', () => {
    expect(rows).toHaveLength(469);
  });
  it('excludes every flagged id', () => {
    const flagged = parseFlaggedIds(csv);
    expect(rows.some((r) => flagged.has(r.external_id))).toBe(false);
  });
  it('partitions deep=144 / bulk=325', () => {
    expect(rows.filter((r) => r.tier === 'deep')).toHaveLength(144);
    expect(rows.filter((r) => r.tier === 'bulk')).toHaveLength(325);
  });
  it('deep = coarse-set UNION category-set with 4-row overlap', () => {
    const coarse = rows.filter((r) => COARSE_DEEP.has(r.coarse_primary));
    const cat = rows.filter((r) => CAT_DEEP.has(r.category));
    expect(coarse).toHaveLength(115);
    expect(cat).toHaveLength(33);
    const overlap = rows.filter(
      (r) => COARSE_DEEP.has(r.coarse_primary) && CAT_DEEP.has(r.category),
    );
    expect(overlap).toHaveLength(4);
  });
  it('every row carries the required fields populated', () => {
    for (const r of rows) {
      expect(r.external_id).toBeTruthy();
      expect(r.name_en).toBeTruthy();
      expect(r.name_es).toBeTruthy(); // EN fallback guarantees non-empty
      expect(r.coarse_primary).toBeTruthy();
      expect(r.category).toBeTruthy();
      expect(r.tier === 'deep' || r.tier === 'bulk').toBe(true);
      expect(Array.isArray(r.instructions)).toBe(true);
    }
  });
  it('a known shoulders row lands in the deep tier with a coarse reason', () => {
    const r = rows.find((x) => x.coarse_primary === 'shoulders');
    expect(r).toBeDefined();
    expect(r!.tier).toBe('deep');
    expect(r!.deep_reason).toContain('coarse:shoulders');
  });
  it('a known olympic-weightlifting row lands deep with a category reason', () => {
    const r = rows.find((x) => x.category === 'olympic weightlifting');
    expect(r).toBeDefined();
    expect(r!.tier).toBe('deep');
    expect(r!.deep_reason).toContain('category:olympic weightlifting');
  });
  it('a 1:1 biceps row lands in the bulk tier', () => {
    const r = rows.find(
      (x) => x.coarse_primary === 'biceps' && !CAT_DEEP.has(x.category),
    );
    expect(r).toBeDefined();
    expect(r!.tier).toBe('bulk');
    expect(r!.deep_reason).toBe('');
  });
  it('surfaces the mapper fine primary for reviewer context (pinned row)', () => {
    const curl = rows.find((x) => x.external_id === 'Alternate_Hammer_Curl');
    expect(curl).toBeDefined();
    expect(curl!.mapped_fine_primary).toEqual(['biceps']);
  });
});
