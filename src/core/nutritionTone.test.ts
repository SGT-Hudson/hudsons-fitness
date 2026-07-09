import { describe, it, expect } from 'vitest';
import {
  FAT_FLOOR_G_PER_KG,
  essentialFatFloorG,
  getKcalStatus,
  getMacroStatus,
  getExcessTone,
  classify,
  type Tone,
  type Excess,
} from './nutritionTone';

// Golden vectors transcribed verbatim from spec §5 / the canvas's
// planificador-spec.jsx <Case> cards. Do not re-derive thresholds here —
// they are pinned exactly as quoted in docs/superpowers/specs/2026-07-09-r33-tone-core.md §2.2.

describe('getKcalStatus — cut', () => {
  it.each<[number, number, Tone]>([
    [2050, 2180, 'good'],
    [2240, 2180, 'slightOver'],
    [2320, 2180, 'over'],
  ])('consumed=%i target=%i -> %s', (consumed, target, expected) => {
    expect(getKcalStatus(consumed, target, 'cut')).toBe(expected);
  });
});

describe('getKcalStatus — bulk', () => {
  it.each<[number, number, Tone]>([
    [2600, 2780, 'low'],
    [2730, 2780, 'slightOver'],
    [2850, 2780, 'good'],
  ])('consumed=%i target=%i -> %s', (consumed, target, expected) => {
    expect(getKcalStatus(consumed, target, 'bulk')).toBe(expected);
  });
});

describe('getKcalStatus — maintenance', () => {
  it.each<[number, number, Tone]>([
    [2470, 2480, 'onTarget'],
    [2620, 2480, 'slightOver'],
    [2350, 2480, 'low'],
  ])('consumed=%i target=%i -> %s', (consumed, target, expected) => {
    expect(getKcalStatus(consumed, target, 'maintenance')).toBe(expected);
  });
});

describe('getMacroStatus — protein', () => {
  it.each<[number, number, Tone]>([
    [172, 168, 'good'],
    [156, 168, 'slightOver'],
    [138, 168, 'over'],
  ])('consumed=%i target=%i -> %s', (consumed, target, expected) => {
    expect(getMacroStatus('protein', consumed, target, 'cut')).toBe(expected);
  });
});

describe('getMacroStatus — carbs', () => {
  it('238 target 245, cut -> good', () => {
    expect(getMacroStatus('carbs', 238, 245, 'cut')).toBe('good');
  });
  it('272 target 245, cut -> slightOver', () => {
    expect(getMacroStatus('carbs', 272, 245, 'cut')).toBe('slightOver');
  });
  it('272 target 245, bulk -> good (no phase gate outside cut)', () => {
    expect(getMacroStatus('carbs', 272, 245, 'bulk')).toBe('good');
  });
});

describe('getMacroStatus — fat (target 68, floor 48)', () => {
  it.each<[number, Tone]>([
    [60, 'good'],
    [40, 'over'],
    [80, 'slightOver'],
  ])('consumed=%i -> %s', (consumed, expected) => {
    expect(getMacroStatus('fat', consumed, 68, 'cut', 48)).toBe(expected);
  });
});

describe('getMacroStatus — fiber (target 30)', () => {
  it.each<[number, Tone]>([
    [29, 'good'],
    [22, 'slightOver'],
    [38, 'good'],
  ])('consumed=%i -> %s', (consumed, expected) => {
    expect(getMacroStatus('fiber', consumed, 30, 'cut')).toBe(expected);
  });
});

