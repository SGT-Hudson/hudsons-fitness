import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, parseISO } from 'date-fns';
import { DayHeaderCard } from './DayHeaderCard';
import { PlannerMealCell, type PlannerCellEntry } from './PlannerMealCell';
import { mealLabelKey } from '@/features/planning/weekSummary';
import { aggregateDayMacros } from '@/features/planning/daySummary';
import { ZERO_MACROS, type Macros } from '@/features/recipes/macros';
import { formatDate, type Locale } from '@/lib/dates';
import { cn } from '@/lib/utils';
import type { PhaseType } from '@/core/nutritionTone';
import type { WeekSlotWithRecipe } from '@/features/planner/api';

interface Props {
  weekStart: string;
  slots: WeekSlotWithRecipe[];
  mealTimes: string[];
  todayIso: string;
  /** A cell's add affordance — the page opens its one add drawer on that slot. */
  onAddRequest: (date: string, mealIndex: number, mealTime: string | null) => void;
  /** A recipe bullet — the page opens its one recipe peek on that entry. */
  onOpenEntry: (
    entry: PlannerCellEntry,
    date: string,
    mealIndex: number,
    mealTime: string | null,
  ) => void;
  busy?: boolean;
  targets?: Macros;
  phaseType?: PhaseType;
  weightKg?: number;
  onCopyMeal?: (date: string, mealIndex: number) => void;
}

interface Row {
  mealIndex: number;
  mealTime: string | null;
}

function toEntry(s: WeekSlotWithRecipe): PlannerCellEntry {
  return {
    id: s.id,
    recipe_id: s.recipe_id,
    recipe_name: s.recipe_name,
    servings: s.servings,
    macros: s.macros,
  };
}

/**
 * The web weekly grid (canvas `PlanificadorWebV2`): a `92px + 7` matrix of
 * tone-aware day headers over one row per configured meal time. The day header
 * carries the day totals, so there is no separate TOTAL row any more.
 */
export function WeekGrid({
  weekStart,
  slots,
  mealTimes,
  todayIso,
  onAddRequest,
  onOpenEntry,
  busy,
  targets,
  phaseType,
  weightKg,
  onCopyMeal,
}: Props) {
  const { t, i18n } = useTranslation('planning');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;

  const weekStartDate = parseISO(weekStart);
  const days = Array.from({ length: 7 }, (_, i) => {
    const iso = formatDate(addDays(weekStartDate, i), 'yyyy-MM-dd', locale);
    return { date: iso, isToday: iso === todayIso, isPast: iso < todayIso };
  });

  // Row model: one row per configured meal time, then orphan rows (slots whose
  // meal_index is beyond the configured times — divergent weeks), built from the
  // union of (meal_index, meal_time) across the week so the matrix stays aligned.
  const rows: Row[] = mealTimes.map((time, i) => ({ mealIndex: i, mealTime: time }));
  const orphans = new Map<string, Row>();
  for (const s of slots) {
    if (s.meal_index < mealTimes.length) continue;
    const key = `${s.meal_index}|${s.meal_time ?? ''}`;
    if (!orphans.has(key)) orphans.set(key, { mealIndex: s.meal_index, mealTime: s.meal_time });
  }
  const orphanRows = Array.from(orphans.values()).sort(
    (a, b) => a.mealIndex - b.mealIndex || (a.mealTime ?? '').localeCompare(b.mealTime ?? ''),
  );
  const allRows = [...rows, ...orphanRows];

  const dayTotals = aggregateDayMacros(slots.map((s) => ({ key: s.date, macros: s.macros })));

  function entriesFor(date: string, row: Row): PlannerCellEntry[] {
    return slots
      .filter(
        (s) =>
          s.date === date &&
          s.meal_index === row.mealIndex &&
          (s.meal_time ?? '') === (row.mealTime ?? ''),
      )
      .sort((a, b) => a.display_order - b.display_order)
      .map(toEntry);
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
        {days.map((day) => (
          <DayHeaderCard
            key={`h-${day.date}`}
            dateIso={day.date}
            isToday={day.isToday}
            isPast={day.isPast}
            totals={dayTotals.get(day.date) ?? ZERO_MACROS}
            targets={targets}
            phaseType={phaseType}
            weightKg={weightKg}
          />
        ))}

        {/* Meal rows */}
        {allRows.map((row) => (
          <Fragment key={`row-${row.mealIndex}-${row.mealTime ?? ''}`}>
            <div className="flex flex-col justify-center px-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
                {mealLabel(row.mealIndex)}
              </span>
              {row.mealTime && (
                <span className="tnum mt-0.5 text-[10px] text-text-dim opacity-70">
                  {row.mealTime.slice(0, 5)}
                </span>
              )}
            </div>
            {days.map((day) => (
              <PlannerMealCell
                key={`${day.date}-${row.mealIndex}-${row.mealTime ?? ''}`}
                entries={entriesFor(day.date, row)}
                busy={busy}
                className={cn(day.isToday && 'border-text-dim', day.isPast && 'opacity-60')}
                onAddRequest={() => onAddRequest(day.date, row.mealIndex, row.mealTime)}
                onOpenEntry={(entry) =>
                  onOpenEntry(entry, day.date, row.mealIndex, row.mealTime)
                }
                onCopy={onCopyMeal ? () => onCopyMeal(day.date, row.mealIndex) : undefined}
              />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
