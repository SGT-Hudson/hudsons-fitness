import { describe, it, expect } from 'vitest';
import { copyTemplateMeal } from './copyMeal';
import type { TemplateSlotInput } from '@/features/planning/components/TemplateGrid';

let n = 0;
const rid = () => `new-${(n += 1)}`;

function slot(p: Partial<TemplateSlotInput> & { day_of_week: number; meal_index: number }): TemplateSlotInput {
  return {
    rowId: `r${Math.random()}`,
    recipe_id: 'rec',
    recipe_name: 'Recipe',
    servings: 1,
    display_order: 0,
    ...p,
  };
}

describe('copyTemplateMeal', () => {
  it('copies the source meal onto each target day with new rowIds', () => {
    n = 0;
    const slots = [
      slot({ day_of_week: 0, meal_index: 1, recipe_id: 'a', recipe_name: 'A', display_order: 0 }),
      slot({ day_of_week: 0, meal_index: 1, recipe_id: 'b', recipe_name: 'B', display_order: 1 }),
    ];
    const out = copyTemplateMeal(slots, 0, 1, [2, 3], rid);
    const tue = out.filter((s) => s.day_of_week === 2 && s.meal_index === 1);
    const wed = out.filter((s) => s.day_of_week === 3 && s.meal_index === 1);
    expect(tue.map((s) => s.recipe_id)).toEqual(['a', 'b']);
    expect(wed.map((s) => s.recipe_id)).toEqual(['a', 'b']);
    expect(tue.map((s) => s.display_order)).toEqual([0, 1]);
    expect(tue.every((s) => s.rowId.startsWith('new-'))).toBe(true);
  });

  it('overwrites existing target rows at that meal index (replace, not merge)', () => {
    n = 0;
    const slots = [
      slot({ day_of_week: 0, meal_index: 1, recipe_id: 'a', recipe_name: 'A' }),
      slot({ day_of_week: 2, meal_index: 1, recipe_id: 'old', recipe_name: 'Old' }),
    ];
    const out = copyTemplateMeal(slots, 0, 1, [2], rid);
    const tue = out.filter((s) => s.day_of_week === 2 && s.meal_index === 1);
    expect(tue.map((s) => s.recipe_id)).toEqual(['a']);
  });

  it('leaves the source day and other meal indices untouched', () => {
    n = 0;
    const slots = [
      slot({ day_of_week: 0, meal_index: 1, recipe_id: 'a' }),
      slot({ day_of_week: 0, meal_index: 2, recipe_id: 'lunch' }),
      slot({ day_of_week: 2, meal_index: 2, recipe_id: 'keep' }),
    ];
    const out = copyTemplateMeal(slots, 0, 1, [2], rid);
    expect(out.filter((s) => s.day_of_week === 0).length).toBe(2);
    expect(out.find((s) => s.day_of_week === 2 && s.meal_index === 2)?.recipe_id).toBe('keep');
  });

  it('copying an empty source meal clears the target meal', () => {
    n = 0;
    const slots = [slot({ day_of_week: 2, meal_index: 1, recipe_id: 'old' })];
    const out = copyTemplateMeal(slots, 0, 1, [2], rid);
    expect(out.filter((s) => s.day_of_week === 2 && s.meal_index === 1)).toEqual([]);
  });
});
