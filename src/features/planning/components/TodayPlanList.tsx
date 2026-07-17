import { useTranslation } from 'react-i18next';
import { Copy, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { mealLabelKey } from '@/features/planning/weekSummary';
import { add, roundMacro, ZERO_MACROS, type Macros } from '@/features/recipes/macros';
import { useNum } from '@/hooks/useNum';
import type { PlannerCellEntry } from './PlannerMealCell';

export interface TodayMeal {
  mealIndex: number;
  mealTime: string | null;
  entries: PlannerCellEntry[];
}

interface Props {
  meals: TodayMeal[];
  onAddMeal: (mealIndex: number, mealTime: string | null) => void;
  onCopyMeal: (mealIndex: number) => void;
  onOpenEntry: (entry: PlannerCellEntry) => void;
  busy?: boolean;
  className?: string;
}

/** P · C · G triad under a recipe row — macro identity colours, not tone. */
function MacroTriad({ entryId, macros }: { entryId: string; macros: Macros }) {
  const { t } = useTranslation('planning');
  const num = useNum();
  return (
    <div data-triad={entryId} className="tnum mt-0.5 flex items-baseline gap-2 text-[10px]">
      <span className="text-macro-p">
        {num.qty(roundMacro(macros.proteinG))} <span className="opacity-70">{t('summary.letter.protein')}</span>
      </span>
      <span className="text-macro-c">
        {num.qty(roundMacro(macros.carbsG))} <span className="opacity-70">{t('summary.letter.carbs')}</span>
      </span>
      <span className="text-macro-g">
        {num.qty(roundMacro(macros.fatG))} <span className="opacity-70">{t('summary.letter.fat')}</span>
      </span>
    </div>
  );
}

/**
 * Today's planned meals (canvas `PlanificadorMobileV2`): one block per meal —
 * name, time, kcal subtotal, copy affordance — then a row per planned recipe.
 * Empty meals keep their header so the day's shape stays visible.
 */
export function TodayPlanList({
  meals,
  onAddMeal,
  onCopyMeal,
  onOpenEntry,
  busy,
  className,
}: Props) {
  const { t } = useTranslation('planning');
  const num = useNum();
  const nextFreeMeal = meals.find((m) => m.entries.length === 0) ?? meals[meals.length - 1];

  function mealLabel(mealIndex: number): string {
    const { key, params } = mealLabelKey(mealIndex);
    return t(key, params ?? {});
  }

  return (
    <div className={cn('overflow-hidden rounded-md border bg-card', className)}>
      {meals.length === 0 && (
        <p className="p-4 text-center text-sm text-muted-foreground">{t('planner.noPlanToday')}</p>
      )}

      {meals.map((meal, i) => {
        const total = meal.entries.reduce<Macros>((acc, e) => add(acc, e.macros), ZERO_MACROS);
        return (
          <div key={`${meal.mealIndex}-${meal.mealTime ?? ''}`} className={cn(i > 0 && 'border-t')}>
            <div className="flex items-center gap-1.5 px-3.5 pt-2.5">
              <span className="text-[10px] font-semibold text-muted-foreground">
                {mealLabel(meal.mealIndex)}
              </span>
              {meal.mealTime && (
                <span className="tnum text-[9.5px] text-text-dim">{meal.mealTime.slice(0, 5)}</span>
              )}
              <span className="tnum ml-auto text-[13px] font-semibold">
                {num.qty(roundMacro(total.kcal))}
              </span>
              {meal.entries.length > 0 && (
                <button
                  type="button"
                  onClick={() => onCopyMeal(meal.mealIndex)}
                  aria-label={t('slot.copy')}
                  title={t('slot.copy')}
                  disabled={busy}
                  className="grid h-6 w-6 place-items-center rounded-md border text-text-dim"
                >
                  <Copy className="h-3 w-3" />
                </button>
              )}
            </div>

            {meal.entries.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => onOpenEntry(e)}
                className="flex w-full items-center gap-2.5 px-3.5 py-1.5 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium">
                    {e.recipe_name}
                    {e.servings !== 1 && (
                      <span className="tnum ml-1 text-[11px] text-text-dim">×{num.qty(e.servings)}</span>
                    )}
                  </div>
                  <MacroTriad entryId={e.id} macros={e.macros} />
                </div>
                <span className="tnum text-[11.5px] text-muted-foreground">
                  {num.qty(roundMacro(e.macros.kcal))}
                </span>
              </button>
            ))}

            {meal.entries.length === 0 && (
              <button
                type="button"
                onClick={() => onAddMeal(meal.mealIndex, meal.mealTime)}
                disabled={busy}
                aria-label={`${mealLabel(meal.mealIndex)}: ${t('cell.addFirst')}`}
                className="flex w-full items-center gap-1.5 px-3.5 pb-2.5 pt-1 text-[11.5px] text-text-dim"
              >
                <Plus className="h-3 w-3" aria-hidden="true" />
                {t('cell.addFirst')}
              </button>
            )}
          </div>
        );
      })}

      {meals.length > 0 && (
        <button
          type="button"
          onClick={() => onAddMeal(nextFreeMeal.mealIndex, nextFreeMeal.mealTime)}
          disabled={busy}
          className="flex w-full items-center gap-2 border-t px-3.5 py-2.5 text-[12.5px] font-semibold text-accent-ink"
        >
          <span className="grid h-[22px] w-[22px] place-items-center rounded-md bg-accent-soft">
            <Plus className="h-3 w-3 text-accent" />
          </span>
          {t('planner.addMeal')}
        </button>
      )}
    </div>
  );
}
