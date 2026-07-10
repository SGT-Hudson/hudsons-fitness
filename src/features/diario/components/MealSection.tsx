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
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <h2 className="text-[13.5px] font-semibold">{t(`mealType.${mealType}`)}</h2>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground tabular-nums">
          {subtotal != null ? (
            <>
              <span className="font-medium text-foreground">{subtotal}</span> kcal
            </>
          ) : (
            t('mealSection.empty')
          )}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onAdd(mealType)}
          aria-label={t('addToMeal')}
          className="h-[26px] w-[26px] shrink-0 rounded-[8px] bg-accent-soft text-accent-ink hover:bg-accent-soft/80 hover:text-accent-ink"
        >
          <Plus className="h-[13px] w-[13px]" />
        </Button>
      </div>
      {items.length > 0 && (
        <ul className="divide-y border-t">
          {items.map((log) => (
            <MealLogEntry key={log.id} log={log} onEdit={onEdit} />
          ))}
        </ul>
      )}
      <QuickAddStrip
        mealType={mealType}
        date={date}
        items={quickAddItems}
        onAddRecipe={() => onAdd(mealType)}
      />
    </Card>
  );
}
