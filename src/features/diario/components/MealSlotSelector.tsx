import { useTranslation } from 'react-i18next';
import { roundMacro } from '@/features/recipes/macros';
import { cn } from '@/lib/utils';
import type { MealType } from '../api';

// The add-flow only ever targets one of the four "real" meal slots — 'other'
// is a fallback bucket for legacy/edited entries and isn't a valid add target.
export const ADD_SHEET_MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner'];

export type MealSubtotals = Partial<Record<MealType, number>>;

interface Props {
  value: MealType;
  onChange: (mealType: MealType) => void;
  subtotals: MealSubtotals;
}

/**
 * The "Añadir a hoy" sheet's meal-slot picker: one chip per real meal slot
 * showing its current kcal subtotal, the active slot highlighted. Pure and
 * prop-driven — the caller owns the selected slot and the subtotal figures.
 */
export function MealSlotSelector({ value, onChange, subtotals }: Props) {
  const { t } = useTranslation('diario');

  return (
    <div
      role="radiogroup"
      aria-label={t('addSheet.slotLabel')}
      className="grid grid-cols-4 gap-1.5"
    >
      {ADD_SHEET_MEAL_TYPES.map((mt) => {
        const selected = mt === value;
        const kcal = subtotals[mt];
        return (
          <button
            key={mt}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(mt)}
            className={cn(
              'flex flex-col items-start gap-0.5 rounded-[9px] px-2 py-1.5 text-left',
              selected
                ? 'border-[1.5px] border-accent bg-accent-soft'
                : 'border border-border bg-muted',
            )}
          >
            <span
              className={cn(
                'text-[11px] font-semibold',
                selected ? 'text-accent-ink' : 'text-foreground',
              )}
            >
              {t(`mealType.${mt}`)}
            </span>
            <span
              className={cn(
                'tabular-nums text-[9.5px]',
                selected ? 'text-accent-ink' : 'text-muted-foreground',
              )}
            >
              {kcal ? roundMacro(kcal) : t('addSheet.slotEmpty')}
            </span>
          </button>
        );
      })}
    </div>
  );
}
