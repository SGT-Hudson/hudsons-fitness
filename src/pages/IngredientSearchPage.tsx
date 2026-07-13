import { useState } from 'react';
import { Link, createSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Camera, ChevronRight, Plus, Search, SearchX, X } from 'lucide-react';
import { Dialog, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { INGREDIENT_SCAN } from '@/features/ingredients/editorRoute';
import { useLocalIngredientSearch } from '@/features/ingredients/hooks';
import { IngredientSearchRow } from '@/features/ingredients/components/IngredientSearchRow';
import { ingredientDisplayName, type Ingredient } from '@/features/ingredients/api';

const LIST = '/recipes/ingredients';

/**
 * `/recipes/ingredients/search` — the full-screen search (D-F24, deferred out of
 * the Diario wave and landing here).
 *
 * The canvas has no ingredient search artboard; this is `RecetaBuscarMobile`'s
 * pattern: an active field with an accent ring and a clear button, a `Cancelar`
 * text action, results with the matched run highlighted, and a pinned footer
 * escape hatch — here "crear un ingrediente nuevo" / "escanear el código".
 *
 * **It searches the whole pool**, not my library: `useLocalIngredientSearch` is
 * the same server search the recipe autocomplete and the Diario's add sheet run
 * (R-01 §7 — discovery is the point), and its semantics are untouched.
 *
 * **Picking a result returns to the list, scoped to it** (`?q=`). D-F24 wanted
 * an ingredient detail page as the target; this wave's spec (§6) builds no such
 * page — the list row IS the ingredient's surface (macros, origin, and the menu
 * that edits it or drops it from my library), so that is where a pick lands,
 * rather than inventing a screen the spec does not have.
 *
 * It is a takeover (`fixed inset-0`, above the bottom nav's `z-20`), not a page
 * in the shell: the escape hatch is pinned to the bottom and stacking it on top
 * of the mobile tab bar would give the user two bars to read. Cancel exits back
 * to the list.
 *
 * **Focus trap.** This is the only takeover in the app not built on a Radix
 * primitive, and it used to leak focus: tabbing past the pinned footer walked
 * straight into the (visually covered) list and bottom nav behind it — a real
 * gap on mobile, where this screen is the primary entry, not just a desktop
 * deep-link edge case. Fixed by wrapping the same markup in `Dialog` +
 * `DialogPrimitive.Content` (the raw primitive, not the shared `DialogContent`
 * — that one draws a centered card and its own close button, neither of which
 * this full-bleed screen wants) so Radix's `FocusScope` traps Tab and its
 * `Escape` handling replaces the old manual `keydown` listener. `open` is
 * always `true`, same as `IngredientDialog` in `IngredientesPage`: this
 * component only mounts while the route is active, so "closing" is always a
 * navigation away, never an internal state flip.
 */
export function IngredientSearchPage() {
  const { t, i18n } = useTranslation('ingredientes');
  const lang: 'es' | 'en' = i18n.language?.startsWith('en') ? 'en' : 'es';
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 200);

  // Gated on the DEBOUNCED value (as in AddIngredientSheet): gating on the raw
  // query flashes "sin resultados" in the ~200 ms before the fetch is enabled.
  const typed = debounced.trim() !== '';
  const search = useLocalIngredientSearch(debounced, 12, typed);
  const results: Ingredient[] = search.data ?? [];
  const loading = typed && search.isLoading;

  function pick(ing: Ingredient) {
    navigate({
      pathname: LIST,
      search: createSearchParams({ q: ingredientDisplayName(ing, lang) }).toString(),
    });
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) navigate(LIST); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content className="fixed inset-0 z-30 flex flex-col bg-background outline-none">
          <DialogTitle className="sr-only">{t('search.placeholder')}</DialogTitle>
          <header className="shrink-0 border-b bg-card px-3.5 pb-3 pt-2.5">
            <div className="mx-auto flex w-full max-w-content items-center gap-2.5">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-accent"
                aria-hidden="true"
              />
              <input
                // The field is the whole point of the screen — it opens focused.
                autoFocus
                // Not `type="search"`: Chrome draws its own clear button for that
                // type, which would sit on top of the canvas's.
                type="text"
                enterKeyHint="search"
                className="h-[42px] w-full rounded-[12px] border-[1.5px] border-accent bg-muted pl-9 pr-9 text-[14px] outline-none placeholder:text-text-dim"
                placeholder={t('search.placeholder')}
                aria-label={t('search.placeholder')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query !== '' && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label={t('search.clear')}
                  className="absolute right-2.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full bg-text-dim text-card"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => navigate(LIST)}
              className="shrink-0 text-[13.5px] font-medium text-accent-ink"
            >
              {t('search.cancel')}
            </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <div className="mx-auto w-full max-w-content space-y-2">
              {!typed ? (
                <EmptyState icon={Search} title={t('search.hint')} />
              ) : loading ? (
                <>
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-[54px] w-full rounded-[12px]" />
                  ))}
                </>
              ) : results.length === 0 ? (
                <EmptyState
                  icon={SearchX}
                  title={t('search.noResults')}
                  hint={t('search.noResultsHint', { query: debounced.trim() })}
                />
              ) : (
                <>
                  <div className="flex items-center justify-between px-0.5 pb-0.5">
                    <span className="text-[10px] font-medium uppercase tracking-[0.05em] text-text-dim">
                      {t('search.results')}
                    </span>
                    <span className="tnum text-[10px] text-text-dim">{results.length}</span>
                  </div>
                  {results.map((ing) => (
                    <IngredientSearchRow
                      key={ing.id}
                      ingredient={ing}
                      query={debounced}
                      onSelect={() => pick(ing)}
                    />
                  ))}
                </>
              )}
            </div>
          </div>

          {/* The escape hatch, pinned — the canvas's "¿no encuentras lo que buscas?"
              footer. Both targets are PR-B's screens; the routes exist already. */}
          <footer className="shrink-0 border-t bg-muted px-3.5 pb-[max(env(safe-area-inset-bottom),1rem)] pt-2.5">
            <div className="mx-auto w-full max-w-content space-y-1.5">
              <p className="px-0.5 text-[10px] font-medium uppercase tracking-[0.05em] text-text-dim">
                {t('search.footerTitle')}
              </p>
              <Link
                to="/recipes/ingredients/new"
                className="flex items-center gap-2.5 rounded-[12px] border bg-card px-2.5 py-2 text-left"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-[9px] border bg-muted text-muted-foreground">
                  <Plus className="size-4" aria-hidden="true" />
                </span>
                <span className="flex-1 text-[12.5px] font-semibold">{t('search.create')}</span>
                <ChevronRight className="size-[15px] shrink-0 text-text-dim" aria-hidden="true" />
              </Link>
              <Link
                to={INGREDIENT_SCAN}
                className="flex items-center gap-2.5 rounded-[12px] border bg-card px-2.5 py-2 text-left"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-[9px] border bg-muted text-muted-foreground">
                  <Camera className="size-4" aria-hidden="true" />
                </span>
                <span className="flex-1 text-[12.5px] font-semibold">{t('search.scan')}</span>
                <ChevronRight className="size-[15px] shrink-0 text-text-dim" aria-hidden="true" />
              </Link>
            </div>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}
