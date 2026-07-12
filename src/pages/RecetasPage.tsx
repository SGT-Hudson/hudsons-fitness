import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Search, SearchX, Utensils } from 'lucide-react';
import { RecipesTabs } from './RecipesTabs';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PageShell } from '@/components/layout/PageShell';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { usePagination } from '@/hooks/usePagination';
import { TodayAddToDaySheet } from '@/features/diario/components/TodayAddToDaySheet';
import type { AddSheetSelection } from '@/features/diario/components/AddToDaySheet';
import type { RecipeMealType } from '@/features/recipes/mealTypes';
import type { RecipeGoalKey } from '@/features/recipes/labels';
import { isRecipeFilterActive, matchesRecipeFilter } from '@/features/recipes/recipeFilter';
import { useHideRecipe, useRecipes } from '@/features/recipes/hooks';
import { useRecipeFavorites } from '@/features/recipes/useFavorites';
import { partitionFavorites } from '@/features/recipes/favorites';
import { RecipeCard } from '@/features/recipes/components/RecipeCard';
import { RecipeRow } from '@/features/recipes/components/RecipeRow';
import { RecipeFilterBar } from '@/features/recipes/components/RecipeFilterBar';
import type { RecipeListItem } from '@/features/recipes/api';

export function RecetasPage() {
  const { t } = useTranslation('recetas');
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedMealTypes, setSelectedMealTypes] = useState<RecipeMealType[]>([]);
  const [selectedGoals, setSelectedGoals] = useState<RecipeGoalKey[]>([]);
  // The recipe the add-to-day sheet is open on (null = closed). The sheet is
  // mounted only while it holds one: it runs four day-context queries.
  const [addRecipe, setAddRecipe] = useState<RecipeListItem | null>(null);

  const { favorites, isFavorite, toggle: toggleFavorite } = useRecipeFavorites();
  const recipes = useRecipes();
  const hide = useHideRecipe();

  function toggleMealType(key: RecipeMealType) {
    setSelectedMealTypes((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key],
    );
  }
  function toggleGoal(key: RecipeGoalKey) {
    setSelectedGoals((prev) => (prev.includes(key) ? prev.filter((g) => g !== key) : [...prev, key]));
  }
  function clearAllFilters() {
    setQuery('');
    setFavoritesOnly(false);
    setSelectedMealTypes([]);
    setSelectedGoals([]);
  }

  const all = useMemo(() => recipes.data ?? [], [recipes.data]);

  const filter = useMemo(
    () => ({ query, mealTypes: selectedMealTypes, goals: selectedGoals }),
    [query, selectedMealTypes, selectedGoals],
  );
  // Favourites are device-local, so the "Favoritas" chip filters in memory here
  // rather than inside the shared (pure, storage-free) recipe filter.
  const anyFilterActive = isRecipeFilterActive(filter) || favoritesOnly;

  const filtered = useMemo(
    () =>
      all.filter(
        (r) =>
          (!favoritesOnly || favorites.has(r.id)) &&
          matchesRecipeFilter({ name: r.name, mealTypes: r.meal_types, labels: r.labels }, filter),
      ),
    [all, filter, favoritesOnly, favorites],
  );

  const ordered = useMemo(() => partitionFavorites(filtered, favorites), [filtered, favorites]);

  const { page, pageSize, pageCount, setPage, setPageSize } = usePagination({
    total: ordered.length,
    resetKey: `${query}|${favoritesOnly}|${selectedMealTypes.join(',')}|${selectedGoals.join(',')}`,
  });
  const paged = useMemo(
    () => ordered.slice((page - 1) * pageSize, page * pageSize),
    [ordered, page, pageSize],
  );

  // R-01: "Remove" replaces soft-delete — drops my reference row whether or
  // not I'm the owner (R-25; the pooled item and its ownership are untouched).
  function handleRemove(id: string, name: string) {
    if (!window.confirm(t('list.removeConfirm', { name }))) return;
    hide.mutate(id);
  }

  // Stable while the sheet is open (it is a dependency of the sheet's reset
  // effect): one object per opened recipe, not one per render.
  const addSelection = useMemo<AddSheetSelection | null>(
    () =>
      addRecipe
        ? {
            kind: 'recipe',
            recipe: {
              id: addRecipe.id,
              name: addRecipe.name,
              servings: addRecipe.servings,
              ingredient_count: addRecipe.ingredient_count,
              perServing: addRecipe.perServing,
            },
          }
        : null,
    [addRecipe],
  );

  const searchBox = (
    <div className="relative w-full md:w-[280px]">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        className="h-9 pl-9"
        placeholder={t('searchPlaceholder')}
        aria-label={t('searchPlaceholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
    </div>
  );

  const newRecipeButton = (
    <Button onClick={() => navigate('/recipes/new')}>
      <Plus className="h-4 w-4" />
      {t('newRecipe')}
    </Button>
  );

  return (
    <PageShell
      title={t('pageTitle')}
      subtitle={t('subtitle')}
      actions={
        <>
          {searchBox}
          {newRecipeButton}
        </>
      }
    >
      <div className="space-y-3.5">
        <RecipesTabs />

        {/* The desktop header (PageHeaderV2) is CSS-hidden below md, so mobile
            carries its own copy of the search + primary action. */}
        <div className="flex items-center gap-2 md:hidden">
          {searchBox}
          {newRecipeButton}
        </div>

        <RecipeFilterBar
          total={all.length}
          favoritesCount={favorites.size}
          favoritesOnly={favoritesOnly}
          mealTypes={selectedMealTypes}
          goals={selectedGoals}
          onToggleFavoritesOnly={() => setFavoritesOnly((v) => !v)}
          onToggleMealType={toggleMealType}
          onToggleGoal={toggleGoal}
          onClearAll={clearAllFilters}
          anyActive={anyFilterActive}
        />

        {recipes.isLoading ? (
          <>
            <div className="space-y-2.5 md:hidden">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full rounded-[14px]" />
              ))}
            </div>
            <div className="hidden gap-3.5 md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <Skeleton key={i} className="h-[268px] w-full rounded-3xl" />
              ))}
            </div>
          </>
        ) : all.length === 0 ? (
          <EmptyState
            icon={Utensils}
            title={t('empty.title')}
            hint={t('empty.hint')}
            action={newRecipeButton}
          />
        ) : ordered.length === 0 ? (
          <EmptyState icon={SearchX} title={t('empty.noMatchTitle')} hint={t('empty.noMatchHint')} />
        ) : (
          <>
            <ul className="space-y-2.5 md:hidden">
              {paged.map((r) => (
                <li key={r.id}>
                  <RecipeRow
                    recipe={r}
                    favorite={isFavorite(r.id)}
                    onToggleFavorite={() => toggleFavorite(r.id)}
                    onRemove={() => handleRemove(r.id, r.name)}
                    onAddToDay={() => setAddRecipe(r)}
                  />
                </li>
              ))}
            </ul>
            <ul className="hidden gap-3.5 md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {paged.map((r) => (
                <li key={r.id}>
                  <RecipeCard
                    recipe={r}
                    favorite={isFavorite(r.id)}
                    onToggleFavorite={() => toggleFavorite(r.id)}
                    onRemove={() => handleRemove(r.id, r.name)}
                  />
                </li>
              ))}
            </ul>
            <PaginationBar
              page={page}
              pageSize={pageSize}
              total={ordered.length}
              pageCount={pageCount}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </>
        )}
      </div>

      {addRecipe && (
        <TodayAddToDaySheet
          open
          onOpenChange={(open) => {
            if (!open) setAddRecipe(null);
          }}
          selection={addSelection}
        />
      )}
    </PageShell>
  );
}
