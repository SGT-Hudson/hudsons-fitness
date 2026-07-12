import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Copy, Pencil, Plus, Star, Utensils } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { PageShell } from '@/components/layout/PageShell';
import { TodayAddToDaySheet } from '@/features/diario/components/TodayAddToDaySheet';
import type { AddSheetSelection } from '@/features/diario/components/AddToDaySheet';
import { useMealLogsForDay } from '@/features/diario/hooks';
import { isoDate } from '@/lib/dates';
import { ingredientDisplayName } from '@/features/ingredients/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { useRecipe } from '@/features/recipes/hooks';
import { canEditRecipe } from '@/features/recipes/ownership';
import { navigateToRecipeDuplicate } from '@/features/recipes/duplicate';
import { computeRecipeMacros } from '@/features/recipes/macros';
import { toRecipeMealTypes } from '@/features/recipes/mealTypes';
import { useRecipeFavorites } from '@/features/recipes/useFavorites';
import { RecipeMacrosCard } from '@/features/recipes/components/RecipeMacrosCard';
import { RecipeMediaPlaceholder } from '@/features/recipes/components/RecipeMediaPlaceholder';
import { cn } from '@/lib/utils';

/**
 * Reading a recipe (canvas `RecetaVistaWebV2` / `RecetaVerMobile`). Until R-33
 * wave 5, `/recipes/:id` opened the *editor* — tapping a recipe's name dropped
 * you into edit mode. This page is the read half of that split; the editor now
 * lives at `/recipes/:id/edit`.
 *
 * Web is the artboard's two-column read layout (content left, macros rail
 * right); mobile is the same sections stacked, with the two "do something with
 * it" actions (favourite, add to day) as a footer row, and "duplicar" /
 * "editar" in the back header — the artboards' own division of labour.
 * `actions` is rendered by BOTH PageShell headers (one is CSS-hidden), so the
 * desktop-only buttons carry `hidden md:inline-flex` rather than being a
 * second node; "duplicar" and "editar" have no such class because, like the
 * editor's own header actions, they are meant to show on mobile too (task 3:
 * "duplicar" is a pooled recipe's only route into its own library).
 */
