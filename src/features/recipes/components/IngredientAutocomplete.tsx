import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useLocalIngredientSearch } from '@/features/ingredients/hooks';
import { IngredientDialog } from '@/features/ingredients/components/IngredientDialog';
import type { Ingredient } from '@/features/ingredients/api';
import { cn } from '@/lib/utils';

interface Props {
  selected: Ingredient | null;
  onSelect: (ingredient: Ingredient) => void;
  onClear: () => void;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function IngredientAutocomplete({ selected, onSelect, onClear }: Props) {
  const { t } = useTranslation('recetas');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 200);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // U-7: don't run the empty-query search — only fetch once the user has typed.
  const search = useLocalIngredientSearch(debounced, 12, debounced.trim() !== '');

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (selected) {
    return (
      <div className="flex items-center gap-2 w-full rounded-md border border-input bg-background px-3 h-10 text-sm">
        <span className="font-medium truncate flex-1 min-w-0">{selected.name}</span>
        {selected.brand && (
          <span className="text-muted-foreground truncate text-xs">{selected.brand}</span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('autocomplete.change')}
          className="h-7 w-7 shrink-0"
          onClick={onClear}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  const showCreate = query.trim().length > 0;

  return (
    <>
      <div ref={containerRef} className="relative w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          className="pl-9"
          placeholder={t('autocomplete.placeholder')}
          value={query}
          // U-7: don't surface the dropdown on focus — only once the user has
          // started typing (an unfiltered "first few ingredients" list on focus
          // isn't useful). Re-focusing a non-empty field reopens it.
          onFocus={() => {
            if (query.trim() !== '') setOpen(true);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(e.target.value.trim() !== '');
          }}
        />
        {open && query.trim() !== '' && (
          <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
            <ul className="max-h-64 overflow-y-auto py-1">
              {search.isLoading && (
                <li className="px-3 py-2 text-sm text-muted-foreground">
                  {t('autocomplete.searching')}
                </li>
              )}
              {!search.isLoading && (search.data ?? []).length === 0 && query.trim() !== '' && (
                <li className="px-3 py-2 text-sm text-muted-foreground">
                  {t('autocomplete.noResults')}
                </li>
              )}
              {(search.data ?? []).map((ing) => (
                <li key={ing.id}>
                  <button
                    type="button"
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground',
                      'flex items-center gap-2 justify-between',
                    )}
                    onClick={() => {
                      onSelect(ing);
                      setOpen(false);
                      setQuery('');
                    }}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="font-medium truncate">{ing.name}</span>
                      {ing.brand && (
                        <span className="text-muted-foreground ml-2 text-xs">{ing.brand}</span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {ing.kcal_per_unit} kcal
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {showCreate && (
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm font-medium text-primary border-t hover:bg-accent flex items-center gap-2"
                onClick={() => {
                  setCreateOpen(true);
                  setOpen(false);
                }}
              >
                <Plus className="h-4 w-4" />
                {t('autocomplete.createNew', { name: query.trim() })}
              </button>
            )}
          </div>
        )}
      </div>
      <IngredientDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        defaultName={query}
        onSaved={(ing) => {
          onSelect(ing);
          setQuery('');
        }}
      />
    </>
  );
}
