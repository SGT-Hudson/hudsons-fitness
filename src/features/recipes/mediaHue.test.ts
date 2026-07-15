import { describe, it, expect } from 'vitest';
import { recipeMediaHue } from './mediaHue';

// Fixed id set (not random) so the spread assertions are reproducible.
const IDS = [
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'a1b2c3d4-0000-0000-0000-000000000001',
  'a1b2c3d4-0000-0000-0000-000000000002',
  '9c858901-8a57-4791-81fe-4c455b099bc9',
  '550e8400-e29b-41d4-a716-446655440000',
  '00000000-0000-0000-0000-000000000000',
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
];

describe('recipeMediaHue', () => {
  it('is stable across repeated calls for the same id', () => {
    const id = '9c858901-8a57-4791-81fe-4c455b099bc9';
    const first = recipeMediaHue(id);
    expect(recipeMediaHue(id)).toBe(first);
    expect(recipeMediaHue(id)).toBe(first);
  });

  it('pins a known id to a known hue — guards a future refactor changing everyone\'s colours', () => {
    expect(recipeMediaHue('550e8400-e29b-41d4-a716-446655440000')).toBe(132);
  });

  it('spreads different ids across the hue range instead of clustering', () => {
    const hues = IDS.map(recipeMediaHue);
    expect(new Set(hues).size).toBeGreaterThan(hues.length / 2);
    expect(Math.min(...hues)).toBeLessThan(50);
    expect(Math.max(...hues)).toBeGreaterThan(100);
  });

  it('keeps every hue inside the canvas palette band (15–135), including near-collision ids', () => {
    for (const id of IDS) {
      const hue = recipeMediaHue(id);
      expect(hue).toBeGreaterThanOrEqual(15);
      expect(hue).toBeLessThanOrEqual(135);
    }
    for (let i = 0; i < 500; i += 1) {
      const hue = recipeMediaHue(`recipe-${i}`);
      expect(hue).toBeGreaterThanOrEqual(15);
      expect(hue).toBeLessThanOrEqual(135);
    }
  });
});
