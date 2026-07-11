/** A template slot reduced to its position in the week. */
export interface GridSlot {
  day_of_week: number;
  meal_index: number;
}

/**
 * Fill-state of a template's week: `grid[dayOfWeek][mealIndex]` is true where at
 * least one slot sits in that cell. Pure — the dot-grid's only input.
 *
 * Slots outside the 7 × mealCount box (a stale meal_index after the template's
 * meal times shrank, say) are dropped rather than growing the grid: the card
 * draws exactly the meals the template declares.
 */
export function toFilledGrid(slots: GridSlot[], mealCount: number): boolean[][] {
  const meals = Math.max(0, mealCount);
  const grid = Array.from({ length: 7 }, () => Array.from({ length: meals }, () => false));
  for (const slot of slots) {
    const day = slot.day_of_week;
    const meal = slot.meal_index;
    if (day < 0 || day > 6 || meal < 0 || meal >= meals) continue;
    grid[day][meal] = true;
  }
  return grid;
}
