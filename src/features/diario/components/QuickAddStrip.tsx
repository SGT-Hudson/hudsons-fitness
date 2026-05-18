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
          className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-100 disabled:opacity-50 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-300"
          aria-label={t('quickAdd.add', { name: it.name })}
        >
          <Plus className="h-3 w-3" />
          {it.name}
          <span className="tabular-nums text-sky-500 dark:text-sky-400">
            · {it.kcalPerServing}
          </span>
        </button>
      ))}
    </div>
  );
}
