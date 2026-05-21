import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { ingredientFormSchema, type ParsedIngredientForm } from '../schema';
import {
  useCreateManualIngredient,
  useImportFromOFF,
  useOFFSearch,
  useUpdateIngredient,
} from '../hooks';
import type { Ingredient } from '../api';
import { isValidEan, type OFFProductLookup, type OFFSearchResult } from '@/lib/openfoodfacts';
import { useBarcodeLookup } from '../hooks';
import { BarcodeScanner } from './BarcodeScanner';
import { Label } from '@/components/ui/label';
import { useProfile } from '@/features/profile/hooks';
import { contributeToOff } from '@/lib/offContribute';

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

  const [tab, setTab] = useState<'off' | 'manual' | 'barcode'>('off');
  const {
    handleSubmit,
    reset,
    watch,
  } = useForm<IngredientFormState, unknown, ParsedIngredientForm>({
    resolver: zodResolver(ingredientFormSchema),
    defaultValues: emptyForm,
  });
  // IngredientFormFields is a reused presentational value/onChange component
  // (OFF / manual / edit tabs); RHF owns the state here. `watch()` gives the
  // live value; `reset(next)` is the onChange (it also re-runs validation).
  const form = watch();
  const setForm = (next: IngredientFormState) => reset(next);
  const [offQuery, setOffQuery] = useState('');
  const debouncedQuery = useDebouncedValue(offQuery, 350);
  const [pickedOFF, setPickedOFF] = useState<OFFSearchResult | null>(null);
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [barcodeBanner, setBarcodeBanner] = useState<'new' | 'complete' | 'found' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const offSearch = useOFFSearch(debouncedQuery, open && !isEdit && tab === 'off');
  const create = useCreateManualIngredient();
  const importOFF = useImportFromOFF();
  const update = useUpdateIngredient();
  const { data: profile } = useProfile();

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPickedOFF(null);
    setScannedBarcode(null);
    setBarcodeBanner(null);
    if (isEdit && initial) {
      setTab('manual');
      reset(ingredientToForm(initial));
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
      reset({ ...emptyForm, name: seed });
    }
  }, [open, isEdit, initial, defaultName, reset]);

  const submitting = create.isPending || importOFF.isPending || update.isPending;

  async function onValid() {
    setError(null);
    // zodResolver already passed, so parseForm cannot return null here; it is
    // reused purely to normalize (brand→null, fiber blank→0) exactly as before.
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
      if (scannedBarcode) {
        // R-21: fire-and-forget OFF contribution for barcode-origin products.
        contributeToOff(
          {
            barcode: scannedBarcode,
            name: parsed.name,
            brand: parsed.brand,
            unitType: parsed.unit_type,
            kcalPer100g: parsed.kcal_per_unit,
            proteinPer100g: parsed.protein_g_per_unit,
            carbsPer100g: parsed.carbs_g_per_unit,
            fatPer100g: parsed.fat_g_per_unit,
            fiberPer100g: parsed.fiber_g_per_unit,
            mode: barcodeBanner === 'new' ? 'new' : 'complete',
          },
          profile?.contribute_to_off ?? true,
        );
      }
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // The page only ever showed one combined `t('errors.invalid')` line (the old
  // `parseForm` returned null on any bad field). Preserve that exact UX.
  function onInvalid() {
    setError(t('errors.invalid'));
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

        <form onSubmit={handleSubmit(onValid, onInvalid)} className="space-y-4">
          {/* R-01 (★ model item 5): explicit shared-library contract at
              create time. Private content goes in the per-user note on
              the user_ingredient_refs row (not yet UI-surfaced — coming
              with the library notes feature), not in the ingredient
              name/brand. */}
          {!isEdit && (
            <p className="text-xs text-muted-foreground rounded-md border border-dashed p-2">
              {t('createNoteHint')}
            </p>
          )}
          {!isEdit ? (
            <Tabs value={tab} onValueChange={(v) => setTab(v as 'off' | 'manual' | 'barcode')}>
              <TabsList>
                <TabsTrigger value="off">{t('tabs.off')}</TabsTrigger>
                <TabsTrigger value="manual">{t('tabs.manual')}</TabsTrigger>
                <TabsTrigger value="barcode">{t('tabs.barcode')}</TabsTrigger>
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
                {barcodeBanner && (
                  <p className="text-sm rounded-md border border-dashed p-2 text-muted-foreground">
                    {t(
                      barcodeBanner === 'new'
                        ? 'barcode.bannerNew'
                        : barcodeBanner === 'found'
                          ? 'barcode.bannerFound'
                          : 'barcode.bannerComplete',
                    )}
                  </p>
                )}
                <IngredientFormFields value={form} onChange={setForm} idPrefix="manual" />
              </TabsContent>

              <TabsContent value="barcode" className="space-y-4">
                <BarcodeTab
                  onResolved={(r) => {
                    setScannedBarcode(r.code);
                    // "found" (OFF already has the energy value) → just review
                    // & save; "complete" (no energy value) → fill the gaps.
                    setBarcodeBanner(r.complete ? 'found' : 'complete');
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
                    setTab('manual');
                  }}
                  onNotFound={(code) => {
                    setScannedBarcode(code);
                    setBarcodeBanner('new');
                    setPickedOFF(null);
                    // OFF has nothing for this barcode — clear any data left
                    // over from a previous scan/resolve so the manual form
                    // starts blank (otherwise the prior product's macros leak
                    // into this unknown product, risking a wrong save/contrib).
                    setForm({ ...emptyForm });
                    setTab('manual');
                  }}
                />
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

interface BarcodeTabProps {
  onResolved: (result: OFFProductLookup) => void;
  /** 404 / genuinely-not-in-OFF: the parent stashes the barcode + switches to
   *  the manual tab with the "new product" banner (R-21). */
  onNotFound: (code: string) => void;
}

export function BarcodeTab({ onResolved, onNotFound }: BarcodeTabProps) {
  const { t } = useTranslation('ingredientes');
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState('');
  const lookup = useBarcodeLookup();

  async function resolve(code: string) {
    setScanning(false);
    try {
      const result = await lookup.mutateAsync(code);
      if (result) onResolved(result);
      else onNotFound(code); // genuine "not in OFF" (incl. 404 → null)
    } catch {
      // Transport / 5xx error — already surfaced by useBarcodeLookup's
      // onError toast. The parent's banner is reserved for the not-found
      // path, so we don't mislabel a network failure here.
    }
  }

  return (
    <div className="space-y-3">
      {scanning ? (
        <BarcodeScanner onDetected={(code) => void resolve(code)} />
      ) : (
        <Button type="button" variant="outline" className="w-full" onClick={() => setScanning(true)}>
          {t('barcode.startScan')}
        </Button>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor="barcode-manual">{t('barcode.manualLabel')}</Label>
          <Input
            id="barcode-manual"
            inputMode="numeric"
            placeholder="5000112637922"
            value={manual}
            onChange={(e) => setManual(e.target.value.replace(/\D/g, ''))}
          />
        </div>
        <Button
          type="button"
          disabled={!isValidEan(manual) || lookup.isPending}
          onClick={() => void resolve(manual)}
        >
          {lookup.isPending ? t('barcode.looking') : t('barcode.lookup')}
        </Button>
      </div>
    </div>
  );
}
