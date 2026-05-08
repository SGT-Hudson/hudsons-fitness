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

export interface IngredientFormState {
  name: string;
  brand: string;
  unit_type: 'gram' | 'unit';
  kcal_per_unit: string;
  protein_g_per_unit: string;
  carbs_g_per_unit: string;
  fat_g_per_unit: string;
  fiber_g_per_unit: string;
}

export const emptyForm: IngredientFormState = {
  name: '',
  brand: '',
  unit_type: 'gram',
  kcal_per_unit: '',
  protein_g_per_unit: '',
  carbs_g_per_unit: '',
  fat_g_per_unit: '',
  fiber_g_per_unit: '',
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
        </div>
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
}

export function parseForm(form: IngredientFormState): ParsedIngredient | null {
  const name = form.name.trim();
  if (name === '') return null;
  const num = (s: string) => {
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const kcal = num(form.kcal_per_unit);
  const protein = num(form.protein_g_per_unit);
  const carbs = num(form.carbs_g_per_unit);
  const fat = num(form.fat_g_per_unit);
  const fiber = form.fiber_g_per_unit.trim() === '' ? 0 : num(form.fiber_g_per_unit);
  if (kcal === null || protein === null || carbs === null || fat === null || fiber === null) {
    return null;
  }
  return {
    name,
    brand: form.brand.trim() === '' ? null : form.brand.trim(),
    unit_type: form.unit_type,
    kcal_per_unit: kcal,
    protein_g_per_unit: protein,
    carbs_g_per_unit: carbs,
    fat_g_per_unit: fat,
    fiber_g_per_unit: fiber,
  };
}
