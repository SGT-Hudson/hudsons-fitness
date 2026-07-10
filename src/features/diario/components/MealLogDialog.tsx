import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
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
import {
  firstMealLogError,
  mealLogFormSchema,
  parseOptionalNumber,
  type MealLogFormValues,
} from '../schema';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loggedOn: string;
  initialMealType?: MealType;
  editing?: MealLogWithJoins | null;
}

type Source = 'recipe' | 'ingredient' | 'custom';

function defaults(mealType: MealType, source: Source): MealLogFormValues {
  return {
    mealType,
    source,
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
  const [error, setError] = useState<string | null>(null);
  // Autocomplete-selected entities stay in component state (entity objects,
  // not form primitives — same pattern as RecipePickerDialog).
  const [recipe, setRecipe] = useState<RecipeOption | null>(null);
  const [ingredient, setIngredient] = useState<Ingredient | null>(null);

  const create = useCreateMealLog();
  const update = useUpdateMealLog();
  const del = useDeleteMealLog();

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<MealLogFormValues>({
    resolver: zodResolver(mealLogFormSchema),
    defaultValues: defaults(initialMealType, 'recipe'),
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (!editing) {
      setRecipe(null);
      setIngredient(null);
      reset(defaults(initialMealType, 'recipe'));
      return;
    }
    const log = editing;
    const base = defaults((log.meal_type as MealType) ?? 'other', 'custom');
    base.notes = log.notes ?? '';
    if (log.recipe_id && log.recipe) {
      setRecipe({
        id: log.recipe.id,
        name: log.recipe.name,
        servings: log.recipe.servings,
        ingredient_count: log.recipe.recipe_ingredients?.length ?? 0,
      });
      setIngredient(null);
      reset({
        ...base,
        source: 'recipe',
        hasRecipe: true,
        servings: String(log.servings ?? 1),
      });
    } else if (log.ingredient_id && log.ingredient) {
      setIngredient(log.ingredient);
      setRecipe(null);
      reset({
        ...base,
        source: 'ingredient',
        hasIngredient: true,
        quantity: String(log.quantity ?? ''),
      });
    } else {
      setRecipe(null);
      setIngredient(null);
      reset({
        ...base,
        source: 'custom',
        customName: log.custom_name ?? '',
        customKcal: log.custom_kcal == null ? '' : String(log.custom_kcal),
        customProtein: log.custom_protein_g == null ? '' : String(log.custom_protein_g),
        customCarbs: log.custom_carbs_g == null ? '' : String(log.custom_carbs_g),
        customFat: log.custom_fat_g == null ? '' : String(log.custom_fat_g),
        customFiber: log.custom_fiber_g == null ? '' : String(log.custom_fiber_g),
      });
    }
  }, [open, editing, loggedOn, initialMealType, reset]);

  function handleSelectRecipe(r: RecipeOption | null) {
    setRecipe(r);
    setValue('hasRecipe', !!r, { shouldValidate: true });
  }

  function handleSelectIngredient(ing: Ingredient | null) {
    setIngredient(ing);
    setValue('hasIngredient', !!ing, { shouldValidate: true });
  }

  async function onValid(v: MealLogFormValues) {
    setError(null);
    try {
      if (isEdit && editing) {
        const patch: Record<string, unknown> = {
          meal_type: v.mealType,
          notes: v.notes.trim() === '' ? null : v.notes.trim(),
        };
        if (editing.recipe_id) {
          patch.servings = Number(v.servings);
        } else if (editing.ingredient_id) {
          patch.quantity = Number(v.quantity);
        } else {
          patch.custom_name = v.customName.trim();
          patch.custom_kcal = Number(v.customKcal);
          patch.custom_protein_g = parseOptionalNumber(v.customProtein);
          patch.custom_carbs_g = parseOptionalNumber(v.customCarbs);
          patch.custom_fat_g = parseOptionalNumber(v.customFat);
          patch.custom_fiber_g = parseOptionalNumber(v.customFiber);
        }
        await update.mutateAsync({ id: editing.id, patch });
      } else if (v.source === 'recipe') {
        await create.mutateAsync({
          loggedOn,
          mealType: v.mealType as MealType,
          source: { kind: 'recipe', recipeId: recipe!.id, servings: Number(v.servings) },
          notes: v.notes.trim() === '' ? null : v.notes.trim(),
        });
      } else if (v.source === 'ingredient') {
        await create.mutateAsync({
          loggedOn,
          mealType: v.mealType as MealType,
          source: {
            kind: 'ingredient',
            ingredientId: ingredient!.id,
            quantity: Number(v.quantity),
          },
          notes: v.notes.trim() === '' ? null : v.notes.trim(),
        });
      } else {
        await create.mutateAsync({
          loggedOn,
          mealType: v.mealType as MealType,
          source: {
            kind: 'custom',
            name: v.customName.trim(),
            kcal: Number(v.customKcal),
            proteinG: parseOptionalNumber(v.customProtein),
            carbsG: parseOptionalNumber(v.customCarbs),
            fatG: parseOptionalNumber(v.customFat),
            fiberG: parseOptionalNumber(v.customFiber),
          },
          notes: v.notes.trim() === '' ? null : v.notes.trim(),
        });
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

  // One localized message, original precedence — D-C2 parity.
  const validationCode = firstMealLogError(
    errors as Record<string, { message?: string } | undefined>,
  );
  const validationError = validationCode ? t(`errors.${validationCode}`) : null;

  const submitting = create.isPending || update.isPending || del.isPending;
  const ingredientUnit = ingredient
    ? ingredient.unit_type === 'unit'
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

        <form onSubmit={handleSubmit(onValid)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="meal-type">{t('fields.mealType')}</Label>
            <Controller
              control={control}
              name="mealType"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
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
              )}
            />
          </div>

          {!isEdit ? (
            <Controller
              control={control}
              name="source"
              render={({ field }) => (
                <Tabs
                  value={field.value}
                  onValueChange={(val) => field.onChange(val as Source)}
                >
                  <TabsList>
                    <TabsTrigger value="recipe">{t('tabs.recipe')}</TabsTrigger>
                    <TabsTrigger value="ingredient">{t('tabs.ingredient')}</TabsTrigger>
                    <TabsTrigger value="custom">{t('tabs.custom')}</TabsTrigger>
                  </TabsList>
                  <TabsContent value="recipe" className="space-y-3">
                    <Label>{t('fields.recipe')}</Label>
                    <RecipeAutocomplete
                      selected={recipe}
                      onSelect={handleSelectRecipe}
                      onClear={() => handleSelectRecipe(null)}
                    />
                    <div className="space-y-2">
                      <Label htmlFor="ml-servings">{t('fields.servings')}</Label>
                      <Input
                        id="ml-servings"
                        type="number"
                        inputMode="decimal"
                        min={0.25}
                        step="0.25"
                        {...register('servings')}
                      />
                    </div>
                  </TabsContent>
                  <TabsContent value="ingredient" className="space-y-3">
                    <Label>{t('fields.ingredient')}</Label>
                    <IngredientAutocomplete
                      selected={ingredient}
                      onSelect={handleSelectIngredient}
                      onClear={() => handleSelectIngredient(null)}
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
                          {...register('quantity')}
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
                    <CustomFields register={register} t={t} />
                  </TabsContent>
                </Tabs>
              )}
            />
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
                  {...register('servings')}
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
                    {...register('quantity')}
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
            <CustomFields register={register} t={t} />
          )}

          <div className="space-y-2">
            <Label htmlFor="ml-notes">{t('fields.notes')}</Label>
            <Textarea id="ml-notes" rows={2} {...register('notes')} />
          </div>

          {(validationError || error) && (
            <p className="text-sm text-destructive">{validationError ?? error}</p>
          )}

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

type RegisterFn = ReturnType<typeof useForm<MealLogFormValues>>['register'];

function CustomFields({
  register,
  t,
}: {
  register: RegisterFn;
  t: (k: string) => string;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="cust-name">{t('fields.customName')}</Label>
        <Input id="cust-name" {...register('customName')} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <CustomNum id="cust-kcal" label={t('fields.kcal')} {...register('customKcal')} />
        <CustomNum
          id="cust-protein"
          label={t('fields.protein')}
          {...register('customProtein')}
        />
        <CustomNum id="cust-carbs" label={t('fields.carbs')} {...register('customCarbs')} />
        <CustomNum id="cust-fat" label={t('fields.fat')} {...register('customFat')} />
        <CustomNum id="cust-fiber" label={t('fields.fiber')} {...register('customFiber')} />
      </div>
    </div>
  );
}

function CustomNum({
  id,
  label,
  ...field
}: {
  id: string;
  label: string;
} & ReturnType<RegisterFn>) {
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
        {...field}
      />
    </div>
  );
}
