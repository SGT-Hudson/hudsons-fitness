import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, List, Pencil, Plus, Search, Star, Trash2 } from 'lucide-react';
import { RecipesTabs } from './RecipesTabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  RECIPE_MEAL_TYPES,
  toRecipeMealTypes,
  type RecipeMealType,
} from '@/features/recipes/mealTypes';
import { RECIPE_GOAL_KEYS, type RecipeGoalKey, type RecipeLabels } from '@/features/recipes/labels';
import { isRecipeFilterActive, matchesRecipeFilter } from '@/features/recipes/recipeFilter';
import { useHideRecipe, useRecipes } from '@/features/recipes/hooks';
import { partitionFavorites, toggleFavorite } from '@/features/recipes/favorites';
import { formatDate, type Locale } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { usePagination } from '@/hooks/usePagination';
import { PaginationBar } from '@/components/ui/PaginationBar';

type View = 'grid' | 'list';
const STORAGE_KEY = 'hudsons-fitness-recetas-view';
const FAV_STORAGE_KEY = 'hudsons-fitness-recetas-favorites';

function loadFavorites(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(FAV_STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function hasWarnings(labels: RecipeLabels): boolean {
  return labels.warnings.highSugar === true || labels.warnings.highSatFat === true;
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input bg-background text-muted-foreground hover:bg-accent',
      )}
    >
      {label}
    </button>
  );
}

