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
});
