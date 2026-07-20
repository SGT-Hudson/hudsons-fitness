import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Barcode, RotateCcw, Zap } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberField } from '@/components/ui/NumberField';
import { deriveAutoKcal } from '@/core/autoKcal';
import { parseDecimalInput } from '@/lib/number';
import { useNum } from '@/hooks/useNum';
import { cn } from '@/lib/utils';
import type { OFFSearchResult } from '@/lib/openfoodfacts';
import type { FieldErrors } from '@/lib/zod';
import {
  emptyForm,
  ingredientToForm,
  offResultToForm,
  parseForm,
  type IngredientFormState,
} from '../ingredientForm';
import { IngredientSourceBadge } from './IngredientSourceBadge';
import { IngredientVerifiedCheck } from './IngredientVerifiedCheck';
import { firstIngredientError, ingredientFormSchema } from '../schema';
import { useCreateManualIngredient, useImportFromOFF, useUpdateIngredient } from '../hooks';
import type { Ingredient } from '../api';

/**
 * The editor's actions live OUTSIDE this component on both surfaces that mount
 * it — the page header (canvas `IngredienteCrearWebV2` / `BackHeader`) and the
 * slim dialog's footer. A `<button form="…">` submits a form it is not inside,
 * so they keep the buttons and this keeps the state.
 */
export const INGREDIENT_EDITOR_FORM_ID = 'ingredient-editor';

/**
 * Auto vs manual is a property of the EDITING SESSION, not of the stored row
 * (spec §3 — there is deliberately no `kcal_is_manual` column). Tracked as
 * explicit state, NOT `formState.dirtyFields`: this form uses `reset()` as a
 * setter (the seed/prefill path), which clobbers dirty tracking.
 */
type KcalMode = 'auto' | 'manual';

export interface IngredientEditorFormProps {
  /**
   * Edit mode: the stored row. Its values seed the form, the origin card shows
   * where it came from, and the save UPDATES it. Absent/null ⇒ create.
   */
  ingredient?: Ingredient | null;
  /**
   * The OpenFoodFacts product this form was seeded from — an OFF search pick or
   * a barcode scan that resolved. **Load-bearing** (Constraint 2): set ⇒ the
   * save imports (`source='openfoodfacts'` + `external_id` = the EAN); unset ⇒
   * the save creates a manual row. Losing it means a scanned product silently
   * lands as a manual row with no EAN. Ignored in edit mode (the stored row's
   * own source is the truth there).
   */
  offProduct?: OFFSearchResult | null;
  /**
   * Seed for a blank create — e.g. the name the user was searching for. Ignored
   * when `ingredient` or `offProduct` is given (those carry their own values).
   * Must be a STABLE reference: a fresh literal on every render re-seeds the
   * form and wipes what the user has typed (memoize it, as `RecetaEditorPage`
   * does with `initial`).
   */
  initialValues?: IngredientFormState;
  /** The saved row — created, imported or updated. */
  onSaved?: (ingredient: Ingredient) => void;
  /**
   * A save started / finished. The surfaces render their save button outside
   * the form (header / dialog footer), so this is how they disable it while the
   * mutation is in flight.
   */
  onSubmittingChange?: (submitting: boolean) => void;
  className?: string;
}

/** Uppercase micro-label that caps every card (canvas `FieldLabel`). */
const CARD_LABEL = 'text-[10px] font-medium uppercase tracking-[0.05em] text-text-dim md:text-[10.5px]';
/** The macro inputs' own label (canvas `MacroInput`'s caption). */
const FIELD_LABEL = 'text-[9.5px] font-medium uppercase tracking-[0.04em] text-muted-foreground md:text-[10.5px]';
/** The macro inputs' own box (canvas `MacroInput`'s value). */
const MACRO_INPUT = 'h-10 text-[14px] font-semibold';

/** The three seeds, in precedence order. Shared by the defaults and the mode. */
type Seed = Pick<IngredientEditorFormProps, 'ingredient' | 'offProduct' | 'initialValues'>;

function buildDefaults(seed: Seed): IngredientFormState {
  if (seed.ingredient) return ingredientToForm(seed.ingredient);
  if (seed.offProduct) return offResultToForm(seed.offProduct);
  return seed.initialValues ?? emptyForm;
}

