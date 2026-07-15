import { Fragment, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DayHeaderCard } from './DayHeaderCard';
import { PlannerMealCell, type PlannerCellEntry } from './PlannerMealCell';
import { mealLabelKey } from '@/features/planning/weekSummary';
import { templateWeekdayLabels, templateDayTotals } from '@/features/templates/templateWeek';
import { scale, ZERO_MACROS, type Macros } from '@/features/recipes/macros';
import type { Locale } from '@/lib/dates';
import type { PhaseType } from '@/core/nutritionTone';

export interface TemplateSlotInput {
  rowId: string;
  day_of_week: number;
  meal_index: number;
  recipe_id: string;
  recipe_name: string;
  servings: number;
  display_order: number;
}

interface Props {
  mealTimes: string[];
  slots: TemplateSlotInput[];
  /** An empty cell's add affordance — the page opens its one picker on that slot. */
  onAddRequest: (dayOfWeek: number, mealIndex: number) => void;
  /** A recipe bullet — the page opens its one picker on that entry. */
  onOpenEntry: (entry: PlannerCellEntry, dayOfWeek: number, mealIndex: number) => void;
  recipeMacros?: Map<string, Macros>; // per-serving macros by recipe id
  targets?: Macros;
  phaseType?: PhaseType;
  weightKg?: number;
  onCopyMeal?: (dayOfWeek: number, mealIndex: number) => void;
}

function toEntry(s: TemplateSlotInput, recipeMacros: Map<string, Macros>): PlannerCellEntry {
  return {
    id: s.rowId,
    recipe_id: s.recipe_id,
    recipe_name: s.recipe_name,
    servings: s.servings,
    macros: scale(recipeMacros.get(s.recipe_id) ?? ZERO_MACROS, s.servings),
  };
}

/**
 * The web template grid (R-33 wave 4): the same `92px + 7` matrix as the
 * planner's `WeekGrid`, projected onto `day_of_week` (0-6, 0 = Monday) instead
 * of real dates — a template has no dates of its own. `templateWeekdayLabels`
 * derives the 7 weekday names presentationally, purely to drive
 * `DayHeaderCard`'s label; no date ever reaches the DB.
 * No "today" outline and no past-day dimming — a template has no today.
 */
export function TemplateGrid({
  mealTimes,
  slots,
  onAddRequest,
  onOpenEntry,
  recipeMacros,
  targets,
  phaseType,
  weightKg,
  onCopyMeal,
}: Props) {
  const { t, i18n } = useTranslation('planning');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;

  const macrosMap = recipeMacros ?? new Map<string, Macros>();
  const dayLabels = useMemo(() => templateWeekdayLabels(locale), [locale]);
  const dayTotals = templateDayTotals(slots, macrosMap);

  function entriesFor(dayOfWeek: number, mealIndex: number): PlannerCellEntry[] {
    return slots
      .filter((s) => s.day_of_week === dayOfWeek && s.meal_index === mealIndex)
      .sort((a, b) => a.display_order - b.display_order)
      .map((s) => toEntry(s, macrosMap));
  }

  function mealLabel(mealIndex: number): string {
    const { key, params } = mealLabelKey(mealIndex);
    return t(key, params ?? {});
  }

  return (
    <div className="-mx-2 overflow-x-auto px-2">
      <div
        className="grid min-w-max gap-1.5"
        style={{ gridTemplateColumns: '92px repeat(7, minmax(150px, 1fr))' }}
      >
        {/* Day headers */}
        <div />
        {dayLabels.map((label, dayOfWeek) => (
          <DayHeaderCard
            key={`h-${dayOfWeek}`}
            label={label}
            isToday={false}
            totals={dayTotals.get(dayOfWeek) ?? ZERO_MACROS}
            targets={targets}
            phaseType={phaseType}
            weightKg={weightKg}
          />
        ))}

        {/* Meal rows */}
        {mealTimes.map((time, mealIndex) => (
          <Fragment key={`row-${mealIndex}`}>
            <div className="flex flex-col justify-center px-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
                {mealLabel(mealIndex)}
              </span>
              <span className="tnum mt-0.5 text-[10px] text-text-dim opacity-70">
                {time.slice(0, 5)}
              </span>
            </div>
            {dayLabels.map((_, dayOfWeek) => (
              <PlannerMealCell
                key={`${dayOfWeek}-${mealIndex}`}
                entries={entriesFor(dayOfWeek, mealIndex)}
                onAddRequest={() => onAddRequest(dayOfWeek, mealIndex)}
                onOpenEntry={(entry) => onOpenEntry(entry, dayOfWeek, mealIndex)}
                onCopy={onCopyMeal ? () => onCopyMeal(dayOfWeek, mealIndex) : undefined}
              />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
