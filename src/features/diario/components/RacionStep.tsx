import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Trash2, Apple, UtensilsCrossed, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberField } from '@/components/ui/NumberField';
import { QuantityStepper, roundToStep } from '@/components/ui/QuantityStepper';
import { parseDecimalInput } from '@/lib/number';
import { cn } from '@/lib/utils';
import { roundMacro, scale, ZERO_MACROS, type Macros } from '@/features/recipes/macros';
import { useNum } from '@/hooks/useNum';
import { ingredientDisplayName } from '@/features/ingredients/api';
import { ingredientMacros } from '../macros';
import { useCreateMealLog, useUpdateMealLog, useDeleteMealLog } from '../hooks';
import type { CreateMealLogInput, MealLogWithJoins, MealType } from '../api';
import type { TablesUpdate } from '@/types/database';
import type { FieldErrors } from '@/lib/zod';
import { firstMealLogError, mealLogFormSchema, type MealLogFormValues } from '../schema';
import { MacroProjBar } from './MacroProjBar';
import type { AddSheetSelection } from './AddToDaySheet';

interface Props {
  selection: AddSheetSelection;
  mealType: MealType;
  loggedOn: string;
  totals: Macros;
  targets?: Macros;
  /** UI locale, for decimal-comma vs decimal-point qty display. */
  lang: 'es' | 'en';
  onBack: () => void;
  /** Called once the log is created/updated/deleted — the caller closes the sheet. */
  onDone: () => void;
  /**
   * Edit mode (task 5): the existing entry being edited. When set, the step is
   * locked to this entry's kind, the quantity/custom fields pre-fill from it,
   * the CTA updates instead of creating, and a delete affordance appears.
   */
  editing?: MealLogWithJoins | null;
}

function customDefaults(mealType: MealType): MealLogFormValues {
  return {
    mealType,
    source: 'custom',
    hasRecipe: false,
    hasIngredient: false,
    servings: '1',
    quantity: '',
    customName: '',
    customKcal: '',
    customProtein: '',
    customCarbs: '',
    customFat: '',
    customFiber: '',
    notes: '',
  };
}

// Seed the custom form from an existing custom entry when editing (task 5).
function customEditDefaults(log: MealLogWithJoins, mealType: MealType): MealLogFormValues {
  return {
    ...customDefaults(mealType),
    customName: log.custom_name ?? '',
    customKcal: log.custom_kcal == null ? '' : String(log.custom_kcal),
    customProtein: log.custom_protein_g == null ? '' : String(log.custom_protein_g),
    customCarbs: log.custom_carbs_g == null ? '' : String(log.custom_carbs_g),
    customFat: log.custom_fat_g == null ? '' : String(log.custom_fat_g),
    customFiber: log.custom_fiber_g == null ? '' : String(log.custom_fiber_g),
  };
}

// The edit step's initial quantity: recipe servings, ingredient grams/units, or
// the create-flow default (1 serving / 100 g / 1 unit) when not editing.
function initialQty(selection: AddSheetSelection, editing: MealLogWithJoins | null | undefined): number {
  if (editing) {
    if (editing.recipe_id) return Number(editing.servings ?? 1);
    if (editing.ingredient_id) return Number(editing.quantity ?? 0);
  }
  return selection.kind === 'ingredient'
    ? selection.ingredient.unit_type === 'unit'
      ? 1
      : 100
    : 1;
}

/** ½-step-and-up stepper config per selection kind — recipe servings step in
 * quarters (0.25); a loose ingredient steps by whole units or 5 g at a time
 * (no existing convention for a gram +/- stepper — 5 g chosen for sensible
 * one-tap granularity). */
function stepperConfig(selection: AddSheetSelection): { min: number; step: number } | null {
  if (selection.kind === 'recipe') return { min: 0.25, step: 0.25 };
  if (selection.kind === 'ingredient') {
    return selection.ingredient.unit_type === 'unit' ? { min: 1, step: 1 } : { min: 5, step: 5 };
  }
  return null;
}

function parseKcalPreview(v: string): number {
  return parseDecimalInput(v) ?? 0;
}

/** This serving's macro contribution — the live projection driver. Pure math,
 * same helpers the create mutation's source shape is built from. */
function projectedAdded(
  selection: AddSheetSelection,
  qty: number,
  custom: MealLogFormValues,
): Macros {
  if (selection.kind === 'recipe') return scale(selection.recipe.perServing ?? ZERO_MACROS, qty);
  if (selection.kind === 'ingredient') return ingredientMacros(selection.ingredient, qty);
  return {
    kcal: parseKcalPreview(custom.customKcal),
    proteinG: parseDecimalInput(custom.customProtein) ?? 0,
    carbsG: parseDecimalInput(custom.customCarbs) ?? 0,
    fatG: parseDecimalInput(custom.customFat) ?? 0,
    fiberG: parseDecimalInput(custom.customFiber) ?? 0,
  };
}

