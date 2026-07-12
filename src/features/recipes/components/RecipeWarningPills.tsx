import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { RecipeLabels } from '../labels';

interface Props {
  labels: RecipeLabels;
  className?: string;
}

/** True when the recipe carries at least one U-3 nutrition warning. */
function hasRecipeWarnings(labels: RecipeLabels): boolean {
  return labels.warnings.highSugar === true || labels.warnings.highSatFat === true;
}

/**
 * The U-3 nutrition warnings (high sugar / high saturated fat) as amber pills.
 * The canvas never drew them — they predate it and dropping them would lose the
 * only per-recipe warning surface — so they ride the canvas's pill vocabulary.
 */
export function RecipeWarningPills({ labels, className }: Props) {
  const { t } = useTranslation('recetas');
  if (!hasRecipeWarnings(labels)) return null;

  return (
    <>
      {labels.warnings.highSugar === true && (
        <span
          className={cn(
            'rounded-full bg-amber-soft px-2 py-[3px] text-[10px] font-semibold text-amber-ink',
            className,
          )}
        >
          {t('warnings.highSugar')}
        </span>
      )}
      {labels.warnings.highSatFat === true && (
        <span
          className={cn(
            'rounded-full bg-amber-soft px-2 py-[3px] text-[10px] font-semibold text-amber-ink',
            className,
          )}
        >
          {t('warnings.highSatFat')}
        </span>
      )}
    </>
  );
}
