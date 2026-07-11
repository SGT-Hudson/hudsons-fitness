import { describe, it, expect } from 'vitest';
import { appendMealRows } from './appendMeal';

const slot = (over: Partial<Parameters<typeof appendMealRows>[0]['slots'][number]>) => ({
  date: '2026-05-25', meal_index: 1, meal_time: '14:00',
  recipe_id: 'r1', servings: 1, display_order: 0, ...over,
});

describe('appendMealRows', () => {
  it('copies every entry of the source meal onto each target date', () => {
    const rows = appendMealRows({
      planWeekId: 'w1',
      slots: [
        slot({ date: '2026-05-25', recipe_id: 'r1', display_order: 0 }),
        slot({ date: '2026-05-25', recipe_id: 'r2', display_order: 1, servings: 2 }),
      ],
      sourceDate: '2026-05-25',
      mealIndex: 1,
      targetDates: ['2026-05-26', '2026-05-27'],
    });
    expect(rows).toHaveLength(4);
    expect(rows.filter((r) => r.date === '2026-05-26')).toHaveLength(2);
    expect(rows.every((r) => r.plan_week_id === 'w1' && r.meal_index === 1)).toBe(true);
    // servings and meal_time ride along
    expect(rows.find((r) => r.date === '2026-05-26' && r.recipe_id === 'r2')?.servings).toBe(2);
    expect(rows[0].meal_time).toBe('14:00');
  });

  it('continues display_order after what the target day already holds', () => {
    const rows = appendMealRows({
      planWeekId: 'w1',
      slots: [
        slot({ date: '2026-05-25', recipe_id: 'r1', display_order: 0 }),
        slot({ date: '2026-05-25', recipe_id: 'r2', display_order: 1 }),
        // Tuesday's lunch already has two entries.
        slot({ date: '2026-05-26', recipe_id: 'rX', display_order: 0 }),
        slot({ date: '2026-05-26', recipe_id: 'rY', display_order: 1 }),
      ],
      sourceDate: '2026-05-25',
      mealIndex: 1,
      targetDates: ['2026-05-26'],
    });
    expect(rows.map((r) => r.display_order)).toEqual([2, 3]);
    // …and the source's relative order is preserved.
    expect(rows.map((r) => r.recipe_id)).toEqual(['r1', 'r2']);
  });

  it('starts at 0 on an empty target slot', () => {
    const rows = appendMealRows({
      planWeekId: 'w1',
      slots: [slot({ date: '2026-05-25', recipe_id: 'r1', display_order: 0 })],
      sourceDate: '2026-05-25',
      mealIndex: 1,
      targetDates: ['2026-05-27'],
    });
    expect(rows[0].display_order).toBe(0);
  });

  it('ignores other meals and other days when counting the target bucket', () => {
    const rows = appendMealRows({
      planWeekId: 'w1',
      slots: [
        slot({ date: '2026-05-25', meal_index: 1, recipe_id: 'r1', display_order: 0 }),
        // Same target day, DIFFERENT meal — must not shift the append offset.
        slot({ date: '2026-05-26', meal_index: 0, recipe_id: 'rZ', display_order: 4 }),
      ],
      sourceDate: '2026-05-25',
      mealIndex: 1,
      targetDates: ['2026-05-26'],
    });
    expect(rows[0].display_order).toBe(0);
  });

  it('returns nothing when the source meal is empty', () => {
    expect(
      appendMealRows({ planWeekId: 'w1', slots: [], sourceDate: '2026-05-25', mealIndex: 1, targetDates: ['2026-05-26'] }),
    ).toEqual([]);
  });
});
