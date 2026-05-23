import { describe, it, expect } from 'vitest';
import { classifyMacro, KCAL_MAINTENANCE_BAND_PCT, essentialFatFloorG, ESSENTIAL_FAT_PCT_OF_KCAL } from './macroStatus';

describe('classifyMacro', () => {
  it('no target → flex', () => {
    expect(classifyMacro('kcal', 500, undefined, 'cut')).toEqual({
      remaining: 0,
      fillPct: 0,
      tone: 'flex',
    });
  });

  it('cut kcal under target → budget', () => {
    const s = classifyMacro('kcal', 1180, 2000, 'cut');
    expect(s.tone).toBe('budget');
    expect(s.remaining).toBe(820);
    expect(s.fillPct).toBeCloseTo(59, 0);
  });

  it('cut kcal over target → overBudget', () => {
    expect(classifyMacro('kcal', 2200, 2000, 'cut').tone).toBe('overBudget');
  });

  it('bulk kcal under target → budget (to-go)', () => {
    expect(classifyMacro('kcal', 1800, 2600, 'bulk').tone).toBe('budget');
  });

  it('bulk kcal at/over target → floorMet', () => {
    expect(classifyMacro('kcal', 2600, 2600, 'bulk').tone).toBe('floorMet');
  });

  it('maintenance kcal within band → floorMet', () => {
    expect(classifyMacro('kcal', 2050, 2000, 'maintenance').tone).toBe('floorMet');
  });

  it('maintenance kcal far over band → overBudget', () => {
    expect(classifyMacro('kcal', 2400, 2000, 'maintenance').tone).toBe('overBudget');
  });

  it('maintenance kcal far under band → budget', () => {
    expect(classifyMacro('kcal', 1800, 2000, 'maintenance').tone).toBe('budget');
  });

  it('protein over target → floorMet (over-protein is good, never red)', () => {
    const s = classifyMacro('proteinG', 175, 165, 'cut');
    expect(s.tone).toBe('floorMet');
    expect(s.remaining).toBe(-10);
  });

  it('protein under target → floorUnderSoft (neutral, not alarming)', () => {
    expect(classifyMacro('proteinG', 110, 165, 'cut').tone).toBe('floorUnderSoft');
  });

  it('fiber under minimum → floorUnderWarn (amber)', () => {
    expect(classifyMacro('fiberG', 18, 30, 'cut').tone).toBe('floorUnderWarn');
  });

  it('fiber met → floorMet', () => {
    expect(classifyMacro('fiberG', 30, 30, 'cut').tone).toBe('floorMet');
  });

  it('carbs and fat are always flex (informational)', () => {
    expect(classifyMacro('carbsG', 95, 180, 'cut').tone).toBe('flex');
    expect(classifyMacro('fatG', 80, 60, 'cut').tone).toBe('flex');
  });

  it('fillPct clamps to 0..100', () => {
    expect(classifyMacro('proteinG', 300, 100, 'cut').fillPct).toBe(100);
    expect(classifyMacro('kcal', -5, 2000, 'cut').fillPct).toBe(0);
  });

  it('exposes the maintenance band constant', () => {
    expect(KCAL_MAINTENANCE_BAND_PCT).toBe(5);
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