describe('MiniWeek integration fixture (cut, kcalTarget 2180, fatFloor 48)', () => {
  // Five-day multi-metric integration vector, transcribed verbatim from the
  // canvas's planificador-spec.jsx (lines 351–366). Exercises the module end
  // to end via classify(). The interesting days: day2 fat = 44 is below the
  // 48 g floor (→ over) and day3 protein = 150 is -10.7% (→ over) with fiber
  // 22 under 90% of 30 (→ slightOver).
  interface Day {
    label: string;
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
  }

  const days: Day[] = [
    { label: 'day0', kcal: 2050, protein: 170, carbs: 238, fat: 60, fiber: 30 },
    { label: 'day1', kcal: 2240, protein: 175, carbs: 272, fat: 65, fiber: 28 },
    { label: 'day2', kcal: 2095, protein: 160, carbs: 240, fat: 44, fiber: 32 },
    { label: 'day3', kcal: 2320, protein: 150, carbs: 290, fat: 80, fiber: 22 },
    { label: 'day4', kcal: 2180, protein: 168, carbs: 245, fat: 62, fiber: 30 },
  ];

  const targets = { kcal: 2180, protein: 168, carbs: 245, fat: 68, fiber: 30 };
  const opts = { fatFloorG: 48 };

  it.each<[string, Tone, Tone, Tone, Tone, Tone]>([
    ['day0', 'good', 'good', 'good', 'good', 'good'],
    ['day1', 'slightOver', 'good', 'slightOver', 'good', 'good'],
    ['day2', 'good', 'slightOver', 'good', 'over', 'good'],
    ['day3', 'over', 'over', 'slightOver', 'slightOver', 'slightOver'],
    ['day4', 'good', 'good', 'good', 'good', 'good'],
  ])('%s', (label, kcalTone, proteinTone, carbsTone, fatTone, fiberTone) => {
    const d = days.find((day) => day.label === label)!;
    expect(classify('kcal', d.kcal, targets.kcal, 'cut', opts).tone).toBe(kcalTone);
    expect(classify('protein', d.protein, targets.protein, 'cut', opts).tone).toBe(proteinTone);
    expect(classify('carbs', d.carbs, targets.carbs, 'cut', opts).tone).toBe(carbsTone);
    expect(classify('fat', d.fat, targets.fat, 'cut', opts).tone).toBe(fatTone);
    expect(classify('fiber', d.fiber, targets.fiber, 'cut', opts).tone).toBe(fiberTone);
  });
});

describe('boundary — kcal cut thresholds (pct > 0.015, pct > 0.05)', () => {
  const target = 2000;
  it('+1.5% exactly is NOT slightOver (good; operator is >)', () => {
    expect(getKcalStatus(2030, target, 'cut')).toBe('good');
  });
  it('just above +1.5% is slightOver', () => {
    expect(getKcalStatus(2031, target, 'cut')).toBe('slightOver');
  });
  it('+5% exactly is NOT over (still slightOver; operator is >)', () => {
    expect(getKcalStatus(2100, target, 'cut')).toBe('slightOver');
  });
  it('just above +5% is over', () => {
    expect(getKcalStatus(2101, target, 'cut')).toBe('over');
  });
});

describe('boundary — kcal bulk thresholds (pct < -0.015, pct < -0.05)', () => {
  const target = 2000;
  it('-1.5% exactly is NOT slightOver (good; operator is <)', () => {
    expect(getKcalStatus(1970, target, 'bulk')).toBe('good');
  });
  it('just below -1.5% is slightOver', () => {
    expect(getKcalStatus(1969, target, 'bulk')).toBe('slightOver');
  });
  it('-5% exactly is NOT low (still slightOver; operator is <)', () => {
    expect(getKcalStatus(1900, target, 'bulk')).toBe('slightOver');
  });
  it('just below -5% is low', () => {
    expect(getKcalStatus(1899, target, 'bulk')).toBe('low');
  });
});

describe('boundary — kcal maintenance band (|pct| <= 0.03)', () => {
  const target = 2000; // band = 60
  it('+3% exactly is onTarget (operator is <=, inclusive)', () => {
    expect(getKcalStatus(2060, target, 'maintenance')).toBe('onTarget');
  });
  it('just above +3% is slightOver', () => {
    expect(getKcalStatus(2061, target, 'maintenance')).toBe('slightOver');
  });
  it('-3% exactly is onTarget (operator is <=, inclusive)', () => {
    expect(getKcalStatus(1940, target, 'maintenance')).toBe('onTarget');
  });
  it('just below -3% is low', () => {
    expect(getKcalStatus(1939, target, 'maintenance')).toBe('low');
  });
});

describe('boundary — protein thresholds (pct >= -0.03, pct >= -0.10)', () => {
  const target = 1000;
  it('-3% exactly is good (operator is >=, inclusive)', () => {
    expect(getMacroStatus('protein', 970, target, 'cut')).toBe('good');
  });
  it('just below -3% is slightOver', () => {
    expect(getMacroStatus('protein', 969, target, 'cut')).toBe('slightOver');
  });
  it('-10% exactly is slightOver (operator is >=, inclusive)', () => {
    expect(getMacroStatus('protein', 900, target, 'cut')).toBe('slightOver');
  });
  it('just below -10% is over', () => {
    expect(getMacroStatus('protein', 899, target, 'cut')).toBe('over');
  });
});

describe('boundary — carbs +8% (cut only)', () => {
  const target = 1000;
  it('+8% exactly is good (operator is >)', () => {
    expect(getMacroStatus('carbs', 1080, target, 'cut')).toBe('good');
  });
  it('just above +8% is slightOver', () => {
    expect(getMacroStatus('carbs', 1081, target, 'cut')).toBe('slightOver');
  });
});