export function RecetaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation('recetas');
  const lang: 'es' | 'en' = i18n.language?.startsWith('en') ? 'en' : 'es';

  const { data: recipe, isLoading, isError } = useRecipe(id);
  const { user } = useAuth();
  const { isFavorite, toggle: toggleFavorite } = useRecipeFavorites();
  const [addOpen, setAddOpen] = useState(false);

  // Same warm-up as the Recetas list: the add-to-day sheet reads today's meal
  // logs to pick the slot it opens on, and it reads them once, at open. Firing
  // the query on mount (result unused here) means it has landed by the time the
  // user taps "añadir al día" — otherwise, on a cold cache, the sheet falls back
  // to 'breakfast' instead of the day's first empty slot.
  useMealLogsForDay(isoDate());

  const favorite = !!id && isFavorite(id);

  if (isLoading) {
    return (
      <PageShell title={t('detail.loading')} back="/recipes">
        <div role="status" className="space-y-3">
          <Skeleton className="h-[120px] w-full rounded-[14px]" />
          <Skeleton className="h-[72px] w-full rounded-[14px]" />
          <Skeleton className="h-[150px] w-full rounded-[14px]" />
          <Skeleton className="h-[220px] w-full rounded-[14px]" />
        </div>
      </PageShell>
    );
  }

  if (isError || !recipe || !id) {
    return (
      <PageShell title={t('detail.notFoundTitle')} back="/recipes">
        <EmptyState
          icon={Utensils}
          title={t('detail.notFoundTitle')}
          hint={t('detail.notFoundHint')}
          action={
            <Button asChild variant="outline">
              <Link to="/recipes">{t('detail.backToList')}</Link>
            </Button>
          }
        />
      </PageShell>
    );
  }

  const rows = recipe.recipe_ingredients;
  const mealTypes = toRecipeMealTypes(recipe.meal_types);
  const { total, perServing } = computeRecipeMacros({
    servings: recipe.servings,
    rows: rows.map((ri) => ({
      ingredient: ri.ingredient,
      quantity: Number(ri.quantity),
      perServing: ri.per_serving,
    })),
  });

  // The tiempo stat is omitted entirely when no prep time was ever recorded —
  // never a 0, a dash or a guess (task 1). `short` is the mobile artboard's
  // abbreviated label: the full ones do not fit four across at 390px.
  const stats: Array<{ key: string; label: string; short: string; value: string }> = [
    {
      key: 'servings',
      label: t('detail.stats.servings'),
      short: t('detail.stats.servings'),
      value: String(recipe.servings),
    },
    ...(recipe.prep_time_minutes != null
      ? [
          {
            key: 'time',
            label: t('detail.stats.time'),
            short: t('detail.stats.time'),
            value: t('detail.minutes', { count: recipe.prep_time_minutes }),
          },
        ]
      : []),
    {
      key: 'kcal',
      label: t('detail.stats.kcalPerServing'),
      short: t('detail.stats.kcalPerServingShort'),
      value: String(Math.round(perServing.kcal)),
    },
    {
      key: 'ingredients',
      label: t('detail.stats.ingredients'),
      short: t('detail.stats.ingredientsShort'),
      value: String(rows.length),
    },
  ];

  // The sheet reads this once, on its closed→open transition, so rebuilding the
  // object on a re-render is a no-op — no memoisation needed.
  const addSelection: AddSheetSelection = {
    kind: 'recipe',
    recipe: {
      id: recipe.id,
      name: recipe.name,
      servings: recipe.servings,
      ingredient_count: rows.length,
      perServing,
    },
  };

  const favoriteButton = (className: string) => (
    <Button
      type="button"
      variant="outline"
      aria-pressed={favorite}
      onClick={() => toggleFavorite(id)}
      className={cn(favorite && 'text-accent-ink', className)}
    >
      <Star className="h-4 w-4" fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" />
      {t('detail.favorite')}
    </Button>
  );

  const addToDayButton = (className: string, variant: 'outline' | 'default') => (
    <Button type="button" variant={variant} onClick={() => setAddOpen(true)} className={className}>
      <Plus className="h-4 w-4" aria-hidden="true" />
      {t('detail.addToDay')}
    </Button>
  );

  // R-01: recipes are pooled, so this may be someone else's recipe that I merely
  // hold a ref to — and `save_recipe` refuses to update a recipe I did not
  // create. Offering "editar" there would walk straight into a 400, so the
  // action is omitted for non-creators. Everything else on this page still
  // works on a pooled recipe: reading it, favouriting it, adding it to the day,
  // and removing it from the library (a ref drop, deliberately ungated).
  const canEdit = canEditRecipe(recipe, user?.id);

  // "Duplicar" is the editor's own mechanism (`navigateToRecipeDuplicate`),
  // reachable from here too — the only reason it used to require opening the
  // editor first was that this page didn't offer it, not that it needs
  // ownership. Offered for every recipe, owned or pooled: it is the ONLY way
  // to copy a pooled recipe into your own library (you cannot open the editor
  // on one to reach it), and an owner loses nothing by having it here too —
  // it is still also on the editor for a recipe you do own.
  function handleDuplicate() {
    if (!recipe) return;
    navigateToRecipeDuplicate(navigate, recipe, t('actions.duplicateName', { name: recipe.name }));
  }

  const actions = (
    <>
      {favoriteButton('hidden md:inline-flex')}
      {addToDayButton('hidden md:inline-flex', 'outline')}
      <Button type="button" variant="outline" size="sm" onClick={handleDuplicate} className="md:h-9 md:px-3.5">
        <Copy className="h-4 w-4" aria-hidden="true" />
        {t('actions.duplicate')}
      </Button>
      {canEdit && (
        <Button asChild size="sm" className="md:h-9 md:px-3.5">
          <Link to={`/recipes/${id}/edit`}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
            <span className="hidden md:inline">{t('detail.edit')}</span>
            <span className="md:hidden">{t('detail.editShort')}</span>
          </Link>
        </Button>
      )}
    </>
  );

  return (
    <PageShell
      title={recipe.name}
      subtitle={t('detail.servings', { count: recipe.servings })}
      meta={
        mealTypes.length > 0 ? (
          <div className="flex items-center gap-1">
            {mealTypes.map((m) => (
              <span
                key={m}
                className="rounded-full border border-accent-line bg-accent-soft px-2.5 py-[3px] text-[10.5px] font-semibold text-accent-ink"
              >
                {t(`mealTypes.${m}`)}
              </span>
            ))}
          </div>
        ) : undefined
      }
      actions={actions}
      back="/recipes"
    >
      <div className="grid gap-3 md:grid-cols-[1fr_360px] md:items-start md:gap-4.5">
        <div className="space-y-3 md:space-y-3.5">
          {/* Hero: the media placeholder (recipes have no photos) + the recipe's
              identity. On mobile the meal-type chip rides the media band, as on
              the list card; on web it is in the page header, so the media shrinks
              to the artboard's 104px square beside the name. */}
          <Card className="overflow-hidden md:flex md:items-center md:gap-4 md:p-4">
            <div className="relative h-[120px] w-full shrink-0 overflow-hidden md:h-[104px] md:w-[104px] md:rounded-[14px]">
              <RecipeMediaPlaceholder recipeId={recipe.id} variant="hero" />
              {mealTypes.length > 0 && (
                <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-center gap-1 md:hidden">
                  {mealTypes.map((m) => (
                    <span
                      key={m}
                      className="rounded-full bg-card/90 px-2.5 py-[3px] text-[10.5px] font-semibold text-foreground backdrop-blur-[4px]"
                    >
                      {t(`mealTypes.${m}`)}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1 p-3.5 md:p-0">
              <h2 className="hidden text-[24px] font-semibold tracking-[-0.02em] md:block">
                {recipe.name}
              </h2>
              {recipe.description && (
                <p className="text-[12.5px] text-muted-foreground md:mt-1">{recipe.description}</p>
              )}
              <div
                className={cn(
                  'flex flex-wrap gap-x-5 gap-y-2.5 md:gap-x-7',
                  recipe.description && 'mt-3',
                  'md:mt-3.5',
                )}
              >
                {stats.map((s) => (
                  <div key={s.key} className="flex min-w-[58px] flex-col gap-0.5">
                    <span className="text-[9.5px] uppercase tracking-[0.05em] text-text-dim">
                      <span className="md:hidden">{s.short}</span>
                      <span className="hidden md:inline">{s.label}</span>
                    </span>
                    <span className="tnum text-[15px] font-semibold">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Macros are the rail on web; on mobile they sit right under the hero,
              above the ingredients — the mobile artboard's order. */}
          <RecipeMacrosCard total={total} perServing={perServing} className="md:hidden" />

          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 border-b bg-muted px-4 py-2.5">
              <h2 className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-text-dim">
                {t('detail.ingredientsTitle')}
              </h2>
              <span className="tnum text-[10.5px] text-text-dim">
                · {rows.length} · {t('detail.forServings', { count: recipe.servings })}
              </span>
            </div>
            <ul>
              {rows.map((ri) => (
                <li
                  key={ri.id}
                  className="flex items-center gap-3 border-t px-4 py-2.5 text-[13px] first:border-t-0"
                >
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                  />
                  <div className="flex min-w-0 flex-1 flex-col leading-[1.25]">
                    <span className="truncate font-medium">
                      {ingredientDisplayName(ri.ingredient, lang)}
                    </span>
                    {ri.ingredient.brand && (
                      <span className="truncate text-[10.5px] text-text-dim">
                        {ri.ingredient.brand}
                      </span>
                    )}
                  </div>
                  {ri.per_serving && (
                    <span className="shrink-0 rounded-full border bg-muted px-2 py-[1px] text-[9.5px] text-text-dim">
                      {t('detail.perServingChip')}
                    </span>
                  )}
                  <span className="tnum min-w-16 shrink-0 text-right text-[12.5px] text-muted-foreground">
                    {Number(ri.quantity)}{' '}
                    {ri.ingredient.unit_type === 'unit' ? t('form.units') : 'g'}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          {/* One `instructions` text column → one numbered step. Structured,
              reorderable, per-step-photo steps are R-36: when they land, this
              same step row starts rendering 1, 2, 3… unchanged. Splitting the
              text into fake steps here would invent structure the data doesn't
              have — so the text keeps its own line breaks inside step 1. */}
          {recipe.instructions?.trim() && (
            <Card data-slot="instructions" className="px-4 pb-3 pt-0 md:px-4.5">
              <div className="border-b py-3">
                <h2 className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-text-dim">
                  {t('detail.instructionsTitle')}
                </h2>
              </div>
              <div className="flex items-start gap-3.5 py-3">
                <span className="tnum grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-[13.5px] font-semibold text-accent-ink">
                  1
                </span>
                <p className="whitespace-pre-line pt-0.5 text-[13.5px] leading-[1.6]">
                  {recipe.instructions}
                </p>
              </div>
            </Card>
          )}

          {/* Mobile action bar (the artboard's footer): the two things you do
              with a recipe you are reading. "Editar" is in the back header. */}
          <div className="flex gap-2.5 pt-0.5 md:hidden">
            {favoriteButton('h-11 flex-1 rounded-[13px]')}
            {addToDayButton('h-11 flex-[1.4] rounded-[13px]', 'default')}
          </div>
        </div>

        <RecipeMacrosCard total={total} perServing={perServing} className="hidden md:block" />
      </div>

      {addOpen && (
        <TodayAddToDaySheet open onOpenChange={setAddOpen} selection={addSelection} />
      )}
    </PageShell>
  );
}
