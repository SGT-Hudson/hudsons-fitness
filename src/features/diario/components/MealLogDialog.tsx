import { useEffect, useState, type FormEvent } from 'react';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { IngredientAutocomplete } from '@/features/recipes/components/IngredientAutocomplete';
import { RecipeAutocomplete, type RecipeOption } from './RecipeAutocomplete';
import type { Ingredient } from '@/features/ingredients/api';
import { useCreateMealLog, useUpdateMealLog, useDeleteMealLog } from '../hooks';
import type { MealLogWithJoins, MealType } from '../api';
import { MEAL_TYPE_ORDER } from '../api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loggedOn: string;
  initialMealType?: MealType;
  editing?: MealLogWithJoins | null;
}

type Source = 'recipe' | 'ingredient' | 'custom';

interface FormState {
  mealType: MealType;
  source: Source;
  recipe: RecipeOption | null;
  servings: string;
  ingredient: Ingredient | null;
  quantity: string;
  customName: string;
  customKcal: string;
  customProtein: string;
  customCarbs: string;
  customFat: string;
  customFiber: string;
  notes: string;
}

function initialState(loggedOn: string, mealType: MealType): FormState {
  return {
    mealType,
    source: 'recipe',
    recipe: null,
    servings: '1',
    ingredient: null,
    quantity: '',
    customName: '',
    customKcal: '',
    customProtein: '',
    customCarbs: '',
    customFat: '',
    customFiber: '',
    notes: '',
  };
  void loggedOn;
}

function fromExisting(log: MealLogWithJoins): FormState {
  const base: FormState = initialState('', (log.meal_type as MealType) ?? 'other');
  base.notes = log.notes ?? '';
  if (log.recipe_id && log.recipe) {
    return {
      ...base,
      source: 'recipe',
      recipe: {
        id: log.recipe.id,
        name: log.recipe.name,
        servings: log.recipe.servings,
        ingredient_count: log.recipe.recipe_ingredients?.length ?? 0,
      },
      servings: String(log.servings ?? 1),
    };
  }
  if (log.ingredient_id && log.ingredient) {
    return {
      ...base,
      source: 'ingredient',
      ingredient: log.ingredient,
      quantity: String(log.quantity ?? ''),
    };
  }
  return {
    ...base,
    source: 'custom',
    customName: log.custom_name ?? '',
    customKcal: log.custom_kcal == null ? '' : String(log.custom_kcal),
    customProtein: log.custom_protein_g == null ? '' : String(log.custom_protein_g),
    customCarbs: log.custom_carbs_g == null ? '' : String(log.custom_carbs_g),
    customFat: log.custom_fat_g == null ? '' : String(log.custom_fat_g),
    customFiber: log.custom_fiber_g == null ? '' : String(log.custom_fiber_g),
  };
}

