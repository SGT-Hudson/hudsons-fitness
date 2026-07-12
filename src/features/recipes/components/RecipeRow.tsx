import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import type { RecipeListItem } from '../api';
import { RecipeMediaPlaceholder } from './RecipeMediaPlaceholder';
import { RecipeMacroDots } from './RecipeMacroDots';
import { RecipeWarningPills } from './RecipeWarningPills';
import { RecipeFavoritePin } from './RecipeFavoritePin';
import { RecipeCardMenu } from './RecipeCardMenu';

interface Props {
  recipe: RecipeListItem;
  favorite: boolean;
  /** Only the recipe's creator can save an edit (R-01) — see `ownership.ts`. */
  canEdit: boolean;
  onToggleFavorite: () => void;
  onRemove: () => void;
  /** Opens the wave-2 add-to-day sheet on this recipe. */
  onAddToDay: () => void;
}

/**
 * The mobile artboard's row card (`RecetasMobile`): a 96px media thumbnail on
 * the left (favourite pin inset top-left), then the name, kcal/ración + the
 * ingredient count, the macro dot triad, and the "+ añadir al diario" CTA —
 * which opens the existing wave-2 `AddToDaySheet`, not a second sheet.
 *
 * Same stretched-link anatomy as the web card: the name owns the whole row, the
 * pin / menu / CTA sit above it.
 */
export function RecipeRow({
  recipe,
  favorite,
  canEdit,
  onToggleFavorite,
  onRemove,
  onAddToDay,
}: Props) {
  const { t } = useTranslation('recetas');

  return (
    <article className="relative flex min-h-[96px] overflow-hidden rounded-[14px] border bg-card">
      <div className="relative w-24 shrink-0 self-stretch">
        <RecipeMediaPlaceholder recipeId={recipe.id} variant="thumbnail" />
        <RecipeFavoritePin
          favorite={favorite}
          onToggle={onToggleFavorite}
          size="sm"
          className="absolute left-1.5 top-1.5 z-10"
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1 p-2.5 pl-3">
        <div className="flex items-start gap-1">
          <h3 className="text-title-card min-w-0 flex-1 leading-[1.2]">
            <Link
              to={`/recipes/${recipe.id}`}
              className="block truncate after:absolute after:inset-0 focus-visible:outline-hidden focus-visible:after:ring-2 focus-visible:after:ring-ring"
            >
              {recipe.name}
            </Link>
          </h3>
          {/* `relative` is load-bearing: the title's stretched `after:` overlay is
              a positioned box, so a static sibling would paint under it. The menu's
              glass chip belongs on the card's media band, not on this row's plain
              card surface — so both its rest AND hover backgrounds are overridden
              (dropping only the rest one would pop a card-coloured chip on hover). */}
          <RecipeCardMenu
            recipeId={recipe.id}
            canEdit={canEdit}
            onRemove={onRemove}
            className="relative z-10 bg-transparent hover:bg-muted"
          />
        </div>

        <div className="flex items-baseline gap-1">
          <span className="tnum text-[16px] font-semibold tracking-[-0.02em]">
            {Math.round(recipe.perServing.kcal)}
          </span>
          <span className="tnum text-[10px] text-text-dim">
            {t('card.kcalPerServing')} · {t('card.ingredientsShort', { count: recipe.ingredient_count })}
          </span>
        </div>

        <RecipeMacroDots macros={recipe.perServing} />

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          <button
            type="button"
            onClick={onAddToDay}
            className="relative z-10 inline-flex items-center gap-1 rounded-full border border-accent-line bg-accent-soft px-2.5 py-[3px] text-[10.5px] font-medium text-accent-ink"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            {t('card.addToDiary')}
          </button>
          <RecipeWarningPills labels={recipe.labels} />
        </div>
      </div>
    </article>
  );
}
