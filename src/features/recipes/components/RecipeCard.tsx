import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { useNum } from '@/hooks/useNum';
import { toRecipeMealTypes } from '../mealTypes';
import type { RecipeListItem } from '../api';
import { RecipePhoto } from './RecipePhoto';
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
}

/**
 * The web artboard's recipe card (`RecipeCard`, `recetas-web.jsx`): a 132px
 * media band (the cover photo, or the shared placeholder) with the
 * meal-type pill inset bottom-left and the favourite pin top-right, then name,
 * kcal/ración, the macro dot triad, and a footer with the ingredient count and
 * the "Leer más →" affordance.
 *
 * The "cutout" style is not a notch (the canvas's `CutoutCorner` SVG is dead
 * code): it is the shared `card-lift` elevation plus two group-hover motions —
 * the media zooming to 1.06 and the arrow gap widening 4px → 7px.
 *
 * The whole card is the link (the title's stretched `after:` pseudo-element),
 * so the pin and the menu — the only other interactive things — sit above it on
 * `z-10` rather than nesting buttons inside an anchor.
 */
export function RecipeCard({ recipe, favorite, canEdit, onToggleFavorite, onRemove }: Props) {
  const { t } = useTranslation('recetas');
  const num = useNum();
  const mealTypes = toRecipeMealTypes(recipe.meal_types);

  return (
    <article className="card-lift group relative flex h-full flex-col rounded-3xl border bg-card">
      <div className="relative h-[132px] shrink-0 overflow-hidden rounded-t-3xl">
        <RecipePhoto
          recipe={recipe}
          variant="card"
          className="transition-transform duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:scale-[1.06] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
        {/* Top-down legibility wash under the inset pills. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 from-0% to-transparent to-45%"
        />
        <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-center gap-1">
          {mealTypes.map((m) => (
            <span
              key={m}
              className="rounded-full bg-card/90 px-2.5 py-[3px] text-[10.5px] font-semibold tracking-[0.02em] text-foreground backdrop-blur-[4px]"
            >
              {t(`mealTypes.${m}`)}
            </span>
          ))}
          <RecipeWarningPills labels={recipe.labels} />
        </div>
        <div className="absolute right-2.5 top-2.5 z-10 flex items-center gap-1">
          <RecipeCardMenu recipeId={recipe.id} canEdit={canEdit} onRemove={onRemove} />
          <RecipeFavoritePin favorite={favorite} onToggle={onToggleFavorite} />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <h3 className="text-title-card leading-[1.25]">
          <Link
            to={`/recipes/${recipe.id}`}
            className="line-clamp-2 after:absolute after:inset-0 after:rounded-3xl focus-visible:outline-hidden focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {recipe.name}
          </Link>
        </h3>

        <div className="flex items-baseline gap-1">
          <span className="tnum text-[18px] font-semibold tracking-[-0.02em]">
            {num.qty(Math.round(recipe.perServing.kcal))}
          </span>
          <span className="text-[10.5px] text-text-dim">{t('card.kcalPerServing')}</span>
        </div>

        <RecipeMacroDots macros={recipe.perServing} />

        <div className="mt-auto flex items-center gap-2 border-t pt-2">
          <span className="tnum text-[10.5px] text-text-dim">
            {t('list.ingredients', { count: recipe.ingredient_count })}
          </span>
          <span
            aria-hidden="true"
            className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-semibold text-accent-ink transition-[gap] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:gap-[7px] motion-reduce:transition-none"
          >
            {t('card.readMore')}
            <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </article>
  );
}
