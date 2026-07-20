import { useTranslation } from 'react-i18next';
import { useNum } from '@/hooks/useNum';
import { cn } from '@/lib/utils';
import type { Ingredient } from '../api';

const DOT = {
  protein: 'bg-macro-p',
  carbs: 'bg-macro-c',
  fat: 'bg-macro-g',
} as const;

interface Props {
  ingredient: Ingredient;
  className?: string;
}

/**
 * The mobile row's P/C/G triad with the shared macro identity dots — the
 * ingredient sibling of `RecipeMacroDots` (same tokens, same shape; it takes a
 * per-serving `Macros` and speaks the `recetas` namespace, so it is not reused
 * verbatim across the feature boundary).
 *
 * Values are per 100 g or per unit — whatever `unit_type` says the row's
 * figures already are; nothing is re-derived here (`core/macros.ts` owns the
 * divisor rule and stays frozen). One decimal, trimmed: the stored figures are
 * fine-grained (6.7 g of protein in raw rice) and rounding them to whole grams
 * on a 100 g basis would visibly lie.
 */
export function IngredientMacroDots({ ingredient, className }: Props) {
  const { t } = useTranslation('ingredientes');
  const num = useNum();
  const items = [
    { key: 'protein', value: ingredient.protein_g_per_unit },
    { key: 'carbs', value: ingredient.carbs_g_per_unit },
    { key: 'fat', value: ingredient.fat_g_per_unit },
  ] as const;

  return (
    <div
      className={cn(
        'tnum flex flex-wrap items-center gap-2 text-[10.5px] text-text-dim',
        className,
      )}
    >
      {items.map(({ key, value }) => (
        <span key={key} className="inline-flex items-center gap-1">
          <span className={cn('size-[6px] shrink-0 rounded-full', DOT[key])} aria-hidden="true" />
          {t(`macros.letter.${key}`)} {num.qty(value, 1)}
        </span>
      ))}
    </div>
  );
}