/**
 * Constraint 4. `auto` ONLY on a blank manual create:
 *  - an OFF/scan seed ⇒ `manual` — OFF's kcal disagrees with Atwater by ±20%
 *    (rounding, fibre, polyols) and the LABEL is the truth, so it is never
 *    overwritten;
 *  - a stored row ⇒ `manual` — a stored kcal is just a number, and calling it
 *    "auto" would be a lie;
 *  - any other seeded kcal ⇒ `manual`, same reasoning.
 */
function initialKcalMode(defaults: IngredientFormState, seed: Seed): KcalMode {
  if (seed.ingredient || seed.offProduct) return 'manual';
  return defaults.kcal_per_unit.trim() === '' ? 'auto' : 'manual';
}

export function IngredientEditorForm({
  ingredient,
  offProduct,
  initialValues,
  onSaved,
  onSubmittingChange,
  className,
}: IngredientEditorFormProps) {
  const { t } = useTranslation('ingredientes');
  const isEdit = !!ingredient;

  const create = useCreateManualIngredient();
  const importOFF = useImportFromOFF();
  const update = useUpdateIngredient();
  const submitting = create.isPending || importOFF.isPending || update.isPending;

  const seed: Seed = useMemo(
    () => ({ ingredient, offProduct, initialValues }),
    [ingredient, offProduct, initialValues],
  );
  const defaults = useMemo(() => buildDefaults(seed), [seed]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<IngredientFormState>({
    resolver: zodResolver(ingredientFormSchema) as never,
    defaultValues: defaults,
  });

  const [kcalMode, setKcalMode] = useState<KcalMode>(() => initialKcalMode(defaults, seed));
  const [error, setError] = useState<string | null>(null);

  // The seed can arrive after mount (the edit route renders once the query
  // resolves). Re-seeding also re-decides the kcal mode — a form that has just
  // been filled from OFF is NOT in auto, whatever it was before.
  useEffect(() => {
    reset(defaults);
    setKcalMode(initialKcalMode(defaults, seed));
  }, [defaults, seed, reset]);

  useEffect(() => {
    onSubmittingChange?.(submitting);
  }, [submitting, onSubmittingChange]);

  const values = watch();
  const perUnit = values.unit_type === 'unit';
  // The macro fields are raw strings and the user may well have typed `8,5`
  // (a Spanish keyboard's default) — so the derivation reads them through the
  // shared parser, exactly as the schema does. `Number('8,5')` would be NaN,
  // and the derived kcal would land in the field as the string "NaN".
  const num = (s: string) => parseDecimalInput(s) ?? 0;
  const autoKcal = deriveAutoKcal({
    proteinG: num(values.protein_g_per_unit),
    carbsG: num(values.carbs_g_per_unit),
    fatG: num(values.fat_g_per_unit),
  });

  // THE derivation. `setValue` (unlike a real keystroke) does not fire the
  // field's registered `onChange`, so writing kcal here can never be mistaken
  // for the user taking it over.
  useEffect(() => {
    if (kcalMode !== 'auto') return;
    setValue('kcal_per_unit', String(autoKcal));
  }, [autoKcal, kcalMode, setValue]);

  // Registered once so the JSX below can both spread it onto the input and
  // wrap its `onChange` — `register()` returns a fresh object every render.
  const kcalRegister = register('kcal_per_unit');

  // Soft, non-blocking sanity check (kept from the retired `IngredientFormFields`): sugar ⊂
  // carbs, saturated ⊂ fat — only when both sides are filled in. Never blocks.
  const exceeds = (sub: string, parent: string) =>
    sub.trim() !== '' && parent.trim() !== '' && num(sub) > num(parent);
  const showSubWarning =
    exceeds(values.sugar_g_per_unit, values.carbs_g_per_unit) ||
    exceeds(values.saturated_fat_g_per_unit, values.fat_g_per_unit);

  // The OFF caveat: on an OFF-seeded create, and on any stored OFF row. Honest —
  // OFF's figures are community-contributed and the packaging is the truth.
  const isOFF = isEdit ? ingredient.source === 'openfoodfacts' : !!offProduct;
  const ean = isEdit ? ingredient.external_id : (offProduct?.code ?? null);
  const previewSource = isEdit ? ingredient.source : offProduct ? 'openfoodfacts' : 'manual';

  async function onValid() {
    // The save button lives outside this form on both surfaces, so THIS is the
    // only place that can refuse a second submit while the first is in flight —
    // a double-click would otherwise create the ingredient twice.
    if (submitting) return;
    setError(null);
    // zodResolver already passed, so this cannot be null; `parseForm` is reused
    // purely to normalize (brand → null, blank fiber → 0, blank sub-macro → null).
    const parsed = parseForm(watch());
    if (!parsed) {
      setError(t('errors.invalid'));
      return;
    }
    try {
      let saved: Ingredient;
      if (ingredient) {
        saved = await update.mutateAsync({ id: ingredient.id, patch: parsed });
      } else if (offProduct) {
        // Constraint 2: the product carries the EAN into `external_id` and the
        // row's `source='openfoodfacts'`. Dropping this branch would save a
        // scanned product as an anonymous manual row.
        saved = await importOFF.mutateAsync({ product: offProduct, overrides: parsed });
      } else {
        saved = await create.mutateAsync(parsed);
      }
      onSaved?.(saved);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const validationCode = firstIngredientError(errors as FieldErrors);
  const validationError = validationCode ? t(`errors.${validationCode}`) : null;

  return (
    <form
      id={INGREDIENT_EDITOR_FORM_ID}
      onSubmit={handleSubmit(onValid)}
      className={cn('grid gap-3 md:grid-cols-[1fr_360px] md:items-start md:gap-4', className)}
    >
      <div className="min-w-0 space-y-3 md:space-y-3.5">
        {/* Identidad */}
        <Card className="space-y-3 p-3.5 md:p-4">
          <h2 className={CARD_LABEL}>{t('editor.identity')}</h2>
          <div className="space-y-1.5">
            <Label htmlFor="ing-name" className={FIELD_LABEL}>
              {t('form.name')}
            </Label>
            <Input
              id="ing-name"
              placeholder={t('editor.namePlaceholder')}
              className="h-11 text-[16px] font-semibold md:text-[18px]"
              {...register('name')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ing-brand" className={FIELD_LABEL}>
              {t('form.brand')}{' '}
              <span className="normal-case tracking-normal text-text-dim">
                · {t('editor.optional')}
              </span>
            </Label>
            <Input
              id="ing-brand"
              placeholder={t('editor.brandPlaceholder')}
              className="h-10 text-[13.5px] font-medium"
              {...register('brand')}
            />
          </div>
        </Card>

        {/* Unidad base — the segmented control. Single-select, so a radiogroup:
            `unit_type` decides whether every figure below means "per 100 g" or
            "per unit". */}
        <Card className="space-y-2.5 p-3.5 md:p-4">
          <div className="flex items-center gap-2">
            <h2 id="ing-unit-label" className={CARD_LABEL}>
              {t('editor.baseUnit')}
            </h2>
            <span className="ml-auto text-[10px] text-text-dim md:text-[11px]">
              {perUnit ? t('editor.baseUnitHintUnit') : t('editor.baseUnitHintGram')}
            </span>
          </div>
          <div
            role="radiogroup"
            aria-labelledby="ing-unit-label"
            className="flex gap-1 rounded-[10px] border bg-muted p-[3px]"
          >
            {(['gram', 'unit'] as const).map((key) => {
              const on = values.unit_type === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setValue('unit_type', key, { shouldDirty: true })}
                  className={cn(
                    'flex-1 rounded-[8px] border px-2 py-1.5 text-center transition-colors',
                    on
                      ? 'border-accent-line bg-card shadow-card'
                      : 'border-transparent hover:bg-card/60',
                  )}
                >
                  <span
                    className={cn(
                      'tnum block text-[12.5px] font-semibold md:text-[13px]',
                      on ? 'text-accent-ink' : 'text-foreground',
                    )}
                  >
                    {key === 'gram' ? t('editor.unitGram') : t('editor.unitUnit')}
                  </span>
                  <span className="block text-[9px] text-text-dim md:text-[9.5px]">
                    {key === 'gram' ? t('editor.unitGramCaption') : t('editor.unitUnitCaption')}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Macros */}
        <Card className="space-y-3 p-3.5 md:p-4">
          <div className="flex items-center gap-2">
            <h2 className={CARD_LABEL}>
              {perUnit ? t('editor.macrosUnit') : t('editor.macrosGram')}
            </h2>
            {isOFF && <IngredientSourceBadge source="openfoodfacts" className="ml-auto" />}
          </div>

          {isOFF && (
            <p className="flex items-start gap-1.5 text-[10.5px] leading-[1.45] text-amber-ink">
              <Zap className="mt-px size-3 shrink-0" aria-hidden="true" />
              {t('editor.offCaveat')}
            </p>
          )}

          {/* Calorías — auto-derived (spec §3), ALWAYS editable (a product
              decision that overrides the canvas: a read-only field cannot be
              "sobrescrita", so the canvas's own caption contradicted its own
              read-only treatment). While AUTO the field shows the `auto` chip
              and the live derivation. The moment the user types a real
              keystroke into it — as opposed to the derivation's own
              `setValue` below, which never fires `onChange` — the chip drops
              and auto stops overwriting.
              "Volver a automático" is the way back (Constraint 5). */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label htmlFor="ing-kcal" className={FIELD_LABEL}>
                {t('editor.kcal')}
              </Label>
              {kcalMode === 'auto' ? (
                <span className="rounded-full border bg-muted px-1.5 py-px text-[8.5px] font-medium text-muted-foreground">
                  {t('editor.autoChip')}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setKcalMode('auto')}
                  className="ml-auto inline-flex items-center gap-1 rounded-full border border-accent-line bg-accent-soft px-2 py-0.5 text-[9.5px] font-medium text-accent-ink"
                >
                  <RotateCcw className="size-2.5" aria-hidden="true" />
                  {t('editor.backToAuto')}
                </button>
              )}
            </div>
            {/* No `label` — the label sits in the row above, next to the auto
                chip / "volver a automático". No `required` either: `type="text"`
                (the only way a typed comma survives) would still enforce it, but
                the browser's bubble preempts the schema's own message — so zod
                owns the gate now (`numberRequired`). */}
            <NumberField
              id="ing-kcal"
              suffix={t('list.kcalUnit')}
              className={cn(
                'h-10 pr-11 text-[15px] font-semibold',
                kcalMode === 'auto' && 'bg-muted text-muted-foreground',
              )}
              {...kcalRegister}
              onChange={(e) => {
                void kcalRegister.onChange(e);
                if (kcalMode === 'auto') setKcalMode('manual');
              }}
            />
            {kcalMode === 'auto' && (
              <p className="flex items-center gap-1.5 text-[10.5px] text-text-dim">
                <Zap className="size-3 shrink-0" aria-hidden="true" />
                {t('editor.autoHint')}
              </p>
            )}
          </div>

          {/* The macro block. `NumberField` (shared) replaced this file's
              private `MacroField`: `type="text" inputMode="decimal"`, so a
              typed comma reaches the schema instead of being silently stripped.
              With it went `required` (zod's `numberRequired` owns the blank now,
              and says why) and the hardcoded `max={100}` — which BLOCKED a
              legitimate save: one unit of something can hold more than 100 g of
              a macro. */}
          <div className="grid grid-cols-3 gap-2.5">
            <NumberField
              id="ing-protein"
              label={t('editor.protein')}
              dot="protein"
              suffix="g"
              labelClassName={FIELD_LABEL}
              className={MACRO_INPUT}
              {...register('protein_g_per_unit')}
            />
            <NumberField
              id="ing-carbs"
              label={t('editor.carbs')}
              dot="carbs"
              suffix="g"
              labelClassName={FIELD_LABEL}
              className={MACRO_INPUT}
              {...register('carbs_g_per_unit')}
            />
            <NumberField
              id="ing-fat"
              label={t('editor.fat')}
              dot="fat"
              suffix="g"
              labelClassName={FIELD_LABEL}
              className={MACRO_INPUT}
              {...register('fat_g_per_unit')}
            />
          </div>

          {/* The "of which" sub-macros — subsets of carbs / fat, hence the ↳.
              BLANK means UNKNOWN (null), never 0. */}
          <div className="grid grid-cols-2 gap-2.5">
            <NumberField
              id="ing-sugar"
              label={t('editor.sugar')}
              dot="carbs"
              sub
              suffix="g"
              labelClassName={FIELD_LABEL}
              className={MACRO_INPUT}
              {...register('sugar_g_per_unit')}
            />
            <NumberField
              id="ing-satfat"
              label={t('editor.satFat')}
              dot="fat"
              sub
              suffix="g"
              labelClassName={FIELD_LABEL}
              className={MACRO_INPUT}
              {...register('saturated_fat_g_per_unit')}
            />
          </div>

          <div className="h-px bg-border" />

          <div className="grid grid-cols-2 gap-2.5">
            <NumberField
              id="ing-fiber"
              label={t('editor.fiber')}
              dot="fiber"
              suffix="g"
              labelClassName={FIELD_LABEL}
              className={MACRO_INPUT}
              {...register('fiber_g_per_unit')}
            />
            {/* Salt: an optional sub-macro on the same contract as sugar /
                saturated fat — blank = unknown (NULL), never 0. */}
            <NumberField
              id="ing-salt"
              label={t('editor.salt')}
              suffix="g"
              labelClassName={FIELD_LABEL}
              className={MACRO_INPUT}
              {...register('salt_g_per_unit')}
            />
          </div>

          {showSubWarning && <p className="text-[10.5px] text-tone-warn">{t('form.subMacroWarning')}</p>}
        </Card>

        {/* Origen del dato — edit only: there is no origin to state before the
            row exists. The "marcar como verificada" toggle the canvas draws is
            CUT (spec §4): `is_verified` is a global claim about a shared-pool
            row and no policy governs who may make it. The badge is read-only. */}
        {isEdit && (
          <Card className="space-y-2.5 p-3.5 md:p-4">
            <h2 className={CARD_LABEL}>{t('editor.origin')}</h2>
            <div className="flex items-center gap-2">
              <IngredientSourceBadge source={ingredient.source} />
              <IngredientVerifiedCheck verified={ingredient.is_verified} />
            </div>
            {ean && (
              <div className="flex items-center gap-2 text-[11px] text-text-dim">
                <Barcode className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="sr-only">{t('editor.barcode')}</span>
                <span className="font-mono text-[11px] text-foreground">{ean}</span>
              </div>
            )}
          </Card>
        )}

        {(validationError || error) && (
          <p role="alert" className="text-sm text-destructive">
            {validationError ?? error}
          </p>
        )}
      </div>

      {/* The live preview — the list row the user is about to create, recomputed
          from `watch()` on every keystroke (the `RecipeEditorForm` live-macros
          precedent). DOM order is the mobile artboard's (it closes the form);
          from `md` up the same node becomes the right rail. */}
      <aside className="md:sticky md:top-4">
        <PreviewCard
          name={values.name}
          brand={values.brand}
          perUnit={perUnit}
          source={previewSource}
          kcal={values.kcal_per_unit}
          protein={values.protein_g_per_unit}
          carbs={values.carbs_g_per_unit}
          fat={values.fat_g_per_unit}
        />
      </aside>
    </form>
  );
}

interface PreviewProps {
  name: string;
  brand: string;
  perUnit: boolean;
  source: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
}

/**
 * "Vista previa · en tu biblioteca" — a replica of the list row, the kcal in
 * full size, the macro triad and the calorie split. Everything here is derived
 * from the live form; nothing is stored.
 *
 * The split's denominator is `deriveAutoKcal` (the Atwater total), NOT the kcal
 * field: a manually-overridden kcal would make the three segments not add up to
 * 100 %, which is a bar that lies. The big number stays the field's — that IS
 * what gets stored.
 */
function PreviewCard({ name, brand, perUnit, source, kcal, protein, carbs, fat }: PreviewProps) {
  const { t } = useTranslation('ingredientes');
  const num = useNum();
  const empty = name.trim() === '';
  // Same parser as the schema: the fields are strings and `8,5` is a valid one.
  const p = Math.max(0, parseDecimalInput(protein) ?? 0);
  const c = Math.max(0, parseDecimalInput(carbs) ?? 0);
  const f = Math.max(0, parseDecimalInput(fat) ?? 0);
  const atwater = deriveAutoKcal({ proteinG: p, carbsG: c, fatG: f });
  const split = [
    { key: 'protein', kcal: p * 4, bar: 'bg-macro-p' },
    { key: 'carbs', kcal: c * 4, bar: 'bg-macro-c' },
    { key: 'fat', kcal: f * 9, bar: 'bg-macro-g' },
  ] as const;
  const kcalText = kcal.trim() === '' ? '0' : num.qty(parseDecimalInput(kcal) ?? 0, 1);

  return (
    <Card role="region" aria-label={t('preview.title')} className="space-y-3 p-3.5 md:p-4">
      <div className="flex items-center gap-2">
        <h2 className={CARD_LABEL}>{t('preview.title')}</h2>
        <span className="ml-auto text-[10px] text-text-dim">{t('preview.inLibrary')}</span>
      </div>

      {/* The list row, as it will look */}
      <div className="grid grid-cols-[1fr_auto] items-center gap-2.5 rounded-[10px] border bg-muted px-3 py-2.5">
        <div className="min-w-0">
          <p
            className={cn(
              'truncate text-[13px] font-semibold md:text-[13.5px]',
              empty && 'text-text-dim',
            )}
          >
            {empty ? t('preview.namePlaceholder') : name}
          </p>
          <p className="truncate text-[10.5px] text-text-dim">
            {brand.trim() === '' ? t('list.generic') : brand}
            {perUnit ? ` · ${t('form.perUnit')}` : ''}
          </p>
        </div>
        <IngredientSourceBadge source={source} />
      </div>

      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            'tnum text-[28px] font-semibold tracking-[-0.03em] md:text-[30px]',
            empty && 'text-text-dim',
          )}
        >
          {empty ? '—' : kcalText}
        </span>
        <span className="text-[11px] text-text-dim md:text-[12px]">
          {t('list.kcalUnit')} · {perUnit ? t('form.perUnit') : t('form.per100g')}
        </span>
      </div>

      <div className="tnum grid grid-cols-3 gap-2">
        {[
          { key: 'protein', label: t('editor.protein'), value: p, dot: 'bg-macro-p' },
          { key: 'carbs', label: t('editor.carbs'), value: c, dot: 'bg-macro-c' },
          { key: 'fat', label: t('editor.fat'), value: f, dot: 'bg-macro-g' },
        ].map((m) => (
          <div key={m.key} className="min-w-0">
            <span className="flex items-center gap-1 text-[9px] uppercase tracking-[0.04em] text-text-dim md:text-[9.5px]">
              <span className={cn('size-[6px] shrink-0 rounded-full', m.dot)} aria-hidden="true" />
              <span className="truncate">{m.label}</span>
            </span>
            <span
              className={cn('block text-[14px] font-semibold md:text-[15px]', empty && 'text-text-dim')}
            >
              {empty ? '—' : `${num.qty(m.value, 1)} g`}
            </span>
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t pt-3">
        <p className="text-[9.5px] uppercase tracking-[0.05em] text-text-dim md:text-[10.5px]">
          {t('preview.split')}
        </p>
        {empty || atwater === 0 ? (
          <div className="h-3 rounded-[6px] bg-muted" />
        ) : (
          <>
            <div className="flex h-3 overflow-hidden rounded-[6px]">
              {split.map((s) => (
                <div
                  key={s.key}
                  className={s.bar}
                  style={{ width: `${(s.kcal / atwater) * 100}%` }}
                />
              ))}
            </div>
            <div className="tnum flex justify-between text-[10.5px] text-muted-foreground">
              {split.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1">
                  <span className={cn('size-[6px] rounded-full', s.bar)} aria-hidden="true" />
                  {t(`macros.letter.${s.key}`)} {num.qty(Math.round((s.kcal / atwater) * 100))} %
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
