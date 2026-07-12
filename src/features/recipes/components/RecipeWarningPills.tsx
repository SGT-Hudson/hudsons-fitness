import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { RecipeLabels } from '../labels';

interface Props {
  labels: RecipeLabels;
  /** Applied to the group, not to each pill (so `ml-auto` lands once). */
  className?: string;
}

/** True when the recipe carries at least one U-3 nutrition warning. */
function hasRecipeWarnings(labels: RecipeLabels): boolean {
  return labels.warnings.highSugar === true || labels.warnings.highSatFat === true;
}

const PILL = 'rounded-full bg-amber-soft px-2 py-[3px] text-[10px] font-semibold text-amber-ink';

/**
 * The U-3 nutrition warnings (high sugar / high saturated fat) as amber pills.
 * The canvas never drew them — they predate it and dropping them would lose the
 * only per-recipe warning surface — so they ride the canvas's pill vocabulary.
 *
 * Renders one flex-row group (or `null` when there is nothing to warn about):
 * drop it into any flex row and it behaves as a single item, so a caller's
 * `className` (alignment, spacing) applies once — to the group.
 */
export function RecipeWarningPills({ labels, className }: Props) {
  const { t } = useTranslation('recetas');
  if (!hasRecipeWarnings(labels)) return null;

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      {labels.warnings.highSugar === true && <span className={PILL}>{t('warnings.highSugar')}</span>}
      {labels.warnings.highSatFat === true && (
        <span className={PILL}>{t('warnings.highSatFat')}</span>
      )}
    </span>
  );
}
