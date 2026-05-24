import { useTranslation } from 'react-i18next';
import { SlotCell, type SlotEntry } from './SlotCell';
import { DaySummary } from './DaySummary';
import { aggregateDayMacros } from '@/features/planning/daySummary';
import { scale, ZERO_MACROS, type Macros } from '@/features/recipes/macros';
import type { PhaseType } from '@/lib/macroStatus';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

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
  onAdd: (
    day_of_week: number,
    meal_index: number,
    recipeId: string,
    recipeName: string,
    servings: number,
  ) => void;
  onUpdate: (rowId: string, recipeId: string, recipeName: string, servings: number) => void;
  onRemove: (rowId: string) => void;
  recipeMacros?: Map<string, Macros>; // per-serving macros by recipe id
  targets?: Macros;
  phaseType?: PhaseType;
  onCopyMeal?: (dayOfWeek: number, mealIndex: number) => void;
}

export function TemplateGrid({
  mealTimes,
  slots,
  onAdd,
  onUpdate,
  onRemove,
  recipeMacros,
  targets,
  phaseType,
  onCopyMeal,
}: Props) {
  const { t } = useTranslation('planning');

  const dayTotals = aggregateDayMacros(
    slots.map((s) => ({
      key: String(s.day_of_week),
      macros: scale(recipeMacros?.get(s.recipe_id) ?? ZERO_MACROS, s.servings),
    })),
  );

  function entriesFor(day: number, meal: number): SlotEntry[] {
    return slots
      .filter((s) => s.day_of_week === day && s.meal_index === meal)
      .sort((a, b) => a.display_order - b.display_order)
      .map((s) => ({
        id: s.rowId,
        recipe_id: s.recipe_id,
        recipe_name: s.recipe_name,
        servings: s.servings,
      }));
  }

  return (
    <div className="overflow-x-auto -mx-2 px-2">
      <div
        className="grid gap-2 min-w-max"
        style={{ gridTemplateColumns: `64px repeat(7, minmax(150px, 1fr))` }}
      >
        <div />
        {DAY_KEYS.map((dk) => (
          <div key={dk} className="text-sm font-semibold text-center pb-1">
            {t(`days.${dk}`)}
          </div>
        ))}
        <div className="text-xs text-muted-foreground self-start pt-2 pr-2 text-right font-semibold uppercase tracking-wide">
          {t('summary.totalRow')}
        </div>
        {DAY_KEYS.map((_, dayIdx) => (
          <div key={`total-${dayIdx}`} className="rounded-md border bg-card p-2">
            <DaySummary
              totals={dayTotals.get(String(dayIdx)) ?? ZERO_MACROS}
              targets={targets}
              phaseType={phaseType}
            />
          </div>
        ))}
        {mealTimes.map((time, mealIdx) => (
          <>
            <div
              key={`time-${mealIdx}`}
              className="text-xs text-muted-foreground tabular-nums self-center pr-2 text-right"
            >
              {time}
            </div>
            {DAY_KEYS.map((_, dayIdx) => (
              <SlotCell
                key={`slot-${mealIdx}-${dayIdx}`}
                entries={entriesFor(dayIdx, mealIdx)}
                onAdd={(recipeId, recipeName, servings) =>
                  onAdd(dayIdx, mealIdx, recipeId, recipeName, servings)
                }
                onUpdate={(rowId, recipeId, recipeName, servings) =>
                  onUpdate(rowId, recipeId, recipeName, servings)
                }
                onRemove={(rowId) => onRemove(rowId)}
                onCopy={onCopyMeal ? () => onCopyMeal(dayIdx, mealIdx) : undefined}
                copyLabel={t('slot.copy')}
              />
            ))}
          </>
        ))}
      </div>
    </div>
  );
}
