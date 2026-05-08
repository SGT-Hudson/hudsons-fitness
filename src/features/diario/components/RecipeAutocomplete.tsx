import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useRecipes } from '@/features/recipes/hooks';
import { cn } from '@/lib/utils';

export interface RecipeOption {
  id: string;
  name: string;
  servings: number;
  ingredient_count: number;
}

interface Props {
  selected: RecipeOption | null;
  onSelect: (option: RecipeOption) => void;
  onClear: () => void;
}

export function RecipeAutocomplete({ selected, onSelect, onClear }: Props) {
  const { t } = useTranslation('diario');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const recipes = useRecipes();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const filtered = useMemo(() => {
    const all = recipes.data ?? [];
    const q = query.trim().toLowerCase();
    if (q === '') return all.slice(0, 12);
    return all.filter((r) => r.name.toLowerCase().includes(q)).slice(0, 12);
  }, [recipes.data, query]);

  if (selected) {
    return (
      <div className="flex items-center gap-2 w-full rounded-md border border-input bg-background px-3 h-10 text-sm">
        <span className="font-medium truncate flex-1 min-w-0">{selected.name}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          aria-label={t('autocomplete.change')}
          onClick={onClear}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        autoFocus
        className="pl-9"
        placeholder={t('autocomplete.recipePlaceholder')}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
          <ul className="max-h-64 overflow-y-auto py-1">
            {recipes.isLoading && (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                {t('autocomplete.loading')}
              </li>
            )}
            {!recipes.isLoading && filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                {recipes.data && recipes.data.length === 0
                  ? t('autocomplete.recipeEmpty')
                  : t('autocomplete.noResults')}
              </li>
            )}
            {filtered.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground',
                    'flex items-center gap-2 justify-between',
                  )}
                  onClick={() => {
                    onSelect({
                      id: r.id,
                      name: r.name,
                      servings: r.servings,
                      ingredient_count: r.ingredient_count,
                    });
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  <span className="font-medium truncate">{r.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {r.servings === 1 ? '1 ración' : `${r.servings} raciones`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
