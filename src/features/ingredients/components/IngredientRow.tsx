import { useTranslation } from 'react-i18next';
import { useNum } from '@/hooks/useNum';
import { ingredientDisplayName, type Ingredient } from '../api';
import { IngredientMacroDots } from './IngredientMacroDots';
import { IngredientSourceBadge } from './IngredientSourceBadge';
import { IngredientVerifiedCheck } from './IngredientVerifiedCheck';
import { IngredientRowMenu } from './IngredientRowMenu';

interface Props {
  ingredient: Ingredient;
  canEdit: boolean;
  inLibrary: boolean;
  onEdit: () => void;
  onRemove: () => void;
}

/**
 * The mobile artboard's ingredient row: name + verified tick, then brand and
 * the P/C/G dot triad, with kcal and the source badge pinned right.
 *
 * The artboard's rows carry no action — but the only way to drop an ingredient
 * from your library lives in a menu, so the kebab from the web artboard's table
 * comes along (it hides itself when neither action applies).
 */
export function IngredientRow({ ingredient, canEdit, inLibrary, onEdit, onRemove }: Props) {
  const { t, i18n } = useTranslation('ingredientes');
  const num = useNum();
  const lang: 'es' | 'en' = i18n.language?.startsWith('en') ? 'en' : 'es';
  const perUnit = ingredient.unit_type === 'unit';

  return (
    <article className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <h3 className="truncate text-[12.5px] font-medium">
            {ingredientDisplayName(ingredient, lang)}
          </h3>
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
        <span className="tnum text-[12.5px] font-medium">{num.qty(ingredient.kcal_per_unit, 1)}</span>
        <span className="text-[9.5px] text-text-dim">
          {t('list.kcalUnit')} {perUnit ? t('list.perUnit') : t('list.per100g')}
        </span>
      </div>

      <IngredientSourceBadge source={ingredient.source} />

      <IngredientRowMenu
        canEdit={canEdit}
        inLibrary={inLibrary}
        onEdit={onEdit}
        onRemove={onRemove}
        className="-mr-1"
      />
    </article>
  );
}
