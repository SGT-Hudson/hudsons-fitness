import { useEffect } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { IngredientAutocomplete } from './IngredientAutocomplete';
import { LiveMacrosPanel } from './LiveMacrosPanel';
import type { Ingredient } from '@/features/ingredients/api';
import type { RecipeWithIngredients } from '../api';
import {
  firstRecipeError,
  recipeFormSchema,
  type RecipeFormValues,
} from '../schema';

let rowIdCounter = 0;
function newRowId() {
  rowIdCounter += 1;
  return `row-${Date.now()}-${rowIdCounter}`;
}

// EditorRow / EditorState are now the zod schema's value shape (D-C2/R-09).
// Kept as named exports because RecetaEditorPage builds/maps them.
export type EditorRow = RecipeFormValues['rows'][number] & {
  ingredient: Ingredient | null;
};
export type EditorState = Omit<RecipeFormValues, 'rows'> & { rows: EditorRow[] };

export function emptyEditorState(): EditorState {
  return {
    name: '',
    servings: '1',
    description: '',
    instructions: '',
    rows: [{ rowId: newRowId(), ingredient: null, quantity: '', per_serving: false }],
  };
}

export function recipeToEditorState(recipe: RecipeWithIngredients): EditorState {
  return {
    name: recipe.name,
    servings: String(recipe.servings),
    description: recipe.description ?? '',
    instructions: recipe.instructions ?? '',
    rows: recipe.recipe_ingredients.map((ri) => ({
      rowId: newRowId(),
      ingredient: ri.ingredient,
      quantity: String(ri.quantity),
      per_serving: ri.per_serving,
    })),
  };
}

interface Props {
  initial?: EditorState;
  submitting: boolean;
  error: string | null;
  onSubmit: (state: EditorState) => void;
  onCancel: () => void;
  onDuplicate?: () => void;
}

export function RecipeEditorForm({
  initial,
  submitting,
  error,
  onSubmit,
  onCancel,
  onDuplicate,
}: Props) {
  const { t } = useTranslation('recetas');
  const { t: tCommon } = useTranslation('common');

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<EditorState>({
    resolver: zodResolver(recipeFormSchema) as never,
    defaultValues: initial ?? emptyEditorState(),
  });

  // RecetaEditorPage passes `initial` once data loads; keep it in sync.
  useEffect(() => {
    if (initial) reset(initial);
  }, [initial, reset]);

  const { fields, append, remove } = useFieldArray<EditorState>({
    control,
    name: 'rows',
  });

  const rows = watch('rows');
  const servingsNum = Number(watch('servings'));
  const macroRows = (rows ?? [])
    .filter((r) => r.ingredient && Number(r.quantity) > 0)
    .map((r) => ({
      ingredient: r.ingredient as Ingredient,
      quantity: Number(r.quantity),
      perServing: r.per_serving,
    }));

  function addRow() {
    append({ rowId: newRowId(), ingredient: null, quantity: '', per_serving: false });
  }

  function onValid(values: EditorState) {
    // Preserve the original payload: only filled rows are passed up (the page
    // re-filters too, but the prior code shipped `filledRows`).
    const filledRows = values.rows.filter(
      (r) => r.ingredient || r.quantity.trim() !== '',
    );
    onSubmit({ ...values, rows: filledRows });
  }

  // One localized message, original precedence (D-C2 parity).
  const validationCode = firstRecipeError(
    errors as Record<string, { message?: string } | undefined>,
  );
  const validationError = validationCode ? t(`errors.${validationCode}`) : null;

  return (
    <form
      onSubmit={handleSubmit(onValid)}
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"
    >
      <div className="space-y-6 min-w-0">
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-4">
              <div className="space-y-2">
                <Label htmlFor="recipe-name">{t('form.name')}</Label>
                <Input id="recipe-name" {...register('name')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recipe-servings">{t('form.servings')}</Label>
                <Input
                  id="recipe-servings"
                  type="number"
                  inputMode="decimal"
                  min={0.5}
                  step="0.5"
                  {...register('servings')}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="recipe-description">{t('form.description')}</Label>
              <Input id="recipe-description" {...register('description')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recipe-instructions">{t('form.instructions')}</Label>
              <Textarea id="recipe-instructions" rows={4} {...register('instructions')} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{t('form.ingredients')}</h2>
              <Button type="button" variant="outline" size="sm" onClick={addRow}>
                <Plus className="h-4 w-4" />
                {t('form.addRow')}
              </Button>
            </div>
            <ul className="space-y-2">
              {fields.map((field, index) => {
                const row = rows?.[index];
                const ingredient = row?.ingredient ?? null;
                const unitSuffix = !ingredient
                  ? ''
                  : ingredient.unit_type === 'unit'
                    ? t('form.units')
                    : 'g';
                return (
                  <li
                    key={field.id}
                    className="grid gap-2 sm:grid-cols-[1fr_140px_auto_auto] items-start"
                  >
                    <IngredientAutocomplete
                      selected={ingredient}
                      onSelect={(ing) =>
                        setValue(`rows.${index}.ingredient`, ing, {
                          shouldValidate: true,
                        })
                      }
                      onClear={() =>
                        setValue(`rows.${index}.ingredient`, null, {
                          shouldValidate: true,
                        })
                      }
                    />
                    <div className="relative">
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        min={0}
                        placeholder={t('form.quantity')}
                        {...register(`rows.${index}.quantity`)}
                      />
                      {unitSuffix && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                          {unitSuffix}
                        </span>
                      )}
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm h-10 px-2 rounded-md border border-input bg-background select-none cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        {...register(`rows.${index}.per_serving`)}
                      />
                      <span>{t('form.perServing')}</span>
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={tCommon('delete')}
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        {(validationError || error) && (
          <p className="text-sm text-destructive">{validationError ?? error}</p>
        )}

        <div className="flex flex-wrap gap-2 justify-end">
          {onDuplicate && (
            <Button type="button" variant="outline" onClick={onDuplicate}>
              {t('actions.duplicate')}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onCancel}>
            {tCommon('cancel')}
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? tCommon('loading') : tCommon('save')}
          </Button>
        </div>
      </div>

      <aside className="lg:sticky lg:top-20 self-start">
        <LiveMacrosPanel servings={servingsNum > 0 ? servingsNum : 1} rows={macroRows} />
      </aside>
    </form>
  );
}
