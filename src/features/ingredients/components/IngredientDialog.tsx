import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
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
  offResultToForm,
  parseForm,
  type IngredientFormState,
} from './IngredientFormFields';
import { OFFSearchPanel } from './OFFSearchPanel';
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
import { useMediaQuery } from '@/hooks/use-media-query';

type Mode = 'create' | 'edit';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  initial?: Ingredient | null;
  defaultName?: string;
  /**
   * Which create tab to land on when there is no `defaultName` to route by.
   * The Ingredientes list's scan affordances open straight on `barcode`
   * (`/recipes/ingredients/scan` — PR-B replaces this with the full-screen
   * scanner). Defaults to `off`, as before.
   */
  defaultTab?: 'off' | 'manual' | 'barcode';
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
  defaultTab,
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
  const [barcodeBanner, setBarcodeBanner] = useState<'new' | 'complete' | 'found' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const offSearch = useOFFSearch(debouncedQuery, open && !isEdit && tab === 'off');
  const create = useCreateManualIngredient();
  const importOFF = useImportFromOFF();
  const update = useUpdateIngredient();

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPickedOFF(null);
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
        setTab(seed === '' ? (defaultTab ?? 'off') : 'manual');
        setOffQuery('');
      }
      reset({ ...emptyForm, name: seed });
    }
  }, [open, isEdit, initial, defaultName, defaultTab, reset]);

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
            sugar_g_per_unit: parsed.sugar_g_per_unit,
            saturated_fat_g_per_unit: parsed.saturated_fat_g_per_unit,
            salt_g_per_unit: parsed.salt_g_per_unit,
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
                    setForm(offResultToForm(r));
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
                    // "found" (OFF already has the energy value) → just review
                    // & save; "complete" (no energy value) → fill the gaps.
                    setBarcodeBanner(r.complete ? 'found' : 'complete');
                    setPickedOFF(r);
                    setForm(offResultToForm(r));
                    setTab('manual');
                  }}
                  onNotFound={() => {
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
  // Camera scan only makes sense on touch-primary devices (phone/tablet).
  // On desktop a webcam is awkward for product barcodes, so hide the
  // affordance entirely and leave only the typed-code path.
  const isTouchDevice = useMediaQuery('(pointer: coarse)');

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
      {isTouchDevice &&
        (scanning ? (
          <BarcodeScanner onDetected={(code) => void resolve(code)} />
        ) : (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setScanning(true)}
          >
            {t('barcode.startScan')}
          </Button>
        ))}

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
