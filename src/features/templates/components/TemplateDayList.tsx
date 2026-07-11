import { TodayPlanList, type TodayMeal } from '@/features/planning/components/TodayPlanList';
import type { PlannerCellEntry } from '@/features/planning/components/PlannerMealCell';
import type { TemplateSlotInput } from '@/features/planning/components/TemplateGrid';
import { scale, ZERO_MACROS, type Macros } from '@/features/recipes/macros';

interface Props {
  /** 0-6, 0 = Monday. The day the mobile week strip has selected. */
  dayOfWeek: number;
  mealTimes: string[];
  slots: TemplateSlotInput[];
  /** Per-serving macros by recipe id; a recipe still loading contributes zero. */
  recipeMacros?: Map<string, Macros>;
  onAddRequest: (mealIndex: number) => void;
  onOpenEntry: (entry: PlannerCellEntry, mealIndex: number) => void;
  onCopyMeal: (mealIndex: number) => void;
  className?: string;
}

/**
 * One day of a template, as the mobile editor sees it (R-33 wave 4): the same
 * `TodayPlanList` the planner uses on a phone, fed the selected `day_of_week`'s
 * slots instead of a date's. `TodayMeal` carries no date, so the shape already
 * fits — the only projection needed is slot → `PlannerCellEntry` (its macros
 * are `servings` × the recipe's per-serving ones, which the template's own rows
 * do not carry).
 *
 * Rows come from `mealTimes` alone, exactly like `TemplateGrid`'s: the meal
 * times editor is the single source of a template's meal structure, so a slot
 * left behind above the last configured time is invisible in both breakpoints.
 */
export function TemplateDayList({
  dayOfWeek,
  mealTimes,
  slots,
  recipeMacros,
  onAddRequest,
  onOpenEntry,
  onCopyMeal,
  className,
}: Props) {
  const macrosMap = recipeMacros ?? new Map<string, Macros>();

  const meals: TodayMeal[] = mealTimes.map((time, mealIndex) => ({
    mealIndex,
    mealTime: time,
    entries: slots
      .filter((s) => s.day_of_week === dayOfWeek && s.meal_index === mealIndex)
      .sort((a, b) => a.display_order - b.display_order)
      .map((s) => ({
        id: s.rowId,
        recipe_id: s.recipe_id,
        recipe_name: s.recipe_name,
        servings: s.servings,
        macros: scale(macrosMap.get(s.recipe_id) ?? ZERO_MACROS, s.servings),
      })),
  }));

  return (
    <TodayPlanList
      meals={meals}
      className={className}
      onAddMeal={(mealIndex) => onAddRequest(mealIndex)}
      onCopyMeal={onCopyMeal}
      onOpenEntry={(entry) => {
        const row = meals.find((m) => m.entries.some((e) => e.id === entry.id));
        onOpenEntry(entry, row?.mealIndex ?? 0);
      }}
    />
  );
}