/**
 * The "ración" step of AddToDaySheet (Task 4, R-33 wave 2 PR-B): quantity
 * stepper (or, for a custom entry, the typed macro fields), a live projected
 * kcal readout against the phase target, a MacroProjBar per P/C/G, an amber
 * over-target alert, and the create-mutation wiring.
 *
 * Pure projection math only — the create path always has `perServing` on a
 * recipe selection (it comes from the explore step); edit mode (where it may
 * be absent) is Task 5's concern, not handled here.
 */
export function RacionStep({
  selection,
  mealType,
  loggedOn,
  totals,
  targets,
  lang,
  onBack,
  onDone,
  editing,
}: Props) {
  const { t } = useTranslation('diario');
  const num = useNum();
  const create = useCreateMealLog();
  const update = useUpdateMealLog();
  const del = useDeleteMealLog();
  const isEdit = !!editing;
  const mealLabel = t(`mealType.${mealType}`);

  const stepCfg = stepperConfig(selection);
  const [qty, setQty] = useState(() => initialQty(selection, editing));

  const customForm = useForm<MealLogFormValues>({
    resolver: zodResolver(mealLogFormSchema),
    defaultValues:
      editing && selection.kind === 'custom'
        ? customEditDefaults(editing, mealType)
        : customDefaults(mealType),
  });
  const [customError, setCustomError] = useState<string | null>(null);
  const customValues = customForm.watch();

  const name =
    selection.kind === 'recipe'
      ? selection.recipe.name
      : selection.kind === 'ingredient'
        ? ingredientDisplayName(selection.ingredient, lang)
        : customValues.customName.trim() || t('addSheet.customTitle');

  const Icon =
    selection.kind === 'recipe' ? UtensilsCrossed : selection.kind === 'ingredient' ? Apple : Pencil;

  const unitLabel =
    selection.kind === 'recipe'
      ? qty === 1
        ? t('addSheet.unitServing')
        : t('addSheet.unitServings')
      : selection.kind === 'ingredient'
        ? selection.ingredient.unit_type === 'unit'
          ? t('units.unit')
          : 'g'
        : '';

  const added = projectedAdded(selection, qty, customValues);
  const projectedKcal = totals.kcal + added.kcal;
  const over = targets ? projectedKcal > targets.kcal : false;

  async function submit(source: CreateMealLogInput['source']) {
    try {
      await create.mutateAsync({ loggedOn, mealType, source, notes: null });
      onDone();
    } catch {
      // The mutation's onError already surfaced a toast — stay on the sheet
      // so the user can retry rather than silently discarding their pick.
    }
  }

  // Edit mode: patch only the editable fields (qty / custom macros) plus the
  // meal slot (the header selector may have moved it). `notes` is left out on
  // purpose — the add-flow has no notes field, so omitting it preserves any
  // note the entry already carries rather than nulling it.
  async function submitUpdate(patch: TablesUpdate<'meal_logs'>) {
    if (!editing) return;
    try {
      await update.mutateAsync({ id: editing.id, patch });
      onDone();
    } catch {
      // onError already toasted — stay on the sheet so the user can retry.
    }
  }

  function handleAdd() {
    if (selection.kind === 'recipe') {
      void submit({ kind: 'recipe', recipeId: selection.recipe.id, servings: qty });
      return;
    }
    if (selection.kind === 'ingredient') {
      void submit({ kind: 'ingredient', ingredientId: selection.ingredient.id, quantity: qty });
      return;
    }
    void customForm.handleSubmit(
      (v) => {
        setCustomError(null);
        void submit({
          kind: 'custom',
          name: v.customName.trim(),
          // The schema validated these, so kcal parses; a blank sub-macro is
          // null — UNKNOWN, never 0 (U-1). Both read the shared comma-aware
          // parser (invariant 6), the same one the schema validated with.
          kcal: parseDecimalInput(v.customKcal) ?? 0,
          proteinG: parseDecimalInput(v.customProtein),
          carbsG: parseDecimalInput(v.customCarbs),
          fatG: parseDecimalInput(v.customFat),
          fiberG: parseDecimalInput(v.customFiber),
        });
      },
      (errors) => {
        const code = firstMealLogError(errors as FieldErrors);
        setCustomError(code ? t(`errors.${code}`) : null);
      },
    )();
  }

  function handleSave() {
    if (selection.kind === 'recipe') {
      void submitUpdate({ meal_type: mealType, servings: qty });
      return;
    }
    if (selection.kind === 'ingredient') {
      void submitUpdate({ meal_type: mealType, quantity: qty });
      return;
    }
    void customForm.handleSubmit(
      (v) => {
        setCustomError(null);
        void submitUpdate({
          meal_type: mealType,
          custom_name: v.customName.trim(),
          custom_kcal: parseDecimalInput(v.customKcal) ?? 0,
          custom_protein_g: parseDecimalInput(v.customProtein),
          custom_carbs_g: parseDecimalInput(v.customCarbs),
          custom_fat_g: parseDecimalInput(v.customFat),
          custom_fiber_g: parseDecimalInput(v.customFiber),
        });
      },
      (errors) => {
        const code = firstMealLogError(errors as FieldErrors);
        setCustomError(code ? t(`errors.${code}`) : null);
      },
    )();
  }

  async function handleDelete() {
    if (!editing) return;
    if (!window.confirm(t('dialog.deleteConfirm'))) return;
    try {
      await del.mutateAsync(editing.id);
      onDone();
    } catch {
      // onError already toasted.
    }
  }

  const pending = create.isPending || update.isPending || del.isPending;

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-4.5 py-4">
      {isEdit ? (
        <button
          type="button"
          onClick={() => void handleDelete()}
          disabled={pending}
          className="mb-3 inline-flex items-center gap-1.5 self-start text-[12.5px] text-destructive disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t('addSheet.deleteCta')}
        </button>
      ) : (
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1.5 self-start text-[12.5px] text-muted-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('addSheet.backToExplore')}
        </button>
      )}

      <div className="flex items-center gap-2.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{name}</p>
          <p className={cn('text-[11.5px]', over ? 'text-amber-ink' : 'text-accent-ink')}>
            {t('addSheet.toMeal', { meal: mealLabel })}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3.5">
        {stepCfg && (
          <QuantityStepper
            value={qty}
            unitLabel={unitLabel}
            lang={lang}
            decreaseLabel={t('addSheet.decreaseQty')}
            increaseLabel={t('addSheet.increaseQty')}
            onMinus={() => setQty((v) => roundToStep(v - stepCfg.step, stepCfg.step, stepCfg.min))}
            onPlus={() => setQty((v) => roundToStep(v + stepCfg.step, stepCfg.step, stepCfg.min))}
          />
        )}
        <div className="flex flex-1 flex-col items-end">
          <div className="flex items-baseline gap-1">
            <span
              className={cn(
                'tabular-nums text-[26px] font-semibold tracking-tight',
                over && 'text-amber-ink',
              )}
            >
              {num.qty(roundMacro(projectedKcal))}
            </span>
            {targets && (
              <span className={cn('text-xs', over ? 'text-amber-ink' : 'text-muted-foreground')}>
                / {num.qty(roundMacro(targets.kcal))}
              </span>
            )}
          </div>
          {targets ? (
            <span
              className={cn(
                'tabular-nums text-[11.5px]',
                over ? 'font-semibold text-amber-ink' : 'text-muted-foreground',
              )}
            >
              {over
                ? t('addSheet.projOver', { n: roundMacro(projectedKcal - targets.kcal) })
                : t('addSheet.projRemaining', { n: roundMacro(targets.kcal - projectedKcal) })}
            </span>
          ) : (
            <span className="text-[11.5px] text-muted-foreground">{t('totals.targetsHint')}</span>
          )}
        </div>
      </div>

      {selection.kind === 'custom' && (
        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="racion-custom-name">{t('fields.customName')}</Label>
            <Input id="racion-custom-name" {...customForm.register('customName')} />
          </div>
          {/* Fraction-capable, so `NumberField` (`type="text"
              inputMode="decimal"`): a Spanish keyboard types `30,5` and a
              `type="number"` element would hand React "305". `min={0}` went
              with it — the schema's `customMacroInvalid` rule is the gate now. */}
          <div className="grid grid-cols-3 gap-2.5">
            <NumberField
              id="racion-custom-kcal"
              label={t('fields.kcal')}
              labelClassName="text-xs"
              {...customForm.register('customKcal')}
            />
            <NumberField
              id="racion-custom-protein"
              label={t('fields.protein')}
              labelClassName="text-xs"
              {...customForm.register('customProtein')}
            />
            <NumberField
              id="racion-custom-carbs"
              label={t('fields.carbs')}
              labelClassName="text-xs"
              {...customForm.register('customCarbs')}
            />
            <NumberField
              id="racion-custom-fat"
              label={t('fields.fat')}
              labelClassName="text-xs"
              {...customForm.register('customFat')}
            />
            <NumberField
              id="racion-custom-fiber"
              label={t('fields.fiber')}
              labelClassName="text-xs"
              {...customForm.register('customFiber')}
            />
          </div>
        </div>
      )}

      {targets && (
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-text-dim">
              {t('addSheet.macroBalanceLabel')}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="space-y-2">
            <MacroProjBar
              metric="protein"
              base={totals.proteinG}
              added={added.proteinG}
              target={targets.proteinG}
            />
            <MacroProjBar metric="carbs" base={totals.carbsG} added={added.carbsG} target={targets.carbsG} />
            <MacroProjBar metric="fat" base={totals.fatG} added={added.fatG} target={targets.fatG} />
          </div>
        </div>
      )}

      {over && (
        <div className="mt-3 flex items-center gap-2 rounded-[11px] border border-amber bg-amber-soft px-3 py-2.5">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />
          <span className="text-[11.5px] leading-snug text-amber-ink">{t('addSheet.overAlert')}</span>
        </div>
      )}

      {customError && <p className="mt-2 text-[12.5px] text-destructive">{customError}</p>}

      <div className="flex-1" />
      <Button
        type="button"
        onClick={isEdit ? handleSave : handleAdd}
        disabled={pending}
        className="mt-4 w-full"
      >
        {isEdit ? t('addSheet.saveCta') : t('addSheet.addCta', { meal: mealLabel })}
      </Button>
    </div>
  );
}
