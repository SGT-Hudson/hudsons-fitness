import { describe, expect, it } from 'vitest';
import { codesForBodyRegion, bodyRegionSlugForCode } from '@/core/muscles';

describe('neck/abductors shading wiring (no render change needed)', () => {
  it('neck shades its own art region', () => {
    expect(bodyRegionSlugForCode('neck')).toBe('neck');
    expect(codesForBodyRegion('neck')).toEqual(['neck']);
  });

  it('abductors co-shades the gluteal region additively with glutes', () => {
    expect(bodyRegionSlugForCode('abductors')).toBe('gluteal');
    expect([...codesForBodyRegion('gluteal')].sort()).toEqual(['abductors', 'glutes']);
  });
});