function parseOptional(v: string): number | null {
  const t = v.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function MealLogDialog({
  open,
  onOpenChange,
  loggedOn,
  initialMealType = 'breakfast',
  editing,
}: Props) {
  const { t } = useTranslation('diario');
  const { t: tCommon } = useTranslation('common');
  const isEdit = !!editing;
  const [state, setState] = useState<FormState>(initialState(loggedOn, initialMealType));
  const [error, setError] = useState<string | null>(null);

  const create = useCreateMealLog();
  const update = useUpdateMealLog();
  const del = useDeleteMealLog();

  useEffect(() => {
    if (!open) return;
    setError(null);
    setState(editing ? fromExisting(editing) : initialState(loggedOn, initialMealType));
  }, [open, editing, loggedOn, initialMealType]);

  function update_<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (isEdit && editing) {
        const patch: Record<string, unknown> = {
          meal_type: state.mealType,
          notes: state.notes.trim() === '' ? null : state.notes.trim(),
        };
        if (editing.recipe_id) {
          const s = parseOptional(state.servings);
          if (s === null || s <= 0) {
            setError(t('errors.servingsInvalid'));
            return;
          }
          patch.servings = s;
        } else if (editing.ingredient_id) {
          const q = parseOptional(state.quantity);
          if (q === null || q <= 0) {
            setError(t('errors.quantityInvalid'));
            return;
          }
          patch.quantity = q;
        } else {
          if (state.customName.trim() === '') {
            setError(t('errors.customNameRequired'));
            return;
          }
          const kcal = parseOptional(state.customKcal);
          if (kcal === null) {
            setError(t('errors.customKcalRequired'));
            return;
          }
          patch.custom_name = state.customName.trim();
          patch.custom_kcal = kcal;
          patch.custom_protein_g = parseOptional(state.customProtein);
          patch.custom_carbs_g = parseOptional(state.customCarbs);
          patch.custom_fat_g = parseOptional(state.customFat);
          patch.custom_fiber_g = parseOptional(state.customFiber);
        }
        await update.mutateAsync({ id: editing.id, patch });
      } else {
        if (state.source === 'recipe') {
          if (!state.recipe) {
            setError(t('errors.pickRecipe'));
            return;
          }
          const s = parseOptional(state.servings);
          if (s === null || s <= 0) {
            setError(t('errors.servingsInvalid'));
            return;
          }
          await create.mutateAsync({
            loggedOn,
            mealType: state.mealType,
            source: { kind: 'recipe', recipeId: state.recipe.id, servings: s },
            notes: state.notes.trim() === '' ? null : state.notes.trim(),
          });
        } else if (state.source === 'ingredient') {
          if (!state.ingredient) {
            setError(t('errors.pickIngredient'));
            return;
          }
          const q = parseOptional(state.quantity);
          if (q === null || q <= 0) {
            setError(t('errors.quantityInvalid'));
            return;
          }
          await create.mutateAsync({
            loggedOn,
            mealType: state.mealType,
            source: { kind: 'ingredient', ingredientId: state.ingredient.id, quantity: q },
            notes: state.notes.trim() === '' ? null : state.notes.trim(),
          });
        } else {
          if (state.customName.trim() === '') {
            setError(t('errors.customNameRequired'));
            return;
          }
          const kcal = parseOptional(state.customKcal);
          if (kcal === null) {
            setError(t('errors.customKcalRequired'));
            return;
          }
          await create.mutateAsync({
            loggedOn,
            mealType: state.mealType,
            source: {
              kind: 'custom',
              name: state.customName.trim(),
              kcal,
              proteinG: parseOptional(state.customProtein),
              carbsG: parseOptional(state.customCarbs),
              fatG: parseOptional(state.customFat),
              fiberG: parseOptional(state.customFiber),
            },
            notes: state.notes.trim() === '' ? null : state.notes.trim(),
          });
        }
      }
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDelete() {
    if (!editing) return;
    if (!window.confirm(t('dialog.deleteConfirm'))) return;
    try {
      await del.mutateAsync(editing.id);
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const submitting = create.isPending || update.isPending || del.isPending;
  const ingredientUnit = state.ingredient
    ? state.ingredient.unit_type === 'unit'
      ? t('units.unit')
      : 'g'
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('dialog.editTitle') : t('dialog.newTitle')}</DialogTitle>
          <DialogDescription>{t('dialog.subtitle')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="meal-type">{t('fields.mealType')}</Label>
            <Select
              value={state.mealType}
              onValueChange={(v) => update_('mealType', v as MealType)}
            >
              <SelectTrigger id="meal-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEAL_TYPE_ORDER.map((mt) => (
                  <SelectItem key={mt} value={mt}>
                    {t(`mealType.${mt}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!isEdit ? (
            <Tabs value={state.source} onValueChange={(v) => update_('source', v as Source)}>
              <TabsList>
                <TabsTrigger value="recipe">{t('tabs.recipe')}</TabsTrigger>
                <TabsTrigger value="ingredient">{t('tabs.ingredient')}</TabsTrigger>
                <TabsTrigger value="custom">{t('tabs.custom')}</TabsTrigger>
              </TabsList>
              <TabsContent value="recipe" className="space-y-3">
                <Label>{t('fields.recipe')}</Label>
                <RecipeAutocomplete
                  selected={state.recipe}
                  onSelect={(r) => update_('recipe', r)}
                  onClear={() => update_('recipe', null)}
                />
                <div className="space-y-2">
                  <Label htmlFor="ml-servings">{t('fields.servings')}</Label>
                  <Input
                    id="ml-servings"
                    type="number"
                    inputMode="decimal"
                    min={0.25}
                    step="0.25"
                    value={state.servings}
                    onChange={(e) => update_('servings', e.target.value)}
                  />
                </div>
              </TabsContent>
              <TabsContent value="ingredient" className="space-y-3">
                <Label>{t('fields.ingredient')}</Label>
                <IngredientAutocomplete
                  selected={state.ingredient}
                  onSelect={(ing) => update_('ingredient', ing)}
                  onClear={() => update_('ingredient', null)}
                />
                <div className="space-y-2">
                  <Label htmlFor="ml-qty">{t('fields.quantity')}</Label>
                  <div className="relative">
                    <Input
                      id="ml-qty"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.1"
                      value={state.quantity}
                      onChange={(e) => update_('quantity', e.target.value)}
                    />
                    {ingredientUnit && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                        {ingredientUnit}
                      </span>
                    )}
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="custom" className="space-y-3">
                <CustomFields
                  state={state}
                  onChange={(p) => setState((s) => ({ ...s, ...p }))}
                />
              </TabsContent>
            </Tabs>
          ) : editing?.recipe_id ? (
            <div className="space-y-3">
              <p className="text-sm">
                <span className="text-muted-foreground">{t('fields.recipe')}: </span>
                <span className="font-medium">{editing.recipe?.name}</span>
              </p>
              <div className="space-y-2">
                <Label htmlFor="ml-servings-edit">{t('fields.servings')}</Label>
                <Input
                  id="ml-servings-edit"
                  type="number"
                  inputMode="decimal"
                  min={0.25}
                  step="0.25"
                  value={state.servings}
                  onChange={(e) => update_('servings', e.target.value)}
                />
              </div>
            </div>
          ) : editing?.ingredient_id ? (
            <div className="space-y-3">
              <p className="text-sm">
                <span className="text-muted-foreground">{t('fields.ingredient')}: </span>
                <span className="font-medium">{editing.ingredient?.name}</span>
              </p>
              <div className="space-y-2">
                <Label htmlFor="ml-qty-edit">{t('fields.quantity')}</Label>
                <div className="relative">
                  <Input
                    id="ml-qty-edit"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.1"
                    value={state.quantity}
                    onChange={(e) => update_('quantity', e.target.value)}
                  />
                  {editing.ingredient && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                      {editing.ingredient.unit_type === 'unit' ? t('units.unit') : 'g'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <CustomFields state={state} onChange={(p) => setState((s) => ({ ...s, ...p }))} />
          )}

          <div className="space-y-2">
            <Label htmlFor="ml-notes">{t('fields.notes')}</Label>
            <Textarea
              id="ml-notes"
              rows={2}
              value={state.notes}
              onChange={(e) => update_('notes', e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="sm:justify-between">
            <div>
              {isEdit && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void handleDelete()}
                  disabled={submitting}
                >
                  {tCommon('delete')}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {tCommon('cancel')}
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? tCommon('loading') : tCommon('save')}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface CustomFieldsProps {
  state: FormState;
  onChange: (patch: Partial<FormState>) => void;
}

function CustomFields({ state, onChange }: CustomFieldsProps) {
  const { t } = useTranslation('diario');
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="cust-name">{t('fields.customName')}</Label>
        <Input
          id="cust-name"
          required
          value={state.customName}
          onChange={(e) => onChange({ customName: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <CustomNum
          id="cust-kcal"
          label={t('fields.kcal')}
          value={state.customKcal}
          onChange={(v) => onChange({ customKcal: v })}
          required
        />
        <CustomNum
          id="cust-protein"
          label={t('fields.protein')}
          value={state.customProtein}
          onChange={(v) => onChange({ customProtein: v })}
        />
        <CustomNum
          id="cust-carbs"
          label={t('fields.carbs')}
          value={state.customCarbs}
          onChange={(v) => onChange({ customCarbs: v })}
        />
        <CustomNum
          id="cust-fat"
          label={t('fields.fat')}
          value={state.customFat}
          onChange={(v) => onChange({ customFat: v })}
        />
        <CustomNum
          id="cust-fiber"
          label={t('fields.fiber')}
          value={state.customFiber}
          onChange={(v) => onChange({ customFiber: v })}
        />
      </div>
    </div>
  );
}

function CustomNum({
  id,
  label,
  value,
  onChange,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
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
        min={0}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
