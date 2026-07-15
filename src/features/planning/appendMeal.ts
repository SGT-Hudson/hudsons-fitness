/** A row to insert into `meal_plan_week_slots`. */
export interface AppendRow {
  plan_week_id: string;
  date: string;
  meal_index: number;
  meal_time: string | null;
  recipe_id: string;
  servings: number;
  display_order: number;
}

interface SlotLike {
  date: string;
  meal_index: number;
  meal_time: string | null;
  recipe_id: string;
  servings: number;
  display_order: number;
}

/**
 * The rows an "añadir junto" (append) copy must insert: every entry of the
 * source meal, re-dated onto each target, with `display_order` continuing after
 * whatever that target day's same meal already holds — so nothing is
 * overwritten and the source's relative order survives.
 *
 * The counterpart of the `copy_week_meal` RPC, which REPLACES (it deletes the
 * whole meal_index bucket on each target first). Append needs no RPC: all rows
 * go into one table in one `insert()` statement.
 */
export function appendMealRows({
  planWeekId,
  slots,
  sourceDate,
  mealIndex,
  targetDates,
}: {
  planWeekId: string;
  slots: SlotLike[];
  sourceDate: string;
  mealIndex: number;
  targetDates: string[];
}): AppendRow[] {
  const source = slots
    .filter((s) => s.date === sourceDate && s.meal_index === mealIndex)
    .sort((a, b) => a.display_order - b.display_order);
  if (source.length === 0) return [];

  return targetDates.flatMap((date) => {
    const occupied = slots.filter((s) => s.date === date && s.meal_index === mealIndex);
    const nextOrder = occupied.length
      ? Math.max(...occupied.map((s) => s.display_order)) + 1
      : 0;
    return source.map((s, i) => ({
      plan_week_id: planWeekId,
      date,
      meal_index: mealIndex,
      meal_time: s.meal_time,
      recipe_id: s.recipe_id,
      servings: s.servings,
      display_order: nextOrder + i,
    }));
  });
}
