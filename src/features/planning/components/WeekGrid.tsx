import { useTranslation } from 'react-i18next';
import { addDays, parseISO } from 'date-fns';
import { SlotCell, type SlotEntry } from './SlotCell';
import { DaySummary } from './DaySummary';
import { aggregateDayMacros } from '@/features/planning/daySummary';
import { ZERO_MACROS, type Macros } from '@/features/recipes/macros';
import { formatDate, type Locale } from '@/lib/dates';
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
  onCopyMeal?: (date: string, mealIndex: number) => void;
}

interface Period {
  mealIndex: number;
  mealTime: string | null;
  entries: SlotEntry[];
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
  onCopyMeal,
}: Props) {
  const { t, i18n } = useTranslation('planning');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;

  const weekStartDate = parseISO(weekStart);
  const days = Array.from({ length: 7 }, (_, i) => {
    const iso = formatDate(addDays(weekStartDate, i), 'yyyy-MM-dd', locale);
    return { date: iso, isPast: iso < todayIso };
  });

  const slotsByDay = new Map<string, WeekSlotWithRecipe[]>();
  for (const s of slots) {
    const arr = slotsByDay.get(s.date) ?? [];
    arr.push(s);
    slotsByDay.set(s.date, arr);
  }

  const dayTotals = aggregateDayMacros(slots.map((s) => ({ key: s.date, macros: s.macros })));

  function periodsFor(date: string): Period[] {
    const daySlots = slotsByDay.get(date) ?? [];
    // One period per configured meal time (always shown, even empty).
    const periods: Period[] = mealTimes.map((time, i) => ({
      mealIndex: i,
      mealTime: time,
      entries: daySlots.filter((s) => s.meal_index === i).map(toEntry),
    }));
    // Orphan slots: meal_index beyond the configured meal_times (divergent week) —
    // grouped + appended so no planned data is hidden.
    const orphans = new Map<string, Period>();
    for (const s of daySlots) {
      if (s.meal_index < mealTimes.length) continue;
      const key = `${s.meal_index}|${s.meal_time ?? ''}`;
      const b = orphans.get(key) ?? { mealIndex: s.meal_index, mealTime: s.meal_time, entries: [] };
      b.entries.push(toEntry(s));
      orphans.set(key, b);
    }
    const orphanList = Array.from(orphans.values()).sort(
      (a, b) => a.mealIndex - b.mealIndex || (a.mealTime ?? '').localeCompare(b.mealTime ?? ''),
    );
    return [...periods, ...orphanList];
  }

  return (
    <div className="overflow-x-auto -mx-2 px-2">
      <div
        className="grid gap-2 min-w-max"
        style={{ gridTemplateColumns: `repeat(7, minmax(170px, 1fr))` }}
      >
        {days.map((day) => {
          const date = parseISO(day.date);
          const isToday = day.date === todayIso;
          const periods = periodsFor(day.date);
          return (
            <div
              key={day.date}
              className={
                'rounded-md border bg-card p-2 space-y-2 ' +
                (isToday ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : '') +
                (day.isPast ? ' opacity-70' : '')
              }
            >
              <div className="flex items-baseline justify-between gap-2 pb-1 border-b">
                <span className="text-xs font-semibold uppercase tracking-wide">
                  {formatDate(date, 'EEE', locale)}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatDate(date, 'd MMM', locale)}
                </span>
              </div>

              {periods.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">{t('week.noSlots')}</p>
              ) : (
                periods.map((p) => (
                  <SlotCell
                    key={`${day.date}-${p.mealIndex}-${p.mealTime ?? ''}`}
                    mealLabel={p.mealTime ? p.mealTime.slice(0, 5) : undefined}
                    entries={p.entries}
                    busy={busy}
                    onAdd={(recipeId, recipeName, servings) =>
                      onAdd(day.date, p.mealIndex, p.mealTime, { id: recipeId, name: recipeName }, servings)
                    }
                    onUpdate={(slotId, recipeId, recipeName, servings) =>
                      onUpdate(slotId, { id: recipeId, name: recipeName }, servings)
                    }
                    onRemove={(slotId) => onRemove(slotId)}
                    onCopy={onCopyMeal ? () => onCopyMeal(day.date, p.mealIndex) : undefined}
                    copyLabel={t('slot.copy')}
                  />
                ))
              )}

              <DaySummary
                totals={dayTotals.get(day.date) ?? ZERO_MACROS}
                targets={targets}
                phaseType={phaseType}
                className="pt-2 border-t mt-1"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
