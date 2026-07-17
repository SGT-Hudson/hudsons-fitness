import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { HighlightedText } from '@/components/ui/HighlightedText';
import { useNum } from '@/hooks/useNum';
import { ingredientDisplayName, type Ingredient } from '../api';
import { IngredientMacroDots } from './IngredientMacroDots';
import { IngredientSourceBadge } from './IngredientSourceBadge';
import { IngredientVerifiedCheck } from './IngredientVerifiedCheck';

interface Props {
  ingredient: Ingredient;
  /** What the user typed — the matched run of the name is marked. */
  query: string;
  onSelect: () => void;
}

/**
 * A result row in the full-screen search: the same atoms as `IngredientRow`
 * (verified tick, brand, the P/C/G triad, kcal, the source badge), but the whole
 * row is the action and the name carries the match highlight.
 *
 * It is a separate component rather than a flag on `IngredientRow` because the
 * two rows disagree on their outermost element: the list row is an `<article>`
 * that *contains* a menu button, and a row-wide action would have had to nest a
 * button inside a button.
 */
export function IngredientSearchRow({ ingredient, query, onSelect }: Props) {
  const { t, i18n } = useTranslation('ingredientes');
  const num = useNum();
  const lang: 'es' | 'en' = i18n.language?.startsWith('en') ? 'en' : 'es';
  const perUnit = ingredient.unit_type === 'unit';
  const name = ingredientDisplayName(ingredient, lang);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="grid w-full grid-cols-[1fr_auto_auto_auto] items-center gap-2 rounded-[12px] border bg-card px-3 py-2.5 text-left"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[12.5px] font-semibold">
            <HighlightedText text={name} query={query} />
          </span>
          <IngredientVerifiedCheck verified={ingredient.is_verified} />
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-2">
          {ingredient.brand && (
            <span className="max-w-[35%] truncate text-[10.5px] text-text-dim">
              {ingredient.brand}
            </span>
          )}
          <IngredientMacroDots ingredient={ingredient} />
        </div>
      </div>

      <div className="flex flex-col items-end leading-[1.2]">
        <span className="tnum text-[12.5px] font-medium">
          {num.qty(ingredient.kcal_per_unit, 1)}
        </span>
        <span className="text-[9.5px] text-text-dim">
          {t('list.kcalUnit')} {perUnit ? t('list.perUnit') : t('list.per100g')}
        </span>
      </div>

      <IngredientSourceBadge source={ingredient.source} />

      <ChevronRight className="size-[15px] shrink-0 text-text-dim" aria-hidden="true" />
    </button>
  );
}
