import { useEffect } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Trash2, Plus, Utensils } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { IngredientAutocomplete } from './IngredientAutocomplete';
import { RecipeMacrosCard } from './RecipeMacrosCard';
import { RecipeMediaPlaceholder } from './RecipeMediaPlaceholder';
import type { Ingredient } from '@/features/ingredients/api';
import type { RecipeWithIngredients } from '../api';
import { computeRecipeMacros } from '../macros';
import {
  firstRecipeError,
  recipeFormSchema,
  type RecipeFormValues,
} from '../schema';
import type { FieldErrors } from '@/lib/zod';
import { RECIPE_MEAL_TYPES, toRecipeMealTypes, type RecipeMealType } from '../mealTypes';
import { cn } from '@/lib/utils';

/**
 * The editor's actions (guardar / cancelar / quitar) live in the page header —
 * the canvas puts them there on both artboards, and on mobile that is the only
 * place a save button is reachable without scrolling past every ingredient. A
 * `<button form="…">` outside the form still submits it, so the header keeps
 * the buttons while this component keeps the form state.
 */
export const RECIPE_EDITOR_FORM_ID = 'recipe-editor';

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
    prepTime: '',
    mealTypes: [],
    rows: [{ rowId: newRowId(), ingredient: null, quantity: '', per_serving: false }],
  };
}

export function recipeToEditorState(recipe: RecipeWithIngredients): EditorState {
  return {
    name: recipe.name,
    servings: String(recipe.servings),
    description: recipe.description ?? '',
    instructions: recipe.instructions ?? '',
    // R-33 wave 5. `save_recipe` writes prep_time_minutes UNCONDITIONALLY, so a
    // save that carries no value clears the column. The input (below) is bound
    // to this string; loading it here is what makes "open a recipe, change the
    // name, save" keep the time it already had.
    prepTime: recipe.prep_time_minutes === null ? '' : String(recipe.prep_time_minutes),
    mealTypes: toRecipeMealTypes(recipe.meal_types),
    rows: recipe.recipe_ingredients.map((ri) => ({
      rowId: newRowId(),
      ingredient: ri.ingredient,
      quantity: String(ri.quantity),
      per_serving: ri.per_serving,
    })),
  };
}

/** Uppercase micro-label of a meta field (canvas `FieldLabel`). */
const META_LABEL = 'text-[9.5px] font-medium uppercase tracking-[0.05em] text-text-dim';
/** The meta card's small bordered value inputs (Raciones, Tiempo). */
const META_INPUT =
  'tnum h-9 rounded-[8px] border-input bg-muted px-2 text-[13.5px] font-semibold md:h-9';

interface Props {
  initial?: EditorState;
  error: string | null;
  onSubmit: (state: EditorState) => void;
  /**
   * The recipe being edited — the media tile's hue is derived from its id, so
   * the tile is the SAME colour here, on the read view and on the list card.
   * Absent on create: there is no id yet, and the canvas draws an empty dashed
   * tile there rather than a coloured one (photo upload is not built).
   */
  recipeId?: string;
  /** Remove-from-library (mobile's danger button). Absent on create. */
  onRemove?: () => void;
}

