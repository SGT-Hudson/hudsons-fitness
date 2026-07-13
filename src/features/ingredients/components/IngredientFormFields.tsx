import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ingredientFormSchema, type IngredientFormValues } from '../schema';
import type { OFFSearchResult } from '@/lib/openfoodfacts';

// The form state is the zod schema's *input* (string-valued) shape — the
// single source of truth now lives in ../schema.ts (D-C2/D-C3, R-09). This
// presentational sub-component still takes value/onChange because it is reused
// across the OFF / manual / edit tabs in IngredientDialog (which owns the RHF
// instance).
export type IngredientFormState = IngredientFormValues;

export const emptyForm: IngredientFormState = {
  name: '',
  brand: '',
  unit_type: 'gram',
  kcal_per_unit: '',
  protein_g_per_unit: '',
  carbs_g_per_unit: '',
  fat_g_per_unit: '',
  fiber_g_per_unit: '',
  sugar_g_per_unit: '',
  saturated_fat_g_per_unit: '',
  salt_g_per_unit: '',
};

interface Props {
  value: IngredientFormState;
  onChange: (next: IngredientFormState) => void;
  idPrefix?: string;
}

export function IngredientFormFields({ value, onChange, idPrefix = 'ing' }: Props) {
  const { t } = useTranslation('ingredientes');
  function set<K extends keyof IngredientFormState>(key: K, v: IngredientFormState[K]) {
    onChange({ ...value, [key]: v });
  }
  const unitSuffix = value.unit_type === 'unit' ? t('form.perUnit') : t('form.per100g');
  // Soft, non-blocking sanity check: sugar ⊂ carbs, saturated ⊂ fat. Only when
  // both sides are filled in (blank = unknown). Never blocks save.
  const exceeds = (sub: string, parent: string) =>
    sub.trim() !== '' && parent.trim() !== '' && Number(sub) > Number(parent);
  const showSubWarning =
    exceeds(value.sugar_g_per_unit, value.carbs_g_per_unit) ||
    exceeds(value.saturated_fat_g_per_unit, value.fat_g_per_unit);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-name`}>{t('form.name')}</Label>
          <Input
            id={`${idPrefix}-name`}
            required
            value={value.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-brand`}>{t('form.brand')}</Label>
          <Input
            id={`${idPrefix}-brand`}
            value={value.brand}
            onChange={(e) => set('brand', e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-unit`}>{t('form.unitType')}</Label>
        <Select
          value={value.unit_type}
          onValueChange={(v) => set('unit_type', v as 'gram' | 'unit')}
        >
          <SelectTrigger id={`${idPrefix}-unit`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="gram">{t('form.unitGram')}</SelectItem>
            <SelectItem value="unit">{t('form.unitUnit')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-md border p-3 space-y-3">
        <p className="text-xs text-muted-foreground">
          {t('form.macrosLabel', { suffix: unitSuffix })}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <NumberField
            id={`${idPrefix}-kcal`}
            label={t('form.kcal')}
            value={value.kcal_per_unit}
            onChange={(v) => set('kcal_per_unit', v)}
            min={0}
            max={1500}
            required
          />
          <NumberField
            id={`${idPrefix}-protein`}
            label={t('form.protein')}
            value={value.protein_g_per_unit}
            onChange={(v) => set('protein_g_per_unit', v)}
            min={0}
            max={100}
            required
          />
          <NumberField
            id={`${idPrefix}-carbs`}
            label={t('form.carbs')}
            value={value.carbs_g_per_unit}
            onChange={(v) => set('carbs_g_per_unit', v)}
            min={0}
            max={100}
            required
          />
          <NumberField
            id={`${idPrefix}-fat`}
            label={t('form.fat')}
            value={value.fat_g_per_unit}
            onChange={(v) => set('fat_g_per_unit', v)}
            min={0}
            max={100}
            required
          />
          <NumberField
            id={`${idPrefix}-fiber`}
            label={t('form.fiber')}
            value={value.fiber_g_per_unit}
            onChange={(v) => set('fiber_g_per_unit', v)}
            min={0}
            max={100}
          />
          <NumberField
            id={`${idPrefix}-sugar`}
            label={t('form.sugar')}
            value={value.sugar_g_per_unit}
            onChange={(v) => set('sugar_g_per_unit', v)}
            min={0}
            max={100}
          />
          <NumberField
            id={`${idPrefix}-satfat`}
            label={t('form.satFat')}
            value={value.saturated_fat_g_per_unit}
            onChange={(v) => set('saturated_fat_g_per_unit', v)}
            min={0}
            max={100}
          />
          {/* Salt is an optional sub-macro like sugar/saturated fat: blank =
              unknown (NULL), never 0. It is an ingredient-level fact only —
              deliberately not aggregated into recipe/day totals this wave. */}
          <NumberField
            id={`${idPrefix}-salt`}
            label={t('form.salt')}
            value={value.salt_g_per_unit}
            onChange={(v) => set('salt_g_per_unit', v)}
            min={0}
            max={100}
          />
        </div>
        {showSubWarning && (
          <p className="text-xs text-tone-warn">{t('form.subMacroWarning')}</p>
        )}
      </div>
    </div>
  );
}

interface NumberFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  required?: boolean;
}

function NumberField({ id, label, value, onChange, min, max, required }: NumberFieldProps) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step="0.1"
        min={min}
        max={max}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function ingredientToForm(ing: {
  name: string;
  brand: string | null;
  unit_type: string;
  kcal_per_unit: number;
  protein_g_per_unit: number;
  carbs_g_per_unit: number;
  fat_g_per_unit: number;
  fiber_g_per_unit: number;
  sugar_g_per_unit?: number | null;
  saturated_fat_g_per_unit?: number | null;
  salt_g_per_unit?: number | null;
}): IngredientFormState {
  return {
    name: ing.name,
    brand: ing.brand ?? '',
    unit_type: ing.unit_type === 'unit' ? 'unit' : 'gram',
    kcal_per_unit: String(ing.kcal_per_unit),
    protein_g_per_unit: String(ing.protein_g_per_unit),
    carbs_g_per_unit: String(ing.carbs_g_per_unit),
    fat_g_per_unit: String(ing.fat_g_per_unit),
    fiber_g_per_unit: String(ing.fiber_g_per_unit),
    // NULL (unknown) → blank input, NOT "0".
    sugar_g_per_unit: ing.sugar_g_per_unit == null ? '' : String(ing.sugar_g_per_unit),
    saturated_fat_g_per_unit:
      ing.saturated_fat_g_per_unit == null ? '' : String(ing.saturated_fat_g_per_unit),
    salt_g_per_unit: ing.salt_g_per_unit == null ? '' : String(ing.salt_g_per_unit),
  };
}

/**
 * OFF search result / barcode lookup → the string-valued form (R-33 wave 6,
 * Task 1). Extracted from `IngredientDialog`, where this exact mapping was
 * written out twice (the off-tab pick and the barcode `onResolved` handler);
 * both now call this one function, and it is also the seed for the `/new`
 * route and the full-screen scanner (Tasks 3/5).
 *
 * `unit_type` is always `'gram'` — OFF only ever reports per-100g nutrition.
 * Same U-1 contract as `ingredientToForm`: a sub-macro OFF has no value for
 * (`null`) renders as a BLANK input, never `"0"` — a genuine OFF-reported 0
 * (e.g. zero-sugar soda) is a real claim and must render as `"0"`.
 */
export function offResultToForm(result: OFFSearchResult): IngredientFormState {
  return {
    name: result.name,
    brand: result.brand ?? '',
    unit_type: 'gram',
    kcal_per_unit: String(result.kcalPer100g),
    protein_g_per_unit: String(result.proteinPer100g),
    carbs_g_per_unit: String(result.carbsPer100g),
    fat_g_per_unit: String(result.fatPer100g),
    fiber_g_per_unit: String(result.fiberPer100g),
    sugar_g_per_unit: result.sugarPer100g == null ? '' : String(result.sugarPer100g),
    saturated_fat_g_per_unit:
      result.satFatPer100g == null ? '' : String(result.satFatPer100g),
    // OFF had no salt figure → blank (unknown), never "0".
    salt_g_per_unit: result.saltPer100g == null ? '' : String(result.saltPer100g),
  };
}

export interface ParsedIngredient {
  name: string;
  brand: string | null;
  unit_type: 'gram' | 'unit';
  kcal_per_unit: number;
  protein_g_per_unit: number;
  carbs_g_per_unit: number;
  fat_g_per_unit: number;
  fiber_g_per_unit: number;
  sugar_g_per_unit: number | null;
  saturated_fat_g_per_unit: number | null;
  salt_g_per_unit: number | null;
}

/**
 * Validate + normalize via the co-located zod schema (single source of truth,
 * D-C2/R-09). Behavior is identical to the old hand-rolled parser: any invalid
 * field → `null` (the dialog turns that into the localized `errors.invalid`
 * message); blank fiber → 0; brand trimmed-to-null.
 */
export function parseForm(form: IngredientFormState): ParsedIngredient | null {
  const result = ingredientFormSchema.safeParse(form);
  if (!result.success) return null;
  const v = result.data;
  return {
    name: v.name,
    brand: v.brand.trim() === '' ? null : v.brand.trim(),
    unit_type: v.unit_type,
    kcal_per_unit: v.kcal_per_unit,
    protein_g_per_unit: v.protein_g_per_unit,
    carbs_g_per_unit: v.carbs_g_per_unit,
    fat_g_per_unit: v.fat_g_per_unit,
    fiber_g_per_unit: v.fiber_g_per_unit,
    sugar_g_per_unit: v.sugar_g_per_unit,
    saturated_fat_g_per_unit: v.saturated_fat_g_per_unit,
    salt_g_per_unit: v.salt_g_per_unit,
  };
}
