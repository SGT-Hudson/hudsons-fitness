import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, List, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useRecipes, useSoftDeleteRecipe } from '@/features/recipes/hooks';
import { formatDate, type Locale } from '@/lib/dates';
import { cn } from '@/lib/utils';

type View = 'grid' | 'list';
const STORAGE_KEY = 'hudsons-fitness-recetas-view';

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

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, view);
  }, [view]);

  const recipes = useRecipes();
  const del = useSoftDeleteRecipe();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!recipes.data) return [];
    if (q === '') return recipes.data;
    return recipes.data.filter((r) => r.name.toLowerCase().includes(q));
  }, [recipes.data, query]);

  function handleDelete(id: string, name: string) {
    if (!window.confirm(t('list.deleteConfirm', { name }))) return;
    del.mutate(id);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-3xl font-bold tracking-tight">{t('pageTitle')}</h1>
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
          <Button onClick={() => navigate('/recetas/nuevo')}>
            <Plus className="h-4 w-4" />
            {t('newRecipe')}
          </Button>
        </div>
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

      {recipes.isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">{tCommon('loading')}</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {recipes.data?.length === 0 ? t('list.empty') : t('list.noMatch')}
          </CardContent>
        </Card>
      ) : view === 'grid' ? (
        <ul className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => (
            <li key={r.id}>
              <Card className="h-full hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg leading-tight">
                    <Link to={`/recetas/${r.id}`} className="hover:underline">
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
                  <div className="flex justify-end gap-1">
                    <Button asChild variant="ghost" size="icon" aria-label={tCommon('edit')}>
                      <Link to={`/recetas/${r.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={tCommon('delete')}
                      onClick={() => handleDelete(r.id, r.name)}
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
            {filtered.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <Link to={`/recetas/${r.id}`} className="font-medium hover:underline truncate">
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
                </div>
                <div className="shrink-0 flex items-center gap-1">
                  <Button asChild variant="ghost" size="icon" aria-label={tCommon('edit')}>
                    <Link to={`/recetas/${r.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={tCommon('delete')}
                    onClick={() => handleDelete(r.id, r.name)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
