import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Apple, Check, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog';
import { QuantityStepper, roundToStep } from '@/components/ui/QuantityStepper';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useLocalIngredientSearch } from '@/features/ingredients/hooks';
import { IngredientDialog } from '@/features/ingredients/components/IngredientDialog';
import { ingredientDisplayName, type Ingredient } from '@/features/ingredients/api';
import { useNum } from '@/hooks/useNum';
import { rowContribution, roundMacro } from '../macros';
import { cn } from '@/lib/utils';

/**
 * Per-unit ingredients step by whole units from 1; per-100 g ingredients start
 * at a round 100 g and step by 10 — recipe quantities are batch-sized (500 g of
 * chicken), not the 5 g granularity the diario's ración step wants. The exact
 * amount is typed into the row's own quantity input once the row exists; the
 * stepper is for landing near it in one gesture.
 */
function stepConfig(ingredient: Ingredient): { initial: number; min: number; step: number } {
  return ingredient.unit_type === 'unit'
    ? { initial: 1, min: 1, step: 1 }
    : { initial: 100, min: 10, step: 10 };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The recipe being edited — the header's "a «…»" subline. Empty while creating. */
  recipeName: string;
  /** Commit: append a row to the recipe. The sheet closes itself afterwards. */
  onAdd: (ingredient: Ingredient, quantity: number) => void;
}

/**
 * The canvas's `AddIngredienteSheet` (`RecetaAddIngredienteMobile`): search your
 * ingredient base, tap a result to expand it inline with a quantity stepper and
 * a live kcal readout, then add it to the recipe. Mobile's replacement for the
 * web table's inline search footer, which is unreachable with a thumb.
 *
 * It is NOT a second autocomplete: the search is `useLocalIngredientSearch`,
 * the same query `IngredientAutocomplete` runs, debounced the same way.
 *
 * The canvas's "¿No encuentras lo que buscas? → Crear un alimento nuevo" footer
 * is wired as of R-33 wave 6 (it was wave 5's declared gap). It opens the slim
 * create dialog, and the created row lands in `select()` — it becomes the
 * expanded row with the quantity stepper, NOT an `onAdd` with a quantity nobody
 * chose. That dialog is a Radix Dialog and this shell is a vaul Drawer on
 * mobile, so it is rendered as a SIBLING of the shell: it opens on top of the
 * drawer rather than inside its scrolling body.
 *
 * Still deliberately absent (drawn by the canvas): the barcode button. Scanning
 * is a full-screen route of its own (`/recipes/ingredients/scan`), and routing
 * there from inside the recipe editor would abandon the editor's unsaved rows.
 */
