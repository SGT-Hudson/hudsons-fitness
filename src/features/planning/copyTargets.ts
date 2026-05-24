/** A copy candidate: a stringified day-of-week (template) or ISO date (planner). */
export interface RawCopyTarget {
  key: string;
  willOverwrite: boolean;
}

/** Other 6 days of the week (Mon..Sun), flagging days that already have this meal. */
export function templateMealTargets(
  slots: { day_of_week: number; meal_index: number }[],
  sourceDay: number,
  mealIndex: number,
): RawCopyTarget[] {
  const out: RawCopyTarget[] = [];
  for (let day = 0; day < 7; day += 1) {
    if (day === sourceDay) continue;
    out.push({
      key: String(day),
      willOverwrite: slots.some((s) => s.day_of_week === day && s.meal_index === mealIndex),
    });
  }
  return out;
}

/** Other dates of the active week, flagging dates that already have this meal. */
export function weekMealTargets(
  slots: { date: string; meal_index: number }[],
  weekDates: string[],
  sourceDate: string,
  mealIndex: number,
): RawCopyTarget[] {
  return weekDates
    .filter((d) => d !== sourceDate)
    .map((d) => ({
      key: d,
      willOverwrite: slots.some((s) => s.date === d && s.meal_index === mealIndex),
    }));
}
