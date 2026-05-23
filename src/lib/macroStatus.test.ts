import { describe, it, expect } from 'vitest';
import { classifyMacro, KCAL_MAINTENANCE_BAND_PCT, essentialFatFloorG, ESSENTIAL_FAT_PCT_OF_KCAL } from './macroStatus';

const F = (consumed: number, target: number, phase: 'cut'|'maintenance'|'bulk', floor?: number) =>
  classifyMacro('kcal', consumed, target, phase, { essentialFatFloorG: floor });

describe('classifyMacro — kcal cut bands (target 2000)', () => {
  it('< -50 under → budget (blue), no excess', () => {
    const s = F(1850, 2000, 'cut');
    expect(s.tone).toBe('budget'); expect(s.excess).toBeNull();
  });
  it('within ±50 → onTarget (green)', () => {
    expect(F(1960, 2000, 'cut').tone).toBe('onTarget'); // -40
    expect(F(2040, 2000, 'cut').tone).toBe('onTarget'); // +40
  });
  it('+50..+100 → slightOver (amber) with tolerance excess', () => {
    const s = F(2080, 2000, 'cut');
    expect(s.tone).toBe('slightOver'); expect(s.excess).toBe('tolerance'); expect(s.overG).toBe(80);
  });
  it('> +100 → over (red) with bad excess', () => {
    const s = F(2150, 2000, 'cut');
    expect(s.tone).toBe('over'); expect(s.excess).toBe('bad'); expect(s.overG).toBe(150);
  });
});

describe('classifyMacro — kcal bulk bands (target 3000)', () => {
  it('< -50 → over (red), under (no excess)', () => {
    const s = F(2600, 3000, 'bulk');
    expect(s.tone).toBe('over'); expect(s.excess).toBeNull();
  });
  it('-50..+200 → onTarget (green); over within band shows no dark excess', () => {
    expect(F(2970, 3000, 'bulk').tone).toBe('onTarget'); // -30
    const over = F(3100, 3000, 'bulk');                  // +100
    expect(over.tone).toBe('onTarget'); expect(over.excess).toBeNull();
  });
  it('> +200 → surplusHigh (amber) with tolerance excess', () => {
    const s = F(3350, 3000, 'bulk');
    expect(s.tone).toBe('surplusHigh'); expect(s.excess).toBe('tolerance');
  });
});

describe('classifyMacro — kcal maintenance (target 2200, ±5% ≈ ±110)', () => {
  it('within band → onTarget', () => { expect(F(2150, 2200, 'maintenance').tone).toBe('onTarget'); });
  it('under band → budget', () => { expect(F(2000, 2200, 'maintenance').tone).toBe('budget'); });
  it('over band → over with bad excess', () => {
    const s = F(2400, 2200, 'maintenance');
    expect(s.tone).toBe('over'); expect(s.excess).toBe('bad');
  });
});

describe('classifyMacro — protein floor (target 150)', () => {
  it('under → neutral (grey), no warning', () => {
    expect(classifyMacro('proteinG', 120, 150, 'cut').tone).toBe('neutral');
  });
  it('met → floorMet (green)', () => {
    expect(classifyMacro('proteinG', 150, 150, 'cut').tone).toBe('floorMet');
  });
  it('over → floorMet with good excess (dark green)', () => {
    const s = classifyMacro('proteinG', 158, 150, 'cut');
    expect(s.tone).toBe('floorMet'); expect(s.excess).toBe('good'); expect(s.overG).toBe(8);
  });
});

describe('classifyMacro — fiber is informational (target 30)', () => {
  it('under → neutral (grey), NOT amber, no warning', () => {
    expect(classifyMacro('fiberG', 12, 30, 'cut').tone).toBe('neutral');
  });
  it('over → floorMet with good excess', () => {
    expect(classifyMacro('fiberG', 35, 30, 'cut').excess).toBe('good');
  });
});

describe('classifyMacro — carbs informational (target 200)', () => {
  it('under/at → neutral, no excess', () => {
    expect(classifyMacro('carbsG', 180, 200, 'cut').tone).toBe('neutral');
  });
  it('over → neutral with bad excess (dark red)', () => {
    const s = classifyMacro('carbsG', 240, 200, 'cut');
    expect(s.tone).toBe('neutral'); expect(s.excess).toBe('bad');
  });
});

describe('classifyMacro — fat floor (target 65, essential floor 44)', () => {
  it('below floor → fatLow (red) with minFloorG set', () => {
    const s = classifyMacro('fatG', 30, 65, 'cut', { essentialFatFloorG: 44 });
    expect(s.tone).toBe('fatLow'); expect(s.minFloorG).toBe(44); expect(s.excess).toBeNull();
  });
  it('between floor and target → neutral', () => {
    expect(classifyMacro('fatG', 55, 65, 'cut', { essentialFatFloorG: 44 }).tone).toBe('neutral');
  });
  it('over target → neutral with bad excess', () => {
    expect(classifyMacro('fatG', 78, 65, 'cut', { essentialFatFloorG: 44 }).excess).toBe('bad');
  });
});

describe('classifyMacro — no target → neutral flat', () => {
  it('returns neutral with zeros', () => {
    const s = classifyMacro('kcal', 100, 0, 'cut');
    expect(s.tone).toBe('neutral'); expect(s.fillPct).toBe(0); expect(s.excess).toBeNull();
  });
});

describe('essentialFatFloorG', () => {
  it('is 20% of target kcal converted to grams (9 kcal/g), rounded', () => {
    expect(ESSENTIAL_FAT_PCT_OF_KCAL).toBe(20);
    expect(essentialFatFloorG(2000)).toBe(44); // 2000 → 400 kcal → 44.4 g → 44
    expect(essentialFatFloorG(3000)).toBe(67); // 3000 → 600 → 66.7 → 67
  });
  it('is 0 for a non-positive target', () => {
    expect(essentialFatFloorG(0)).toBe(0);
  });
});
