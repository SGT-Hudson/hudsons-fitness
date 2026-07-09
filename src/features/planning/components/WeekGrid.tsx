import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, parseISO } from 'date-fns';
import { SlotCell, type SlotEntry } from './SlotCell';
import { DaySummary } from './DaySummary';
import { aggregateDayMacros } from '@/features/planning/daySummary';
import { ZERO_MACROS, type Macros } from '@/features/recipes/macros';
import { formatDate, type Locale } from '@/lib/dates';
import { cn } from '@/lib/utils';
import type { PhaseType } from '@/lib/macroStatus';
import type { WeekSlotWithRecipe } from '@/features/planner/api';

interface Props {
  weekStart: string;
  slots: WeekSlotWithRecipe[];
  mealTimes: string[];
  todayIso: string;
  onAdd: (
    date: string,
    mealIndex: number,
    mealTime: string | null,
    recipe: { id: string; name: string },
    servings: number,
  ) => void | Promise<void>;
  onUpdate: (
    slotId: string,
    recipe: { id: string; name: string },
    servings: number,
  ) => void | Promise<void>;
  onRemove: (slotId: string) => void | Promise<void>;
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

function toEntry(s: WeekSlotWithRecipe): SlotEntry {
  return { id: s.id, recipe_id: s.recipe_id, recipe_name: s.recipe_name, servings: s.servings };
}

export function WeekGrid({
  weekStart,
  slots,
  mealTimes,
  todayIso,
  onAdd,
  onUpdate,
  onRemove,
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

  function entriesFor(date: string, row: Row): SlotEntry[] {
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

  return (
    <div className="overflow-x-auto -mx-2 px-2">
      <div
        className="grid gap-2 min-w-max"
        style={{ gridTemplateColumns: `64px repeat(7, minmax(170px, 1fr))` }}
      >
        {/* Header row */}
        <div />
        {days.map((day) => {
          const date = parseISO(day.date);
          return (
            <div
              key={`h-${day.date}`}
              className={cn(
                'flex items-baseline justify-between gap-2 pb-1 border-b',
                day.isToday && 'border-b-2 border-primary',
                day.isPast && 'opacity-60',
              )}
            >
              <span
                className={cn(
                  'text-xs font-semibold uppercase tracking-wide',
                  day.isToday && 'text-primary',
                )}
              >
                {formatDate(date, 'EEE', locale)}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatDate(date, 'd MMM', locale)}
              </span>
            </div>
          );
        })}

        {/* TOTAL row */}
        <div className="text-xs text-muted-foreground self-start pt-2 pr-2 text-right font-semibold uppercase tracking-wide">
          {t('summary.totalRow')}
        </div>
        {days.map((day) => (
          <div
            key={`t-${day.date}`}
            className={cn(
              'rounded-md border bg-card p-2',
              day.isToday && 'ring-1 ring-primary',
              day.isPast && 'opacity-60',
            )}
          >
            <DaySummary
              totals={dayTotals.get(day.date) ?? ZERO_MACROS}
              targets={targets}
              phaseType={phaseType}
              weightKg={weightKg}
            />
          </div>
        ))}

        {/* Meal rows */}
        {allRows.map((row) => (
          <Fragment key={`row-${row.mealIndex}-${row.mealTime ?? ''}`}>
            <div className="text-xs text-muted-foreground tabular-nums self-center pr-2 text-right">
              {row.mealTime ? row.mealTime.slice(0, 5) : ''}
            </div>
            {days.map((day) => (
              <SlotCell
                key={`${day.date}-${row.mealIndex}-${row.mealTime ?? ''}`}
                entries={entriesFor(day.date, row)}
                busy={busy}
                className={cn(day.isToday && 'ring-1 ring-primary', day.isPast && 'opacity-60')}
                onAdd={(recipeId, recipeName, servings) =>
                  onAdd(day.date, row.mealIndex, row.mealTime, { id: recipeId, name: recipeName }, servings)
                }
                onUpdate={(slotId, recipeId, recipeName, servings) =>
                  onUpdate(slotId, { id: recipeId, name: recipeName }, servings)
                }
                onRemove={(slotId) => onRemove(slotId)}
                onCopy={onCopyMeal ? () => onCopyMeal(day.date, row.mealIndex) : undefined}
                copyLabel={t('slot.copy')}
              />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
