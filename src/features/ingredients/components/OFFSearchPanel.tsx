import { useTranslation } from 'react-i18next';
import { Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useNum } from '@/hooks/useNum';
import type { OFFSearchResult } from '@/lib/openfoodfacts';

interface OFFPanelProps {
  query: string;
  onQueryChange: (q: string) => void;
  isLoading: boolean;
  results: OFFSearchResult[];
  /** The current pick, highlighted. The method picker navigates away on pick, so it passes `null`. */
  picked: OFFSearchResult | null;
  onPick: (r: OFFSearchResult) => void;
}

/**
 * The OpenFoodFacts search: a field, and the products behind it.
 *
 * Presentational — the query, the debounce and `useOFFSearch` belong to whoever
 * mounts it. One does: the method picker's OFF method
 * (`/recipes/ingredients/new`), which navigates to the editor with the picked
 * product. Lifted out of `IngredientDialog`'s OFF tab when the picker needed it;
 * that tab is now the picker, and the dialog is create-only.
 */
export function OFFSearchPanel({
  query,
  onQueryChange,
  isLoading,
  results,
  picked,
  onPick,
}: OFFPanelProps) {
  const { t } = useTranslation('ingredientes');
  const num = useNum();

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        {/* `autoFocus` is right on both surfaces: this panel only ever mounts in
            response to an explicit "buscar en OpenFoodFacts", and the field is
            the whole point of it. Checked full-page at 390px and 1440px — the
            focus lands on the field without scrolling the page. */}
        <Input
          autoFocus
          className="pl-9"
          placeholder={t('off.searchPlaceholder')}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
      {query.trim().length < 3 ? (
        <p className="text-sm text-muted-foreground">{t('off.minChars')}</p>
      ) : results.length === 0 && !isLoading ? (
        <p className="text-sm text-muted-foreground">{t('off.noResults')}</p>
      ) : (
        <ul className="grid gap-2 max-h-72 overflow-y-auto pr-1">
          {results.map((r) => {
            const isPicked = picked?.code === r.code;
            return (
              <li key={r.code}>
                <button
                  type="button"
                  onClick={() => onPick(r)}
                  className={
                    'w-full flex items-center gap-3 rounded-md border p-2 text-left transition-colors ' +
                    (isPicked
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-muted hover:text-foreground')
                  }
                >
                  {r.thumbnailUrl ? (
                    <img
                      src={r.thumbnailUrl}
                      alt=""
                      className="h-12 w-12 rounded object-cover bg-muted shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded bg-muted shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{r.name}</div>
                    {r.brand && (
                      <div className="text-xs text-muted-foreground truncate">{r.brand}</div>
                    )}
                  </div>
                  <div className="text-sm tabular-nums text-muted-foreground shrink-0">
                    {num.qty(r.kcalPer100g)} kcal
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