export function RecetasPage() {
  const { t, i18n } = useTranslation('recetas');
  const { t: tCommon } = useTranslation('common');
  const navigate = useNavigate();
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;

  const [view, setView] = useState<View>(() => {
    if (typeof window === 'undefined') return 'grid';
    return (window.localStorage.getItem(STORAGE_KEY) as View) || 'grid';
  });
  const [query, setQuery] = useState('');
  const [selectedMealTypes, setSelectedMealTypes] = useState<RecipeMealType[]>([]);
  const [selectedGoals, setSelectedGoals] = useState<RecipeGoalKey[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);

  function toggleMealType(key: RecipeMealType) {
    setSelectedMealTypes((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key],
    );
  }
  function toggleGoal(key: RecipeGoalKey) {
    setSelectedGoals((prev) =>
      prev.includes(key) ? prev.filter((g) => g !== key) : [...prev, key],
    );
  }

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, view);
  }, [view]);

  useEffect(() => {
    window.localStorage.setItem(
      FAV_STORAGE_KEY,
      JSON.stringify([...favorites]),
    );
  }, [favorites]);

  function handleToggleFav(id: string) {
    setFavorites((prev) => toggleFavorite(prev, id));
  }

  const recipes = useRecipes();
  const hide = useHideRecipe();

  const filter = useMemo(
    () => ({ query, mealTypes: selectedMealTypes, goals: selectedGoals }),
    [query, selectedMealTypes, selectedGoals],
  );
  const filterActive = isRecipeFilterActive(filter);

  const filtered = useMemo(() => {
    if (!recipes.data) return [];
    return recipes.data.filter((r) =>
      matchesRecipeFilter(
        { name: r.name, mealTypes: r.meal_types, labels: r.labels },
        filter,
      ),
    );
  }, [recipes.data, filter]);

  const ordered = useMemo(
    () => partitionFavorites(filtered, favorites),
    [filtered, favorites],
  );

  const { page, pageSize, pageCount, setPage, setPageSize } = usePagination({
    total: ordered.length,
    resetKey: `${query}|${selectedMealTypes.join(',')}|${selectedGoals.join(',')}`,
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

  return (
    <div className="space-y-4">
      <RecipesTabs />
      <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border bg-background p-0.5">
            <button
              type="button"
              aria-label={t('view.grid')}
              onClick={() => setView('grid')}
              className={cn(
                'p-1.5 rounded-sm transition-colors',
                view === 'grid' ? 'bg-secondary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={t('view.list')}
              onClick={() => setView('list')}
              className={cn(
                'p-1.5 rounded-sm transition-colors',
                view === 'list' ? 'bg-secondary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
          <Button onClick={() => navigate('/recipes/new')}>
            <Plus className="h-4 w-4" />
            {t('newRecipe')}
          </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder={t('searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* U-3 facets: meal-type tags (OR within) + nutrition goal filters (AND). */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground mr-1">{t('form.mealTypes')}</span>
        {RECIPE_MEAL_TYPES.map((key) => (
          <FilterChip
            key={key}
            active={selectedMealTypes.includes(key)}
            label={t(`mealTypes.${key}`)}
            onClick={() => toggleMealType(key)}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground mr-1">{t('filters.heading')}</span>
        {RECIPE_GOAL_KEYS.map((key) => (
          <FilterChip
            key={key}
            active={selectedGoals.includes(key)}
            label={t(`filters.${key}`)}
            onClick={() => toggleGoal(key)}
          />
        ))}
      </div>

      {recipes.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Card key={i}>
              <CardContent className="py-4 space-y-2">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {filterActive ? t('list.noMatch') : t('list.empty')}
          </CardContent>
        </Card>
      ) : view === 'grid' ? (
        <ul className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {paged.map((r) => (
            <li key={r.id}>
              <Card className="h-full hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg leading-tight">
                    <Link to={`/recipes/${r.id}`} className="hover:underline">
                      {r.name}
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{t('list.servings', { count: r.servings })}</span>
                    <span>·</span>
                    <span>{t('list.ingredients', { count: r.ingredient_count })}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('list.updated', { date: formatDate(r.updated_at, 'd MMM yyyy', locale) })}
                  </p>
                  {(r.meal_types.length > 0 || hasWarnings(r.labels)) && (
                    <div className="flex flex-wrap gap-1">
                      {toRecipeMealTypes(r.meal_types).map((m) => (
                        <Badge key={m} variant="secondary">
                          {t(`mealTypes.${m}`)}
                        </Badge>
                      ))}
                      {r.labels.warnings.highSugar === true && (
                        <Badge variant="warning">{t('warnings.highSugar')}</Badge>
                      )}
                      {r.labels.warnings.highSatFat === true && (
                        <Badge variant="warning">{t('warnings.highSatFat')}</Badge>
                      )}
                    </div>
                  )}
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={favorites.has(r.id) ? t('favorite.remove') : t('favorite.add')}
                      aria-pressed={favorites.has(r.id)}
                      onClick={() => handleToggleFav(r.id)}
                    >
                      <Star
                        className={cn(
                          'h-4 w-4',
                          favorites.has(r.id) && 'fill-amber-400 text-amber-400',
                        )}
                      />
                    </Button>
                    <Button asChild variant="ghost" size="icon" aria-label={tCommon('edit')}>
                      <Link to={`/recipes/${r.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('list.removeFromLibrary')}
                      onClick={() => handleRemove(r.id, r.name)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Card>
          <ul className="divide-y">
            {paged.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <Link to={`/recipes/${r.id}`} className="font-medium hover:underline truncate">
                    {r.name}
                  </Link>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span>{t('list.servings', { count: r.servings })}</span>
                    <span>·</span>
                    <span>{t('list.ingredients', { count: r.ingredient_count })}</span>
                    <span>·</span>
                    <span>
                      {t('list.updated', { date: formatDate(r.updated_at, 'd MMM yyyy', locale) })}
                    </span>
                  </div>
                  {(r.meal_types.length > 0 || hasWarnings(r.labels)) && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {toRecipeMealTypes(r.meal_types).map((m) => (
                        <Badge key={m} variant="secondary">
                          {t(`mealTypes.${m}`)}
                        </Badge>
                      ))}
                      {r.labels.warnings.highSugar === true && (
                        <Badge variant="warning">{t('warnings.highSugar')}</Badge>
                      )}
                      {r.labels.warnings.highSatFat === true && (
                        <Badge variant="warning">{t('warnings.highSatFat')}</Badge>
                      )}
                    </div>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={favorites.has(r.id) ? t('favorite.remove') : t('favorite.add')}
                    aria-pressed={favorites.has(r.id)}
                    onClick={() => handleToggleFav(r.id)}
                  >
                    <Star
                      className={cn(
                        'h-4 w-4',
                        favorites.has(r.id) && 'fill-amber-400 text-amber-400',
                      )}
                    />
                  </Button>
                  <Button asChild variant="ghost" size="icon" aria-label={tCommon('edit')}>
                    <Link to={`/recipes/${r.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('list.removeFromLibrary')}
                    onClick={() => handleRemove(r.id, r.name)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <PaginationBar
        page={page}
        pageSize={pageSize}
        total={ordered.length}
        pageCount={pageCount}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}
