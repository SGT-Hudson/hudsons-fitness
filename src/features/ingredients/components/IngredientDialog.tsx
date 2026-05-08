import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  emptyForm,
  IngredientFormFields,
  ingredientToForm,
  parseForm,
  type IngredientFormState,
} from './IngredientFormFields';
import {
  useCreateManualIngredient,
  useImportFromOFF,
  useOFFSearch,
  useUpdateIngredient,
} from '../hooks';
import type { Ingredient } from '../api';
import type { OFFSearchResult } from '@/lib/openfoodfacts';

type Mode = 'create' | 'edit';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  initial?: Ingredient | null;
  defaultName?: string;
  onSaved?: (ingredient: Ingredient) => void;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function IngredientDialog({
  open,
  onOpenChange,
  mode,
  initial,
  defaultName,
  onSaved,
}: Props) {
  const { t } = useTranslation('ingredientes');
  const { t: tCommon } = useTranslation('common');
  const isEdit = mode === 'edit';

  const [tab, setTab] = useState<'off' | 'manual'>('off');
  const [form, setForm] = useState<IngredientFormState>(emptyForm);
  const [offQuery, setOffQuery] = useState('');
  const debouncedQuery = useDebouncedValue(offQuery, 350);
  const [pickedOFF, setPickedOFF] = useState<OFFSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const offSearch = useOFFSearch(debouncedQuery, open && !isEdit && tab === 'off');
  const create = useCreateManualIngredient();
  const importOFF = useImportFromOFF();
  const update = useUpdateIngredient();

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPickedOFF(null);
    if (isEdit && initial) {
      setTab('manual');
      setForm(ingredientToForm(initial));
      setOffQuery('');
    } else {
      const seed = defaultName?.trim() ?? '';
      if (seed.length >= 3) {
        setTab('off');
        setOffQuery(seed);
      } else {
        setTab(seed === '' ? 'off' : 'manual');
        setOffQuery('');
      }
      setForm({ ...emptyForm, name: seed });
    }
  }, [open, isEdit, initial, defaultName]);

  const submitting = create.isPending || importOFF.isPending || update.isPending;

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = parseForm(form);
    if (!parsed) {
      setError(t('errors.invalid'));
      return;
    }
    try {
      let saved: Ingredient;
      if (isEdit && initial) {
        saved = await update.mutateAsync({
          id: initial.id,
          patch: {
            name: parsed.name,
            brand: parsed.brand,
            unit_type: parsed.unit_type,
            kcal_per_unit: parsed.kcal_per_unit,
            protein_g_per_unit: parsed.protein_g_per_unit,
            carbs_g_per_unit: parsed.carbs_g_per_unit,
            fat_g_per_unit: parsed.fat_g_per_unit,
            fiber_g_per_unit: parsed.fiber_g_per_unit,
          },
        });
      } else if (pickedOFF) {
        saved = await importOFF.mutateAsync({ product: pickedOFF, overrides: parsed });
      } else {
        saved = await create.mutateAsync(parsed);
      }
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('dialog.editTitle') : t('dialog.createTitle')}</DialogTitle>
          <DialogDescription>
            {isEdit ? t('dialog.editSubtitle') : t('dialog.createSubtitle')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
          {!isEdit ? (
            <Tabs value={tab} onValueChange={(v) => setTab(v as 'off' | 'manual')}>
              <TabsList>
                <TabsTrigger value="off">{t('tabs.off')}</TabsTrigger>
                <TabsTrigger value="manual">{t('tabs.manual')}</TabsTrigger>
                <TabsTrigger value="imported" disabled title={t('tabs.importedSoon')}>
                  {t('tabs.imported')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="off" className="space-y-4">
                <OFFSearchPanel
                  query={offQuery}
                  onQueryChange={setOffQuery}
                  isLoading={offSearch.isFetching}
                  results={offSearch.data ?? []}
                  picked={pickedOFF}
                  onPick={(r) => {
                    setPickedOFF(r);
                    setForm({
                      name: r.name,
                      brand: r.brand ?? '',
                      unit_type: 'gram',
                      kcal_per_unit: String(r.kcalPer100g),
                      protein_g_per_unit: String(r.proteinPer100g),
                      carbs_g_per_unit: String(r.carbsPer100g),
                      fat_g_per_unit: String(r.fatPer100g),
                      fiber_g_per_unit: String(r.fiberPer100g),
                    });
                  }}
                />
                {pickedOFF && (
                  <>
                    <p className="text-xs text-muted-foreground">{t('off.adjustHint')}</p>
                    <IngredientFormFields value={form} onChange={setForm} idPrefix="off" />
                  </>
                )}
              </TabsContent>

              <TabsContent value="manual" className="space-y-4">
                <IngredientFormFields value={form} onChange={setForm} idPrefix="manual" />
              </TabsContent>
            </Tabs>
          ) : (
            <IngredientFormFields value={form} onChange={setForm} idPrefix="edit" />
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tCommon('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={submitting || (!isEdit && tab === 'off' && !pickedOFF)}
            >
              {submitting ? tCommon('loading') : tCommon('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface OFFPanelProps {
  query: string;
  onQueryChange: (q: string) => void;
  isLoading: boolean;
  results: OFFSearchResult[];
  picked: OFFSearchResult | null;
  onPick: (r: OFFSearchResult) => void;
}

function OFFSearchPanel({
  query,
  onQueryChange,
  isLoading,
  results,
  picked,
  onPick,
}: OFFPanelProps) {
  const { t } = useTranslation('ingredientes');
  const placeholder = useMemo(() => t('off.searchPlaceholder'), [t]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          autoFocus
          className="pl-9"
          placeholder={placeholder}
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
                      : 'hover:bg-accent hover:text-accent-foreground')
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
                    {r.kcalPer100g} kcal
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
