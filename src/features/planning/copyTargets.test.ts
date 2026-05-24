import { describe, it, expect } from 'vitest';
import { templateMealTargets, weekMealTargets } from './copyTargets';

describe('templateMealTargets', () => {
  it('lists the other 6 days in Mon..Sun order and flags overwrite', () => {
    const slots = [
      { day_of_week: 0, meal_index: 1 }, // source
      { day_of_week: 2, meal_index: 1 }, // Wed already has this meal
      { day_of_week: 3, meal_index: 2 }, // Thu has a different meal only
    ];
    const out = templateMealTargets(slots, 0, 1);
    expect(out.map((t) => t.key)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(out.find((t) => t.key === '2')?.willOverwrite).toBe(true);
    expect(out.find((t) => t.key === '3')?.willOverwrite).toBe(false);
  });
});

describe('weekMealTargets', () => {
  const week = [
    '2026-05-25', '2026-05-26', '2026-05-27', '2026-05-28',
    '2026-05-29', '2026-05-30', '2026-05-31',
  ];
  it('excludes the source date and flags overwrite per date', () => {
    const slots = [
      { date: '2026-05-25', meal_index: 0 }, // source
      { date: '2026-05-26', meal_index: 0 }, // Tue occupied
    ];
    const out = weekMealTargets(slots, week, '2026-05-25', 0);
    expect(out.map((t) => t.key)).toEqual(week.slice(1));
    expect(out.find((t) => t.key === '2026-05-26')?.willOverwrite).toBe(true);
    expect(out.find((t) => t.key === '2026-05-27')?.willOverwrite).toBe(false);
  });
});
