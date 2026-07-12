import { useCallback, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Camera, ChevronRight, Plus, Search, SearchX, Wheat, X } from 'lucide-react';
import { RecipesTabs } from './RecipesTabs';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PageShell } from '@/components/layout/PageShell';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { usePagination } from '@/hooks/usePagination';
import { useAuth } from '@/features/auth/AuthProvider';
import { IngredientDialog } from '@/features/ingredients/components/IngredientDialog';
import { IngredientFilterBar } from '@/features/ingredients/components/IngredientFilterBar';
import { IngredientRow } from '@/features/ingredients/components/IngredientRow';
import { IngredientTable } from '@/features/ingredients/components/IngredientTable';
import { useHideIngredient, useMyIngredientRefIds, usePoolIngredients } from '@/features/ingredients/hooks';
import {
  countIngredientFacets,
  matchesIngredientFilter,
  type IngredientFacet,
} from '@/features/ingredients/ingredientFilter';
import type { Ingredient } from '@/features/ingredients/api';

const NO_LIBRARY: ReadonlySet<string> = new Set();

/**
 * `/recipes/ingredients` — the shared pool, browsable (R-01: discovery is the
 * point; your library is the "mi biblioteca" facet of it, not the whole list).
 *
 * The pool arrives in ONE query and is filtered, counted and paged in memory:
 * five chips whose counts must be real numbers cannot each afford a
 * `count: 'exact'` round trip per keystroke. See `listPoolIngredients`.
 *
 * `/new` and `/scan` are the routes PR-B turns into the method picker and the
 * full-screen scanner. They are wired here already (so nothing in the redesigned
 * chrome points at a dead link — the router's catch-all would bounce the user to
 * the diary), and until PR-B lands they resolve to this page with the existing
 * `IngredientDialog` open on the matching tab. PR-B swaps the two `<Route>`
 * elements; the links do not move.
 */
