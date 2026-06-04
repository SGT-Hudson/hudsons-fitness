import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MUSCLES,
  MUSCLE_CODES,
  MUSCLE_GROUPS,
  bodyRegionSlugForCode,
  codesForBodyRegion,
} from './muscles';

const EXPECTED_FINE = [
  'delt_front','delt_side','delt_rear','pec_upper','pec_lower','lat','trap',
  'rhomboids','lower_back','biceps','tri_long','tri_lateral','forearms',
  'abs_upper','abs_lower','obliques','quads','hamstrings','glutes','adductors',
  'calves','tibialis',
];

describe('muscles taxonomy', () => {
  it('MUSCLE_CODES is exactly the 22 shadeable fine codes (no full_body)', () => {
    expect([...MUSCLE_CODES].sort()).toEqual([...EXPECTED_FINE].sort());
    expect(MUSCLE_CODES).not.toContain('full_body');
  });

  it('MUSCLES includes full_body, flagged and with no region', () => {
    const fb = MUSCLES.find((m) => m.code === 'full_body');
    expect(fb?.isFullBody).toBe(true);
    expect(fb?.bodyRegionSlug).toBeNull();
  });

  it('MUSCLE_GROUPS are the six taggable groups in display order', () => {
    expect(MUSCLE_GROUPS).toEqual(['shoulders', 'chest', 'back', 'arms', 'core', 'legs']);
  });

  it('every shadeable code maps to a region slug', () => {
    for (const c of MUSCLE_CODES) expect(bodyRegionSlugForCode(c)).toBeTruthy();
  });

  it('codesForBodyRegion inverts the map (3 delts share deltoids)', () => {
    expect([...codesForBodyRegion('deltoids')].sort()).toEqual(
      ['delt_front', 'delt_rear', 'delt_side'],
    );
  });

  // Real TS↔DB anti-drift guard: parse the codes seeded by the migration and
  // assert they are exactly the canonical TS set. (The pgTAP suite then pins the
  // applied DB == the migration seed, closing the loop TS→migration→DB.)
  it('the migration muscles seed matches the canonical taxonomy', () => {
    const sql = readFileSync(
      fileURLToPath(
        new URL(
          '../../supabase/migrations/20260604120000_fine_muscle_taxonomy.sql',
          import.meta.url,
        ),
      ),
      'utf8',
    );
    const insertBlock = sql.slice(
      sql.indexOf('insert into public.muscles'),
      sql.indexOf('on conflict'),
    );
    const seeded = [...insertBlock.matchAll(/\(\s*'([a-z_]+)'\s*,/g)].map((m) => m[1]);
    expect(seeded.sort()).toEqual(MUSCLES.map((m) => m.code).sort());
  });
});