export function AddIngredientSheet({ open, onOpenChange, recipeName, onAdd }: Props) {
  const { t, i18n } = useTranslation('recetas');
  const { t: tCommon } = useTranslation('common');
  const num = useNum();
  const lang: 'es' | 'en' = i18n.language?.startsWith('en') ? 'en' : 'es';

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Ingredient | null>(null);
  const [qty, setQty] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const debounced = useDebouncedValue(query, 200);

  // Reset on the closed → open transition, so a stale query/selection from the
  // previous open never leaks through. Keyed on `open` alone: unlike
  // AddToDaySheet, this sheet reads no prop that can settle *after* it opens, so
  // a plain dependency does the job that sheet needed a ref guard for.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(null);
    setQty(0);
    setCreateOpen(false);
  }, [open]);

  // Same as the autocomplete: no fetch until the user has typed something.
  //
  // Gated on the DEBOUNCED value, not the raw query: for the ~200 ms between a
  // keystroke and the debounce settling, the fetch is still disabled (enabled
  // above is the same debounced check), so `isLoading` is false and `results`
  // is still whatever the previous state was — gating on the raw query here
  // made that window render "no hay resultados" (plus a `0` counter) before
  // "buscando…" ever got a chance to show.
  const search = useLocalIngredientSearch(debounced, 12, debounced.trim() !== '');
  const results = search.data ?? [];
  const typed = debounced.trim() !== '';

  // A just-created ingredient is selected before the search that would surface
  // it has re-run — and the user may well have renamed it inside the dialog, so
  // this query might never match it at all. Pin it to the top, so its row (and
  // its stepper, and its "añadir") exists the instant the ingredient does.
  const shown =
    selected && !results.some((r) => r.id === selected.id) ? [selected, ...results] : results;

  function select(ing: Ingredient) {
    setSelected(ing);
    setQty(stepConfig(ing).initial);
  }

  function commit() {
    if (!selected || qty <= 0) return;
    onAdd(selected, qty);
    onOpenChange(false);
  }

  // The live readout. `rowContribution` is the frozen macro authority — an
  // ingredient counted "en total" contributes exactly its own quantity, so
  // servings are irrelevant here and 1 is the honest argument.
  const addedKcal = selected
    ? roundMacro(rowContribution({ ingredient: selected, quantity: qty, perServing: false }, 1).kcal)
    : 0;

  const cfg = selected ? stepConfig(selected) : null;
  const unitLabel = selected
    ? selected.unit_type === 'unit'
      ? t('addSheet.units')
      : t('addSheet.grams')
    : '';

  return (
    <>
      <ResponsiveDialog
        open={open}
        onOpenChange={onOpenChange}
        title={t('addSheet.title')}
        variant="panel"
      >
        {({ isMobile }) => (
          <>
            <div className="shrink-0 space-y-3 px-4.5 pb-3 pt-1">
              <div className="flex items-start gap-2.5">
                <div className="min-w-0 flex-1">
                  <h2 className="text-[18px] font-semibold">{t('addSheet.title')}</h2>
                  {recipeName.trim() !== '' && (
                    <span className="block truncate text-[11.5px] text-text-dim">
                      {t('addSheet.toRecipe', { name: recipeName.trim() })}
                    </span>
                  )}
                </div>
                {/* Only the vaul Drawer needs one — DialogContent draws its own X.
                    Labelled "Cerrar"/"Close", not "Cancelar": it dismisses the
                    sheet, it does not cancel a pending action — and "Cancelar"
                    is already the row-delete confirm's button name elsewhere in
                    this editor, so reusing it here collided two different
                    controls under one accessible name. */}
                {isMobile && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-[30px] w-[30px] shrink-0 rounded-[9px] text-muted-foreground"
                    aria-label={tCommon('close')}
                    onClick={() => onOpenChange(false)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder={t('addSheet.searchPlaceholder')}
                  aria-label={t('addSheet.searchPlaceholder')}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSelected(null);
                  }}
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4.5 pb-4">
              {typed && (
                <div className="flex items-baseline justify-between px-1 pb-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-text-dim">
                    {t('addSheet.resultsLabel')}
                  </span>
                  <span className="tnum text-[10px] text-text-dim">{shown.length}</span>
                </div>
              )}

              {!typed && shown.length === 0 && (
                <p className="px-1 py-6 text-center text-[12.5px] text-muted-foreground">
                  {t('addSheet.prompt')}
                </p>
              )}
              {typed && search.isLoading && (
                <p className="px-1 py-6 text-center text-[12.5px] text-muted-foreground">
                  {t('autocomplete.searching')}
                </p>
              )}
              {typed && !search.isLoading && shown.length === 0 && (
                <p className="px-1 py-6 text-center text-[12.5px] text-muted-foreground">
                  {t('autocomplete.noResults')}
                </p>
              )}

              {shown.map((ing) => {
                const name = ingredientDisplayName(ing, lang);
                const perLabel =
                  ing.unit_type === 'unit' ? t('addSheet.perUnit') : t('addSheet.per100g');

                if (selected?.id !== ing.id) {
                  return (
                    <button
                      key={ing.id}
                      type="button"
                      onClick={() => select(ing)}
                      aria-label={t('addSheet.choose', { name })}
                      className="flex w-full items-center gap-2.5 rounded-[13px] border border-border bg-card px-2.5 py-2 text-left hover:bg-muted"
                    >
                      <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-muted text-muted-foreground">
                        <Apple className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-semibold">{name}</span>
                        <span className="tnum block truncate text-[11px] text-text-dim">
                          {[ing.brand, `${num.qty(ing.kcal_per_unit)} kcal · ${perLabel}`]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      <span className="flex size-[30px] shrink-0 items-center justify-center rounded-[9px] border border-border bg-card text-accent-ink">
                        <Plus className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  );
                }

                // The selected result, expanded in place: quantity + what it adds.
                return (
                  <div
                    key={ing.id}
                    className="overflow-hidden rounded-[13px] border-[1.5px] border-accent bg-accent-soft"
                  >
                    <div className="flex items-center gap-2.5 px-2.5 py-2">
                      <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-card text-muted-foreground">
                        <Apple className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-semibold">{name}</p>
                        <p className="tnum truncate text-[11px] text-text-dim">
                          {num.qty(ing.kcal_per_unit)} kcal · {perLabel}
                        </p>
                      </div>
                      <Check className="size-4 shrink-0 text-accent" aria-hidden="true" />
                    </div>

                    {cfg && (
                      <div className="flex items-center gap-3 border-t border-accent-line px-2.5 py-2.5">
                        <QuantityStepper
                          value={qty}
                          unitLabel={unitLabel}
                          lang={lang}
                          decreaseLabel={t('addSheet.decreaseQty')}
                          increaseLabel={t('addSheet.increaseQty')}
                          onMinus={() => setQty((v) => roundToStep(v - cfg.step, cfg.step, cfg.min))}
                          onPlus={() => setQty((v) => roundToStep(v + cfg.step, cfg.step, cfg.min))}
                        />
                        <div className="flex flex-1 flex-col items-end gap-0.5">
                          <span className="tnum text-[17px] font-semibold text-accent-ink">
                            +{num.qty(addedKcal)}{' '}
                            <span className="text-[11px] font-normal">{t('detail.kcalUnit')}</span>
                          </span>
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={commit}
                      className={cn(
                        'flex h-11 w-full items-center justify-center gap-1.5',
                        'bg-accent text-[13.5px] font-semibold text-accent-foreground',
                      )}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      {t('addSheet.add')}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* The escape hatch, always reachable: the base is a shared library
                and not everything is in it. A thumb cannot leave for the editor
                route without abandoning the recipe's unsaved rows, so the create
                surface comes here instead. */}
            <div className="shrink-0 space-y-2 border-t border-border bg-card px-4.5 py-3">
              <p className="text-center text-[11.5px] text-text-dim">
                {t('addSheet.notFoundTitle')}
              </p>
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full gap-1.5 text-[12.5px] font-semibold"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t('addSheet.create')}
              </Button>
            </div>
          </>
        )}
      </ResponsiveDialog>

      {/* `select`, never `onAdd`: the user has not chosen a quantity yet. */}
      <IngredientDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultName={query}
        onSaved={select}
      />
    </>
  );
}
