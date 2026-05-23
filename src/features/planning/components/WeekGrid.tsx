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
}

interface DayBucket {
  date: string;
  isPast: boolean;
  meals: Map<string, { mealIndex: number; mealTime: string | null; entries: SlotEntry[] }>;
}

export function WeekGrid({
  weekStart,
  slots,
  todayIso,
  onAdd,
  onUpdate,
  onRemove,
  busy,
  targets,
  phaseType,
}: Props) {
  const { t, i18n } = useTranslation('planning');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;

  const weekStartDate = parseISO(weekStart);
  const days: DayBucket[] = [];
  for (let i = 0; i < 7; i += 1) {
    const d = addDays(weekStartDate, i);
    const iso = formatDate(d, 'yyyy-MM-dd', locale);
    days.push({
      date: iso,
      isPast: iso < todayIso,
      meals: new Map(),
    });
  }

  for (const s of slots) {
    const day = days.find((d) => d.date === s.date);
    if (!day) continue;
    const key = `${s.meal_index}|${s.meal_time ?? ''}`;
    const bucket = day.meals.get(key) ?? {
      mealIndex: s.meal_index,
      mealTime: s.meal_time,
      entries: [],
    };
    bucket.entries.push({
      id: s.id,
      recipe_id: s.recipe_id,
      recipe_name: s.recipe_name,
      servings: s.servings,
    });
    day.meals.set(key, bucket);
  }

  const dayTotals = aggregateDayMacros(slots.map((s) => ({ key: s.date, macros: s.macros })));

  return (
    <div className="overflow-x-auto -mx-2 px-2">
      <div
        className="grid gap-2 min-w-max"
        style={{ gridTemplateColumns: `repeat(7, minmax(170px, 1fr))` }}
      >
        {days.map((day) => {
          const date = parseISO(day.date);
          const isToday = day.date === todayIso;
          const buckets = Array.from(day.meals.values()).sort(
            (a, b) =>
              a.mealIndex - b.mealIndex ||
              (a.mealTime ?? '').localeCompare(b.mealTime ?? ''),
          );
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
              <DaySummary
                totals={dayTotals.get(day.date) ?? ZERO_MACROS}
                targets={targets}
                phaseType={phaseType}
                className="pb-2 border-b"
              />
              {buckets.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">{t('week.noSlots')}</p>
              ) : (
                buckets.map((bucket) => (
                  <SlotCell
                    key={`${day.date}-${bucket.mealIndex}-${bucket.mealTime ?? ''}`}
                    mealLabel={bucket.mealTime ? bucket.mealTime.slice(0, 5) : undefined}
                    entries={bucket.entries}
                    busy={busy}
                    onAdd={(recipeId, recipeName, servings) =>
                      onAdd(
                        day.date,
                        bucket.mealIndex,
                        bucket.mealTime,
                        { id: recipeId, name: recipeName },
                        servings,
                      )
                    }
                    onUpdate={(slotId, recipeId, recipeName, servings) =>
                      onUpdate(slotId, { id: recipeId, name: recipeName }, servings)
                    }
                    onRemove={(slotId) => onRemove(slotId)}
                  />
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
