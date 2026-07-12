import { useTranslation } from 'react-i18next';
import { ingredientDisplayName, type Ingredient } from '../api';
import { formatMacro } from './IngredientMacroDots';
import { IngredientSourceBadge } from './IngredientSourceBadge';
import { IngredientVerifiedCheck } from './IngredientVerifiedCheck';
import { IngredientRowMenu } from './IngredientRowMenu';

interface Props {
  ingredients: Ingredient[];
  /** Ids I hold a `user_ingredient_refs` row for. */
  libraryIds: ReadonlySet<string>;
  userId: string | null | undefined;
  onEdit: (ing: Ingredient) => void;
  onRemove: (ing: Ingredient) => void;
}

/**
 * The web artboard's numeric table — `Ingrediente | kcal | prot | carbs | grasa
 * | fibra | Origen`, sunken uppercase header row, tabular numerals throughout.
 *
 * A real `<table>` rather than the artboard's CSS grid: the columns are a
 * numeric matrix and the header cells are what make a screen reader able to say
 * *which* number 6.7 is. `table-fixed` + per-column widths reproduce the
 * artboard's `1.2fr 70px 60px …` track list.
 *
 * Figures are per 100 g or per unit, as stored (`unit_type`) — the "por unidad"
 * rows say so on their brand line, exactly as the artboard does.
 */
export function IngredientTable({ ingredients, libraryIds, userId, onEdit, onRemove }: Props) {
  const { t, i18n } = useTranslation('ingredientes');
  const lang: 'es' | 'en' = i18n.language?.startsWith('en') ? 'en' : 'es';

  return (
    <table className="w-full table-fixed border-collapse text-[13px]">
      <thead>
        <tr className="border-b bg-muted text-cap-label">
          <th scope="col" className="px-3.5 py-2.5 text-left font-medium">
            {t('table.name')}
          </th>
          <th scope="col" className="w-[80px] px-2 py-2.5 text-right font-medium">
            {t('table.kcal')}
          </th>
          <th scope="col" className="w-[76px] px-2 py-2.5 text-right font-medium">
            {t('table.protein')}
          </th>
          <th scope="col" className="w-[76px] px-2 py-2.5 text-right font-medium">
            {t('table.carbs')}
          </th>
          <th scope="col" className="w-[76px] px-2 py-2.5 text-right font-medium">
            {t('table.fat')}
          </th>
          <th scope="col" className="w-[76px] px-2 py-2.5 text-right font-medium">
            {t('table.fiber')}
          </th>
          <th scope="col" className="w-[92px] px-2 py-2.5 text-left font-medium">
            {t('table.source')}
          </th>
          <th scope="col" className="w-[44px] px-2 py-2.5">
            <span className="sr-only">{t('list.menu')}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {ingredients.map((ing) => (
          <tr key={ing.id} className="border-b last:border-b-0">
            <td className="min-w-0 px-3.5 py-2.5">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-medium">{ingredientDisplayName(ing, lang)}</span>
                <IngredientVerifiedCheck verified={ing.is_verified} />
              </div>
              <span className="block truncate text-[10.5px] text-text-dim">
                {ing.brand ?? t('list.generic')}
                {ing.unit_type === 'unit' ? ` · ${t('list.byUnit')}` : ''}
              </span>
            </td>
            <td className="tnum px-2 py-2.5 text-right font-medium">
              {formatMacro(ing.kcal_per_unit)}
            </td>
            <td className="tnum px-2 py-2.5 text-right text-muted-foreground">
              {formatMacro(ing.protein_g_per_unit)}
            </td>
            <td className="tnum px-2 py-2.5 text-right text-muted-foreground">
              {formatMacro(ing.carbs_g_per_unit)}
            </td>
            <td className="tnum px-2 py-2.5 text-right text-muted-foreground">
              {formatMacro(ing.fat_g_per_unit)}
            </td>
            <td className="tnum px-2 py-2.5 text-right text-muted-foreground">
              {formatMacro(ing.fiber_g_per_unit)}
            </td>
            <td className="px-2 py-2.5">
              <IngredientSourceBadge source={ing.source} />
            </td>
            <td className="px-2 py-2.5">
              <IngredientRowMenu
                canEdit={userId != null && ing.created_by_user_id === userId}
                inLibrary={libraryIds.has(ing.id)}
                onEdit={() => onEdit(ing)}
                onRemove={() => onRemove(ing)}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
