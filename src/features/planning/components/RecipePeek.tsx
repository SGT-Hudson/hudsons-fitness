import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useRecipe } from '@/features/recipes/hooks';
import { computeRecipeMacros, roundMacro } from '@/features/recipes/macros';
import { ingredientDisplayName } from '@/features/ingredients/api';
import { useNum } from '@/hooks/useNum';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipeId: string;
  /** The plan context this recipe was opened from, e.g. "Comida · Jue 30 · del plan". */
  contextLabel: string;
  /** Servings planned for this slot — distinct from the recipe's own `servings` (its yield). */
  servings: number;
  /**
   * Edit this plan slot (recipe / servings / remove). The caller closes the peek
   * and opens its add drawer in edit mode. Omitted → no edit affordance.
   */
  onEdit?: () => void;
}

/**
 * Read-only "what am I actually cooking" view of a recipe planned into a
 * week slot (canvas option 3). Replaces the editor as the tap target from a
 * plan cell — looking at a planned recipe no longer forces edit mode.
 *
 * "Abrir receta" leaves for `/recipes/:id`, which since the wave-5 route split
 * is the recipe's full read view (it used to be the editor — a reading intent
 * that landed in edit mode).
 *
 * Fetches via `useRecipe` (unchanged — no new `.select()`) and derives
 * per-serving macros the same way `AddToDaySheet`'s `editSelection` does.
 */
export function RecipePeek({
  open,
  onOpenChange,
  recipeId,
  contextLabel,
  servings,
  onEdit,
}: Props) {
  const { t, i18n } = useTranslation('planning');
  const num = useNum();
  const lang: 'es' | 'en' = i18n.language?.startsWith('en') ? 'en' : 'es';
  const { data: recipe, isLoading } = useRecipe(recipeId);

  const perServing = recipe
    ? computeRecipeMacros({
        servings: recipe.servings,
        rows: recipe.recipe_ingredients.map((ri) => ({
          ingredient: ri.ingredient,
          quantity: Number(ri.quantity),
          perServing: ri.per_serving,
        })),
      }).perServing
    : null;

  const displayName = recipe?.name ?? t('peek.title');

  function renderHeader(showClose: boolean) {
    return (
      <div className="flex shrink-0 items-start gap-2.5 px-4.5 pb-3 pt-1">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[18px] font-semibold">{displayName}</h2>
          <span className="truncate text-[11.5px] text-muted-foreground">{contextLabel}</span>
        </div>
        {showClose && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-[30px] w-[30px] shrink-0 rounded-[9px] text-muted-foreground"
            aria-label={t('addRecipe.close')}
            onClick={() => onOpenChange(false)}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={t('peek.title')} variant="panel">
      {({ isMobile }) => (
        <>
          {renderHeader(isMobile)}

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4.5 pb-4">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : !recipe || !perServing ? (
              // Settled with nothing to show — a failed fetch, or a recipe that
              // vanished. Skeletons here would spin forever.
              <p className="py-6 text-center text-[13px] text-muted-foreground">
                {t('peek.missing')}
              </p>
            ) : (
              <>
                <div className="tnum flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="rounded-full border border-border bg-muted px-2 py-0.5">
                    {t('peek.servings', { count: recipe.servings })}
                  </span>
                  <span className="rounded-full border border-border bg-muted px-2 py-0.5">
                    {recipe.recipe_ingredients.length} {t('peek.ingredients')}
                  </span>
                </div>

                <div className="space-y-2 rounded-[12px] border border-border bg-muted p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-text-dim">
                      {t('peek.perServing')}
                    </span>
                    <span className="tnum text-[10.5px] text-muted-foreground">
                      {t('peek.planned', { count: servings })}
                    </span>
                  </div>
                  <div className="tnum text-[26px] font-semibold tracking-tight">
                    {num.qty(roundMacro(perServing.kcal))}
                    <span className="ml-1 text-[12px] font-normal text-muted-foreground">
                      {t('summary.kcalUnit')}
                    </span>
                  </div>
                  <div className="tnum flex items-baseline gap-3 text-[12px]">
                    <span className="text-macro-p">
                      {num.qty(roundMacro(perServing.proteinG))}{' '}
                      <span className="opacity-70">{t('summary.letter.protein')}</span>
                    </span>
                    <span className="text-macro-c">
                      {num.qty(roundMacro(perServing.carbsG))}{' '}
                      <span className="opacity-70">{t('summary.letter.carbs')}</span>
                    </span>
                    <span className="text-macro-g">
                      {num.qty(roundMacro(perServing.fatG))}{' '}
                      <span className="opacity-70">{t('summary.letter.fat')}</span>
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <h3 className="text-[12px] font-semibold uppercase tracking-wide text-text-dim">
                    {t('peek.ingredients')}
                  </h3>
                  <ul className="space-y-1">
                    {recipe.recipe_ingredients.map((ri) => (
                      <li
                        key={ri.id}
                        className="tnum flex items-baseline gap-1.5 text-[13px]"
                      >
                        <span className="font-medium">{num.qty(Number(ri.quantity))}</span>
                        <span className="text-muted-foreground">{ri.ingredient.unit_type}</span>
                        <span>{ingredientDisplayName(ri.ingredient, lang)}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {recipe.recipe_steps.length > 0 && (
                  <div className="space-y-1.5">
                    <h3 className="text-[12px] font-semibold uppercase tracking-wide text-text-dim">
                      {t('peek.instructions')}
                    </h3>
                    <ol className="list-decimal space-y-1 pl-4 text-[13px] text-foreground">
                      {recipe.recipe_steps.map((step) => (
                        <li key={step.id} className="whitespace-pre-line">
                          {step.text}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex shrink-0 gap-2 border-t border-border px-4.5 py-3">
            <Button asChild variant="outline" className="flex-1">
              <Link to={`/recipes/${recipeId}`}>{t('peek.open')}</Link>
            </Button>
            {onEdit && (
              <Button type="button" className="flex-1" onClick={onEdit}>
                {t('peek.edit')}
              </Button>
            )}
          </div>
        </>
      )}
    </ResponsiveDialog>
  );
}
