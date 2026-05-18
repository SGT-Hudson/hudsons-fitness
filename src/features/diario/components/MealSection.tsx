import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { roundMacro } from '@/features/recipes/macros';
import { computeMealLogMacros, sumMacros } from '../macros';
import type { MealLogWithJoins, MealType } from '../api';
import type { QuickAddItem } from '../quickAdd';
import { MealLogEntry } from './MealLogEntry';
import { QuickAddStrip } from './QuickAddStrip';

interface Props {
  mealType: MealType;
  date: string;
  items: MealLogWithJoins[];
  quickAddItems: QuickAddItem[];
  onAdd: (mealType: MealType) => void;
  onEdit: (log: MealLogWithJoins) => void;
}

export function MealSection({
  mealType,
  date,
  items,
  quickAddItems,
  onAdd,
  onEdit,
}: Props) {
  const { t } = useTranslation('diario');
  const subtotal =
    items.length > 0
      ? roundMacro(sumMacros(items.map(computeMealLogMacros)).kcal)
      : null;

  return (
    <Card>
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <div className="flex items-baseline gap-2">
          <h2 className="font-semibold">{t(`mealType.${mealType}`)}</h2>
          <span className="text-xs text-muted-foreground tabular-nums">
            {subtotal != null ? `${subtotal} kcal` : t('mealSection.empty')}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onAdd(mealType)}
          aria-label={t('addToMeal')}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {items.length > 0 && (
        <ul className="divide-y">
          {items.map((log) => (
            <MealLogEntry key={log.id} log={log} onEdit={onEdit} />
          ))}
        </ul>
      )}
      <QuickAddStrip mealType={mealType} date={date} items={quickAddItems} />
    </Card>
  );
}
