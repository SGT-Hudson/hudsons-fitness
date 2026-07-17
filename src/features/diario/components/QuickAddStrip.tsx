import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useNum } from '@/hooks/useNum';
import {
  useQuickAddMealLog,
  deleteMealLog,
  toastUndoableQuickAdd,
} from '../hooks';
import type { QuickAddItem } from '../quickAdd';
import type { MealType } from '../api';

interface Props {
  mealType: MealType;
  date: string;
  items: QuickAddItem[];
  onAddRecipe: () => void;
}

const CHIP_CAP = 3;
const NAME_TRUNCATE_AT = 20;
const NAME_TRUNCATE_TO = 17;

function truncateName(name: string): string {
  return name.length > NAME_TRUNCATE_AT
    ? `${name.slice(0, NAME_TRUNCATE_TO)}…`
    : name;
}

export function QuickAddStrip({ mealType, date, items, onAddRecipe }: Props) {
  const { t } = useTranslation('diario');
  const num = useNum();
  const quickAdd = useQuickAddMealLog();
  const qc = useQueryClient();

  const chips = items.slice(0, CHIP_CAP);

  return (
    <div className="hidden items-center gap-2 border-t border-border bg-muted px-3.5 py-2.5 md:flex">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {chips.length > 0 && (
          <>
            <span className="mr-1 shrink-0 text-[10.5px] font-semibold uppercase tracking-wide text-text-dim">
              {t('quickAdd.recommendations')}
            </span>
            {chips.map((it) => (
              <button
                key={it.recipeId}
                type="button"
                disabled={quickAdd.isPending}
                title={it.name}
                onClick={() =>
                  quickAdd.mutate(
                    { recipeId: it.recipeId, mealType, loggedOn: date },
                    {
                      onSuccess: (created) =>
                        toastUndoableQuickAdd(it.name, () => {
                          void deleteMealLog(created.id).then(() => {
                            void qc.invalidateQueries({ queryKey: ['meal_logs'] });
                            void qc.invalidateQueries({ queryKey: ['quick_add'] });
                          });
                        }),
                    },
                  )
                }
                className="flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-accent-line bg-accent-soft px-3 text-xs font-semibold text-accent-ink transition-colors disabled:opacity-50"
                aria-label={t('quickAdd.add', { name: it.name })}
              >
                <Plus className="h-3 w-3" />
                {truncateName(it.name)}
                <span className="tabular-nums text-accent-ink">
                  · {num.qty(it.kcalPerServing)}
                </span>
              </button>
            ))}
          </>
        )}
      </div>
      <Button
        type="button"
        variant="default"
        size="sm"
        onClick={onAddRecipe}
        className="shrink-0 gap-1.5 text-xs"
      >
        <Plus className="h-3.5 w-3.5" />
        {t('quickAdd.addRecipe')}
      </Button>
    </div>
  );
}
