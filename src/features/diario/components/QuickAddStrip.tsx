import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
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
}

export function QuickAddStrip({ mealType, date, items }: Props) {
  const { t } = useTranslation('diario');
  const quickAdd = useQuickAddMealLog();
  const qc = useQueryClient();

  if (items.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-2">
      {items.map((it) => (
        <button
          key={it.recipeId}
          type="button"
          disabled={quickAdd.isPending}
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
          className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-accent-line bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-ink transition-colors disabled:opacity-50"
          aria-label={t('quickAdd.add', { name: it.name })}
        >
          <Plus className="h-3 w-3" />
          {it.name}
          <span className="tabular-nums text-accent-ink">
            · {it.kcalPerServing}
          </span>
        </button>
      ))}
    </div>
  );
}
