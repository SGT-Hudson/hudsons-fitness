// Pure day-of-week/date bridge for the template editor. A template's slots
// carry `day_of_week` (0-6, 0 = Monday) and no date at all — the editor
// reuses the planner's date-based header/cell components by projecting those
// indices onto a *reference Monday*'s dates, purely for presentation. These
// dates never reach the DB and no slot ever stores one (R-33 wave 4).

import { addDays } from 'date-fns';
import { isoDate, mondayOf } from '@/lib/dates';
import { add, scale, ZERO_MACROS, type Macros } from '@/features/recipes/macros';

/** The 7 ISO dates of `reference`'s Monday-based week, index = day_of_week. */
export function templateWeekDates(reference: Date): string[] {
  const monday = mondayOf(reference);
  return Array.from({ length: 7 }, (_, i) => isoDate(addDays(monday, i)));
}

/** `day_of_week` for an ISO date within the week `templateWeekDates` produced. */
export function dayOfWeekFor(dateIso: string, weekDates: string[]): number {
  return weekDates.indexOf(dateIso);
}

/**
 * Per-day macro totals for the editor's headers: `servings` × the recipe's
 * per-serving macros, summed per `day_of_week`. A slot whose recipe hasn't
 * loaded yet (recipes load async) is missing from `recipeMacros` and
 * contributes zero, never `NaN`. Days with no slots are absent from the map.
 */
export function templateDayTotals(
  slots: { day_of_week: number; recipe_id: string; servings: number }[],
  recipeMacros: Map<string, Macros>,
): Map<number, Macros> {
  const totals = new Map<number, Macros>();
  for (const slot of slots) {
    const perServing = recipeMacros.get(slot.recipe_id) ?? ZERO_MACROS;
    const contribution = scale(perServing, slot.servings);
    totals.set(slot.day_of_week, add(totals.get(slot.day_of_week) ?? ZERO_MACROS, contribution));
  }
  return totals;
}