export function RecipeEditorForm({ initial, error, onSubmit, recipeId, onRemove }: Props) {
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
  const mealTypes = watch('mealTypes') ?? [];

  function toggleMealType(key: RecipeMealType) {
    const next = mealTypes.includes(key)
      ? mealTypes.filter((m) => m !== key)
      : [...mealTypes, key];
    setValue('mealTypes', next, { shouldDirty: true });
  }

  const macroRows = (rows ?? [])
    .filter((r) => r.ingredient && Number(r.quantity) > 0)
    .map((r) => ({
      ingredient: r.ingredient as Ingredient,
      quantity: Number(r.quantity),
      perServing: r.per_serving,
    }));

  // Live macros: recomputed on every keystroke from what the rows hold RIGHT
  // NOW — servings included, so changing "4 raciones" to "2" halves the
  // highlighted column while you watch. Nothing to add up yet → the card's
  // empty variant, not a wall of zeroes.
  const { total, perServing } = computeRecipeMacros({
    servings: servingsNum > 0 ? servingsNum : 1,
    rows: macroRows,
  });
  const macrosCard = (className: string) => (
    <RecipeMacrosCard
      total={total}
      perServing={perServing}
      title={t('macros.liveTitle')}
      empty={macroRows.length === 0}
      className={className}
    />
  );

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
  const validationCode = firstRecipeError(errors as FieldErrors);
  const validationError = validationCode ? t(`errors.${validationCode}`) : null;

  return (
    <form
      id={RECIPE_EDITOR_FORM_ID}
      onSubmit={handleSubmit(onValid)}
      className="grid gap-3 md:grid-cols-[1fr_360px] md:items-start md:gap-4.5"
    >
      <div className="min-w-0 space-y-3 md:space-y-3.5">
        {/* Meta (canvas RecetaMetaEdit / RecetaMetaCreate): the recipe's
            identity — photo tile, a borderless title that reads as a heading
            rather than a form field, and the three meta values inline. */}
        <Card className="flex gap-3 p-3 md:gap-4 md:p-4">
          <div className="size-[70px] shrink-0 overflow-hidden rounded-[12px] md:size-24">
            {recipeId ? (
              <RecipeMediaPlaceholder recipeId={recipeId} variant="hero" />
            ) : (
              // Create: no id, so no hue to derive. The canvas draws an empty
              // dashed tile here — and since photo upload does not exist, it is
              // a tile, not a button that would lie about what it does.
              <div
                aria-hidden="true"
                className="grid size-full place-items-center rounded-[12px] border-[1.5px] border-dashed border-input bg-muted text-text-dim"
              >
                <Utensils className="size-5 md:size-6" />
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Label htmlFor="recipe-name" className="sr-only">
              {t('form.name')}
            </Label>
            <input
              id="recipe-name"
              placeholder={t('form.namePlaceholder')}
              className="w-full border-0 bg-transparent p-0 text-[16px] font-semibold tracking-[-0.02em] outline-hidden placeholder:font-normal placeholder:text-text-dim md:text-[22px]"
              {...register('name')}
            />
            <Label htmlFor="recipe-description" className="sr-only">
              {t('form.description')}
            </Label>
            <input
              id="recipe-description"
              placeholder={t('form.descriptionPlaceholder')}
              className="w-full border-0 bg-transparent p-0 text-[12.5px] text-muted-foreground outline-hidden placeholder:text-text-dim"
              {...register('description')}
            />

            <div className="mt-1 flex flex-wrap items-start gap-x-4 gap-y-2.5">
              <div className="flex flex-col gap-1">
                <Label htmlFor="recipe-servings" className={META_LABEL}>
                  {t('form.servings')}
                </Label>
                <Input
                  id="recipe-servings"
                  type="number"
                  inputMode="decimal"
                  min={0.5}
                  step="0.5"
                  className={cn(META_INPUT, 'w-[68px]')}
                  {...register('servings')}
                />
              </div>

              {/* Prep time — the new field (R-33 wave 5). Deliberately NOT a
                  native `type=number` with a `max`: the browser would block the
                  submit with its own tooltip and our localized message would
                  never render. The zod schema owns the range. */}
              <div className="flex flex-col gap-1">
                <Label htmlFor="recipe-prep-time" className={META_LABEL}>
                  {t('form.prepTime')}
                </Label>
                <Input
                  id="recipe-prep-time"
                  inputMode="numeric"
                  placeholder={t('form.prepTimePlaceholder')}
                  className={cn(META_INPUT, 'w-[84px]')}
                  {...register('prepTime')}
                />
              </div>

              <div className="flex min-w-0 flex-col gap-1">
                <span id="recipe-tag-label" className={META_LABEL}>
                  {t('form.tag')}
                </span>
                <div
                  role="group"
                  aria-labelledby="recipe-tag-label"
                  className="flex flex-wrap items-center gap-1.5"
                >
                  {RECIPE_MEAL_TYPES.map((key) => {
                    const active = mealTypes.includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleMealType(key)}
                        className={cn(
                          'h-7 rounded-full border px-2.5 text-[10.5px] font-semibold transition-colors',
                          active
                            ? 'border-accent-line bg-accent-soft text-accent-ink'
                            : 'border-input bg-card text-text-dim hover:bg-muted',
                        )}
                      >
                        {t(`mealTypes.${key}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Macros are the rail on web; on mobile they sit right under the meta
            card, above the ingredients — the mobile artboard's order. */}
        {macrosCard('md:hidden')}

        {/* Ingredients: the pre-redesign rows, re-framed by the new card. The
            table itself (drag handles, inline quantity, the add flow) is the
            next task — this is deliberately the existing implementation. */}
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b bg-muted px-4 py-2.5">
            <h2 className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-text-dim">
              {t('form.ingredients')}
            </h2>
            <span className="tnum text-[10.5px] text-text-dim">{fields.length}</span>
          </div>
          <ul className="space-y-2 p-3.5">
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
                  className="grid items-start gap-2 sm:grid-cols-[1fr_140px_auto_auto]"
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
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        {unitSuffix}
                      </span>
                    )}
                  </div>
                  <label className="inline-flex h-10 cursor-pointer select-none items-center gap-2 rounded-md border border-input bg-background px-2 text-sm">
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
          <div className="border-t bg-muted px-3.5 py-2.5">
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              <Plus className="h-4 w-4" />
              {t('form.addRow')}
            </Button>
          </div>
        </Card>

        {/* Preparación: ONE `instructions` text column, so one textarea —
            restyled, not split into fake step rows. Structured, reorderable
            steps are R-36. */}
        <Card className="overflow-hidden">
          <div className="border-b bg-muted px-4 py-2.5">
            <h2 className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-text-dim">
              {t('detail.instructionsTitle')}
            </h2>
          </div>
          <div className="p-3.5">
            <Label htmlFor="recipe-instructions" className="sr-only">
              {t('form.instructions')}
            </Label>
            <Textarea
              id="recipe-instructions"
              rows={6}
              placeholder={t('form.instructionsPlaceholder')}
              className="min-h-[120px] resize-y rounded-[10px] bg-muted text-[13px] leading-[1.6]"
              {...register('instructions')}
            />
          </div>
        </Card>

        {(validationError || error) && (
          <p role="alert" className="text-sm text-destructive">
            {validationError ?? error}
          </p>
        )}

        {/* Mobile's danger action (the artboard's footer button). On web it is
            in the page header — the canvas's own division of labour. */}
        {onRemove && (
          <Button
            type="button"
            variant="outline"
            onClick={onRemove}
            className="h-11 w-full rounded-[13px] border-danger-line text-danger-ink hover:bg-danger-soft md:hidden"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {t('editor.remove')}
          </Button>
        )}
      </div>

      <aside className="hidden md:sticky md:top-4 md:block">{macrosCard('')}</aside>
    </form>
  );
}
