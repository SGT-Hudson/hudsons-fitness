import type { TemplateSlotInput } from '@/features/planning/components/TemplateGrid';

/**
 * Duplicate one meal (all rows at `(sourceDay, mealIndex)`) onto each target day,
 * replacing whatever those days had at `mealIndex`. Pure: callers pass a rowId
 * factory so the result is deterministic in tests. The source day is never a target.
 */
export function copyTemplateMeal(
  slots: TemplateSlotInput[],
  sourceDay: number,
  mealIndex: number,
  targetDays: number[],
  newRowId: () => string,
): TemplateSlotInput[] {
  const targets = new Set(targetDays.filter((d) => d !== sourceDay));

  const source = slots
    .filter((s) => s.day_of_week === sourceDay && s.meal_index === mealIndex)
    .sort((a, b) => a.display_order - b.display_order);

  // Drop existing rows at (target, mealIndex); keep everything else.
  const kept = slots.filter(
    (s) => !(targets.has(s.day_of_week) && s.meal_index === mealIndex),
  );

  const copies: TemplateSlotInput[] = [];
  for (const day of targets) {
    source.forEach((s, i) => {
      copies.push({
        rowId: newRowId(),
        day_of_week: day,
        meal_index: mealIndex,
        recipe_id: s.recipe_id,
        recipe_name: s.recipe_name,
        servings: s.servings,
        display_order: i,
      });
    });
  }

  return [...kept, ...copies];
}