export function IngredientesPage() {
  const { t } = useTranslation('ingredientes');
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useAuth();

  // The query lives in the URL (`?q=`), not in local state: the full-screen
  // search hands its pick back this way (`/recipes/ingredients?q=<name>`), so
  // the list has to be able to open already scoped to one. Desktop's inline
  // field writes it with `replace`, so typing does not fill the back stack.
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const setQuery = useCallback(
    (next: string) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next === '') params.delete('q');
          else params.set('q', next);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const [facets, setFacets] = useState<IngredientFacet[]>([]);
  const [editing, setEditing] = useState<Ingredient | null>(null);

  const pool = usePoolIngredients();
  const refs = useMyIngredientRefIds();
  const hide = useHideIngredient();

  const routeIntent = pathname.endsWith('/new')
    ? 'create'
    : pathname.endsWith('/scan')
      ? 'scan'
      : null;

  const all = useMemo(() => pool.data ?? [], [pool.data]);
  const libraryIds = refs.data ?? NO_LIBRARY;
  // `libraryIds` gates row actions (inLibrary) but is not itself a filter
  // facet — "mi biblioteca" was dropped as a chip (redundant with "mías": a
  // ref only ever exists on a row I created or imported).
  const ctx = useMemo(() => ({ userId: user?.id }), [user?.id]);

  const counts = useMemo(() => countIngredientFacets(all, ctx), [all, ctx]);
  const filtered = useMemo(
    () => all.filter((ing) => matchesIngredientFilter(ing, { query, facets }, ctx)),
    [all, query, facets, ctx],
  );

  const { page, pageSize, pageCount, setPage, setPageSize } = usePagination({
    total: filtered.length,
    // The library set is part of the key: dropping a ref while the "mi
    // biblioteca" chip is on changes which rows exist, so the current page would
    // otherwise show a different slice than the user was looking at.
    resetKey: `${query}|${facets.join(',')}|${libraryIds.size}`,
  });
  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );

  function toggleFacet(facet: IngredientFacet) {
    setFacets((prev) => (prev.includes(facet) ? prev.filter((f) => f !== facet) : [...prev, facet]));
  }

  // R-25: a ref drop, never a delete — `recipe_ingredients` holds the pool row
  // alive with ON DELETE RESTRICT, and the copy says so.
  function handleRemove(ing: Ingredient) {
    if (!window.confirm(t('list.removeConfirm'))) return;
    hide.mutate(ing.id);
  }

  function closeDialog() {
    setEditing(null);
    if (routeIntent) navigate('/recipes/ingredients', { replace: true });
  }

  // Desktop only (it rides `actions`, which PageHeaderV2 renders and MobileTopBar
  // ignores) — mobile's field is the link into the full-screen search, below.
  const searchBox = (
    <div className="relative w-[280px]">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
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

  const newIngredientButton = (
    <Button asChild>
      <Link to="/recipes/ingredients/new">
        <Plus className="size-4" aria-hidden="true" />
        {t('newIngredient')}
      </Link>
    </Button>
  );

  return (
    <PageShell
      title={t('pageTitle')}
      subtitle={t('subtitle')}
      actions={
        <>
          {searchBox}
          <Button variant="outline" asChild>
            <Link to="/recipes/ingredients/scan">
              <Camera className="size-4" aria-hidden="true" />
              {t('barcodeAction')}
            </Link>
          </Button>
          {newIngredientButton}
        </>
      }
    >
      <div className="space-y-3.5">
        <RecipesTabs />

        <p className="text-sm text-muted-foreground">{t('description')}</p>

        {/* PageHeaderV2 is CSS-hidden below md, so mobile carries its own search
            row — the artboard's field + camera button. The artboard draws no
            mobile create affordance, but the pre-redesign page had one in its
            header; dropping it silently would leave manual creation reachable
            only by camera → /scan → switching off the barcode tab in a dialog
            that clips at 390px. So it rides here too, icon-only to match the
            camera button's footprint.

            The field itself is a LINK, not an input: on mobile, tapping it opens
            the full-screen search (D-F24) — the canvas's pattern, and the only
            way the pinned "create it / scan it" escape hatch gets a surface. It
            shows the active `?q=`, with its own clear button (a sibling, not a
            child: a button inside a link is invalid). Desktop keeps the inline
            field in the header. */}
        <div className="flex items-center gap-2 md:hidden">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Link
              to="/recipes/ingredients/search"
              aria-label={t('search.open')}
              className="flex h-9 w-full items-center truncate rounded-[10px] border bg-card pl-9 pr-9 text-[13px] leading-9"
            >
              <span className={query === '' ? 'truncate text-muted-foreground' : 'truncate'}>
                {query === '' ? t('searchPlaceholder') : query}
              </span>
            </Link>
            {query !== '' && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={t('search.clear')}
                className="absolute right-2 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full bg-text-dim text-card"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            )}
          </div>
          <Link
            to="/recipes/ingredients/scan"
            aria-label={t('scan.open')}
            className="grid size-9 shrink-0 place-items-center rounded-[10px] border bg-card text-muted-foreground"
          >
            <Camera className="size-4" aria-hidden="true" />
          </Link>
          <Link
            to="/recipes/ingredients/new"
            aria-label={t('newIngredient')}
            className="grid size-9 shrink-0 place-items-center rounded-[10px] border bg-card text-muted-foreground"
          >
            <Plus className="size-4" aria-hidden="true" />
          </Link>
        </div>

        {/* The artboard's accent-tinted scan banner (mobile only). */}
        <Link
          to="/recipes/ingredients/scan"
          className="flex items-center gap-2.5 rounded-[14px] border border-accent-line bg-accent-soft px-3 py-2.5 text-accent-ink md:hidden"
        >
          <span className="grid size-[30px] shrink-0 place-items-center rounded-[8px] bg-card text-accent">
            <Camera className="size-3.5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 text-[11.5px] leading-[1.25]">
            <b className="font-semibold">{t('scan.bannerTitle')}</b>
            <br />
            <span className="opacity-85">{t('scan.bannerHint')}</span>
          </span>
          <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
        </Link>

        <IngredientFilterBar counts={counts} active={facets} onToggle={toggleFacet} />

        {pool.isLoading ? (
          <div className="space-y-2 rounded-[14px] border bg-card p-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-11 w-full rounded-[10px]" />
            ))}
          </div>
        ) : all.length === 0 ? (
          <EmptyState
            icon={Wheat}
            title={t('empty.title')}
            hint={t('empty.hint')}
            action={newIngredientButton}
          />
        ) : filtered.length === 0 ? (
          <EmptyState icon={SearchX} title={t('empty.noMatchTitle')} hint={t('empty.noMatchHint')} />
        ) : (
          <>
            <div className="divide-y overflow-hidden rounded-[14px] border bg-card md:hidden">
              {paged.map((ing) => (
                <IngredientRow
                  key={ing.id}
                  ingredient={ing}
                  canEdit={ing.created_by_user_id === user?.id}
                  inLibrary={libraryIds.has(ing.id)}
                  onEdit={() => setEditing(ing)}
                  onRemove={() => handleRemove(ing)}
                />
              ))}
            </div>

            <div className="hidden overflow-hidden rounded-[14px] border bg-card md:block">
              <IngredientTable
                ingredients={paged}
                libraryIds={libraryIds}
                userId={user?.id}
                onEdit={setEditing}
                onRemove={handleRemove}
              />
            </div>

            <PaginationBar
              page={page}
              pageSize={pageSize}
              total={filtered.length}
              pageCount={pageCount}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </>
        )}
      </div>

      {(routeIntent !== null || editing !== null) && (
        <IngredientDialog
          open
          onOpenChange={(open) => {
            if (!open) closeDialog();
          }}
          mode={editing ? 'edit' : 'create'}
          initial={editing}
          defaultTab={routeIntent === 'scan' ? 'barcode' : undefined}
        />
      )}
    </PageShell>
  );
}
