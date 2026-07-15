import { describe, it, expect } from 'vitest';
import { toFilledGrid } from './filledGrid';

describe('toFilledGrid', () => {
  it('builds a 7 × mealCount grid, all off with no slots', () => {
    const grid = toFilledGrid([], 3);
    expect(grid).toHaveLength(7);
    expect(grid.every((day) => day.length === 3 && day.every((on) => on === false))).toBe(true);
  });

  it('marks [day][meal] where a slot exists', () => {
    const grid = toFilledGrid(
      [
        { day_of_week: 0, meal_index: 0 },
        { day_of_week: 6, meal_index: 1 },
      ],
      2,
    );
    expect(grid[0][0]).toBe(true);
    expect(grid[6][1]).toBe(true);
    expect(grid[0][1]).toBe(false);
    expect(grid[6][0]).toBe(false);
    expect(grid.flat().filter(Boolean)).toHaveLength(2);
  });

  it('collapses several slots in the same cell into one filled dot', () => {
    const grid = toFilledGrid(
      [
        { day_of_week: 2, meal_index: 1 },
        { day_of_week: 2, meal_index: 1 },
      ],
      2,
    );
    expect(grid[2][1]).toBe(true);
    expect(grid.flat().filter(Boolean)).toHaveLength(1);
  });

  it('ignores slots outside the grid instead of throwing', () => {
    const grid = toFilledGrid(
      [
        { day_of_week: 7, meal_index: 0 },
        { day_of_week: -1, meal_index: 0 },
        { day_of_week: 3, meal_index: 5 },
        { day_of_week: 3, meal_index: -1 },
      ],
      2,
    );
    expect(grid.flat().some(Boolean)).toBe(false);
  });

  it('returns 7 empty rows when there are no meals', () => {
    const grid = toFilledGrid([{ day_of_week: 0, meal_index: 0 }], 0);
    expect(grid).toHaveLength(7);
    expect(grid.every((day) => day.length === 0)).toBe(true);
  });
});