describe('boundary — fat +10% and floor', () => {
  const target = 1000;
  it('+10% exactly is good (operator is >)', () => {
    expect(getMacroStatus('fat', 1100, target, 'cut')).toBe('good');
  });
  it('just above +10% is slightOver', () => {
    expect(getMacroStatus('fat', 1101, target, 'cut')).toBe('slightOver');
  });
  it('consumed exactly at the floor is NOT over (operator is <)', () => {
    expect(getMacroStatus('fat', 48, target, 'cut', 48)).toBe('good');
  });
  it('just below the floor is over', () => {
    expect(getMacroStatus('fat', 47, target, 'cut', 48)).toBe('over');
  });
  it('no floor supplied never triggers the floor branch', () => {
    expect(getMacroStatus('fat', 1, target, 'cut')).toBe('good');
  });
});

describe('boundary — fiber 90% (consumed >= target * 0.9)', () => {
  const target = 1000;
  it('90% exactly is good (operator is >=, inclusive)', () => {
    expect(getMacroStatus('fiber', 900, target, 'cut')).toBe('good');
  });
  it('just below 90% is slightOver', () => {
    expect(getMacroStatus('fiber', 899, target, 'cut')).toBe('slightOver');
  });
});

describe('getExcessTone', () => {
  it.each<[Tone, Excess]>([
    ['over', 'bad'],
    ['slightOver', 'warn'],
    ['low', 'warn'],
    ['good', 'neutral'],
    ['onTarget', 'neutral'],
    ['neutral', 'neutral'],
  ])('%s -> %s', (status, expected) => {
    expect(getExcessTone(status)).toBe(expected);
  });
});

describe('classify — target guard', () => {
  it('target <= 0 -> neutral/neutral, remaining 0, overG 0', () => {
    const r = classify('kcal', 2000, 0, 'cut');
    expect(r).toEqual({ tone: 'neutral', excess: 'neutral', remaining: 0, overG: 0 });
  });
  it('negative target -> neutral/neutral', () => {
    const r = classify('protein', 100, -5, 'cut');
    expect(r).toEqual({ tone: 'neutral', excess: 'neutral', remaining: 0, overG: 0 });
  });
  it('missing target -> neutral/neutral', () => {
    const r = classify('fat', 60, undefined, 'cut');
    expect(r).toEqual({ tone: 'neutral', excess: 'neutral', remaining: 0, overG: 0 });
  });
});

describe('classify — consumed = 0', () => {
  it('kcal at 0 consumed classifies without error (deep deficit)', () => {
    const r = classify('kcal', 0, 2180, 'cut');
    expect(r.tone).toBe('good');
    expect(r.remaining).toBe(2180);
    expect(r.overG).toBe(0);
  });
});

describe('classify — phase defaults to cut when undefined', () => {
  it('undefined phase behaves like cut for kcal', () => {
    expect(classify('kcal', 2320, 2180, undefined).tone).toBe('over');
    expect(classify('kcal', 2320, 2180, 'cut').tone).toBe('over');
  });
});

describe('classify — remaining / overG / minFloorG', () => {
  it('remaining = target - consumed, overG = max(0, consumed - target)', () => {
    const r = classify('protein', 200, 168, 'cut');
    expect(r.remaining).toBe(-32);
    expect(r.overG).toBe(32);
  });
  it('minFloorG is set only for fat when a floor is supplied', () => {
    const fat = classify('fat', 60, 68, 'cut', { fatFloorG: 48 });
    expect(fat.minFloorG).toBe(48);

    const fatNoFloor = classify('fat', 60, 68, 'cut');
    expect(fatNoFloor.minFloorG).toBeUndefined();

    const protein = classify('protein', 172, 168, 'cut', { fatFloorG: 48 });
    expect(protein.minFloorG).toBeUndefined();
  });
  it('excess is derived via getExcessTone', () => {
    expect(classify('kcal', 2320, 2180, 'cut').excess).toBe('bad');
    expect(classify('kcal', 2240, 2180, 'cut').excess).toBe('warn');
    expect(classify('kcal', 2050, 2180, 'cut').excess).toBe('neutral');
  });
});

describe('essentialFatFloorG', () => {
  it('80kg -> round(0.6 * 80) = 48', () => {
    expect(essentialFatFloorG(80)).toBe(48);
  });
  it('FAT_FLOOR_G_PER_KG is 0.6', () => {
    expect(FAT_FLOOR_G_PER_KG).toBe(0.6);
  });
  it('0 -> 0', () => {
    expect(essentialFatFloorG(0)).toBe(0);
  });
  it('NaN -> 0', () => {
    expect(essentialFatFloorG(NaN)).toBe(0);
  });
  it('negative weight -> 0', () => {
    expect(essentialFatFloorG(-5)).toBe(0);
  });
});
