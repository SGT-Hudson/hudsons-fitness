import { useEffect, useState } from 'react';
import { FormProvider, useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Trash2, Search, Utensils } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberField } from '@/components/ui/NumberField';
import { parseDecimalInput } from '@/lib/number';
import { AddIngredientSheet } from './AddIngredientSheet';
import { IngredientAutocomplete } from './IngredientAutocomplete';
import { RecipeMacrosCard } from './RecipeMacrosCard';
import { RecipePhotoField } from './RecipePhotoField';
import { RecipeStepsField } from './RecipeStepsField';
import { ingredientDisplayName, type Ingredient } from '@/features/ingredients/api';
import type { Recipe, RecipeWithIngredients } from '../api';
import { newRowId } from '../ids';
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
    steps: [],
    prepTime: '',
    mealTypes: [],
    // R-33 wave 5 PR-B: no seeded blank row any more. A row is now BORN with an
    // ingredient in it — you pick one in the footer's search (web) or the add
    // sheet (mobile) and the row appears. A blank row would render a table row
    // with no name, no macros and nothing to say.
    rows: [],
  };
}

export function recipeToEditorState(recipe: RecipeWithIngredients): EditorState {
  return {
    name: recipe.name,
    servings: String(recipe.servings),
    description: recipe.description ?? '',
    steps: (recipe.recipe_steps ?? []).map((s) => ({
      stepId: newRowId(),
      text: s.text,
    })),
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
/** The uppercase bar that caps every card (canvas `SectionRule`). */
const CARD_HEADER = 'text-[10.5px] font-medium uppercase tracking-[0.05em] text-text-dim';
/**
 * The ingredients "table": name | quantity | type | ✕. The canvas's leading
 * drag column is stripped — reordering needs a DnD library, which is a new
 * dependency, so `display_order` stays the row index (see RecetaEditorPage).
 *
 * Carries the columns but NOT `display`, so the caller decides: the rows are a
 * grid at every width, the column-header bar only from `md` up (the mobile
 * artboard's rows have no header — the type hint below carries the meaning).
 */
const ING_GRID =
  'grid-cols-[1fr_84px_auto_28px] items-center gap-2 md:grid-cols-[1fr_112px_92px_28px] md:gap-3';

interface Props {
  initial?: EditorState;
  error: string | null;
  onSubmit: (state: EditorState) => void;
  /**
   * The recipe being edited — the media tile draws its cover photo, or the
   * placeholder whose hue is derived from the id, so the tile matches the read
   * view and the list card. Absent on create: there is no id yet, so there is
   * nothing to name a photo's object path after and nothing to derive a hue
   * from — the canvas draws an empty dashed tile there instead. (Adding a
   * photo to a brand-new recipe therefore means saving it first.)
   */
  recipe?: Pick<Recipe, 'id' | 'name' | 'photo_url' | 'updated_at' | 'created_by_user_id'>;
  /** Remove-from-library (mobile's danger button). Absent on create. */
  onRemove?: () => void;
}

export function RecipeEditorForm({ initial, error, onSubmit, recipe, onRemove }: Props) {
  const { t, i18n } = useTranslation('recetas');
  const { t: tCommon } = useTranslation('common');
  const lang: 'es' | 'en' = i18n.language?.startsWith('en') ? 'en' : 'es';

  const methods = useForm<EditorState>({
    resolver: zodResolver(recipeFormSchema) as never,
    defaultValues: initial ?? emptyEditorState(),
  });
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = methods;

  // RecetaEditorPage passes `initial` once data loads; keep it in sync.
  useEffect(() => {
    if (initial) reset(initial);
  }, [initial, reset]);

  // The explicit second generic pins this field array to `rows`. Without it,
  // TS infers `TFieldArrayName` as the union of every array path on
  // `EditorState` now that `steps` exists too, and `fields` widens to
  // `EditorRow | { stepId: string; text: string }` — losing `rowId` (only
  // `EditorRow` has it) on every read below. `RecipeStepsField` has the same
  // latent union, harmless there only because it never reads a field-specific
  // property (it renders by index, not by `field.stepId`).
  const { fields, append, remove } = useFieldArray<EditorState, 'rows'>({
    control,
    name: 'rows',
  });

  const rows = watch('rows');
  const servingsNum = parseDecimalInput(watch('servings')) ?? 0;
  const mealTypes = watch('mealTypes') ?? [];
  const recipeName = watch('name') ?? '';

  // Mobile's add affordance is a sheet, not an inline search line.
  const [addOpen, setAddOpen] = useState(false);
  // Deleting a row is confirmed IN the row (canvas `MConfirmDeleteRow`), so the
  // strip needs to know which one — by rowId, not index: an index would point at
  // the wrong row the moment an earlier one is removed.
  const [confirmRowId, setConfirmRowId] = useState<string | null>(null);
  // The row the web footer just created, so its (empty) quantity input can take
  // focus on mount. `autoFocus` fires on mount only, which is exactly the event
  // this drives — the input's own `onFocus` below clears it right back to null,
  // so the flag never outlives the autofocus it exists for.
  const [justAddedRowId, setJustAddedRowId] = useState<string | null>(null);

  function toggleMealType(key: RecipeMealType) {
    const next = mealTypes.includes(key)
      ? mealTypes.filter((m) => m !== key)
      : [...mealTypes, key];
    setValue('mealTypes', next, { shouldDirty: true });
  }

  // The row quantities are raw strings and may carry a decimal comma, so the
  // live macros read them through the same parser the schema and the save path
  // use (`Number('82,4')` would be NaN and the row would vanish from the card).
  const macroRows = (rows ?? [])
    .map((r) => ({ ...r, qty: parseDecimalInput(r.quantity) ?? 0 }))
    .filter((r) => r.ingredient && r.qty > 0)
    .map((r) => ({
      ingredient: r.ingredient as Ingredient,
      quantity: r.qty,
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

  /**
   * A row is born with its ingredient already in it. The web footer's search
   * hands over no quantity (you type it into the row that just appeared — hence
   * the autofocus below); the mobile sheet's stepper hands over the one you
   * chose. `per_serving` starts false: "en total" — the quantity you enter is
   * the one that goes into the pot, which is what a recipe normally records.
   */
  function addIngredient(ingredient: Ingredient, quantity?: number) {
    const rowId = newRowId();
    setJustAddedRowId(quantity === undefined ? rowId : null);
    append({
      rowId,
      ingredient,
      quantity: quantity === undefined ? '' : String(quantity),
      per_serving: false,
    });
  }

  function removeRow(index: number) {
    setConfirmRowId(null);
    remove(index);
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
    <FormProvider {...methods}>
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
            {recipe ? (
              <RecipePhotoField recipe={recipe} />
            ) : (
              // Create: no id, so neither a hue to derive nor a prefix to
              // upload under. The canvas draws an empty dashed tile here — and
              // it stays a tile, not a button that would lie about what it does.
              <div className="size-[70px] shrink-0 overflow-hidden rounded-[12px] md:size-24">
                <div
                  aria-hidden="true"
                  className="grid size-full place-items-center rounded-[12px] border-[1.5px] border-dashed border-input bg-muted text-text-dim"
                >
                  <Utensils className="size-5 md:size-6" />
                </div>
              </div>
            )}

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
                {/* Half a serving is legal (the field was `min={0.5} step="0.5"`),
                    so servings is fraction-capable — and a Spanish keyboard types
                    `2,5`, which a `type="number"` element would have handed React
                    as "25". Hence `NumberField`. The `min` gate went with the
                    `type` switch; the schema's `SERVINGS_MIN` is the gate now. */}
                <NumberField
                  id="recipe-servings"
                  label={t('form.servings')}
                  labelClassName={META_LABEL}
                  className={cn(META_INPUT, 'w-[68px]')}
                  {...register('servings')}
                />

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

          {/* Ingredients (canvas `RecetaEditorWebV2`'s table / `MIngEditRow`).
              NOT `overflow-hidden`, unlike the sibling cards: the footer's search
              drops its results list *below* the input, i.e. past the card's own
              bottom edge — clipping the card would swallow the dropdown whole and
              picking an ingredient on desktop would be impossible. The header and
              footer bars round their own outer corners instead. */}
          <Card>
            <div className="flex items-center gap-2 rounded-t-lg border-b bg-muted px-3.5 py-2.5 md:px-4">
              <h2 className={CARD_HEADER}>{t('form.ingredients')}</h2>
              <span className="tnum text-[10.5px] text-text-dim">{fields.length}</span>
            </div>

            {fields.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 px-6 py-8 text-center">
                <span className="grid size-10 place-items-center rounded-[12px] bg-muted text-text-dim">
                  <Utensils className="size-4" aria-hidden="true" />
                </span>
                <p className="text-[13px] font-semibold">{t('form.emptyTitle')}</p>
                <p className="max-w-[38ch] text-[11.5px] leading-[1.45] text-text-dim">
                  {t('form.emptyHint')}
                </p>
              </div>
            ) : (
              <>
                {/* What the chip actually means — and it is not decorative: it
                    changes how the row aggregates (see computeRecipeMacros). */}
                <p className="border-b bg-muted px-3.5 py-1.5 text-[10.5px] leading-[1.4] text-text-dim md:px-4">
                  {t('form.typeHint')}
                </p>

                {/* Column names. Presentational: every cell below carries its own
                    accessible name (the ingredient's, or an aria-label), so a
                    screen reader gains nothing from re-announcing the header. */}
                <div
                  aria-hidden="true"
                  className={cn(
                    'hidden md:grid',
                    ING_GRID,
                    'border-b bg-muted px-3.5 py-2 md:px-4',
                    'text-[10px] font-medium uppercase tracking-[0.05em] text-text-dim',
                  )}
                >
                  <span>{t('form.colIngredient')}</span>
                  <span>{t('form.colQuantity')}</span>
                  <span>{t('form.colType')}</span>
                  <span />
                </div>

                <ul>
                  {fields.map((field, index) => {
                    const row = rows?.[index];
                    const ingredient = row?.ingredient ?? null;
                    const name = ingredient ? ingredientDisplayName(ingredient, lang) : '';
                    const unitSuffix =
                      ingredient?.unit_type === 'unit' ? t('form.units') : 'g';
                    const perServing = row?.per_serving ?? false;

                    // Deleting a row = an inline confirm IN the row (the canvas's
                    // convention for minor elements). Cancelar sits on the OUTSIDE:
                    // an imprecise thumb lands on it, never on the danger action.
                    if (confirmRowId === field.rowId) {
                      return (
                        <li
                          key={field.id}
                          className="flex items-center gap-2 border-b bg-danger-soft px-3 py-2.5 last:border-b-0"
                        >
                          <span className="grid size-[22px] shrink-0 place-items-center rounded-[7px] bg-danger text-white">
                            <Trash2 className="size-3" aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-danger-ink">
                            {t('form.removeRowConfirm', { name })}
                          </span>
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={() => removeRow(index)}
                            className="h-8 shrink-0 rounded-[9px] px-2.5 text-[11.5px]"
                          >
                            <Trash2 className="size-3" aria-hidden="true" />
                            {t('form.removeRow')}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setConfirmRowId(null)}
                            className="h-8 shrink-0 rounded-[9px] px-2.5 text-[11.5px]"
                          >
                            {tCommon('cancel')}
                          </Button>
                        </li>
                      );
                    }

                    return (
                      <li
                        key={field.id}
                        className={cn(
                          'grid',
                          ING_GRID,
                          'border-b px-3.5 py-2 last:border-b-0 md:px-4',
                        )}
                      >
                        <div className="min-w-0 leading-[1.25]">
                          <span className="block truncate text-[12.5px] font-medium md:text-[13px]">
                            {name}
                          </span>
                          {ingredient?.brand && (
                            <span className="block truncate text-[10.5px] text-text-dim">
                              {ingredient.brand}
                            </span>
                          )}
                        </div>

                        {/* A quantity is fraction-capable (82,4 g), so it is a
                            `NumberField` — `type="text" inputMode="decimal"`, the
                            only shape in which a typed decimal comma survives to
                            JS. Its own label is rendered here (sr-only) rather
                            than by the field: the column header carries the visible
                            name. `min={0}` went with the `type` switch; the
                            schema's `rowInvalidQuantity` rule (> 0) is the gate. */}
                        <div>
                          <Label htmlFor={`row-qty-${field.rowId}`} className="sr-only">
                            {t('form.quantityOf', { name })}
                          </Label>
                          <NumberField
                            id={`row-qty-${field.rowId}`}
                            suffix={unitSuffix}
                            autoFocus={field.rowId === justAddedRowId}
                            onFocus={() => setJustAddedRowId(null)}
                            placeholder={t('form.quantity')}
                            className="h-8 rounded-[7px] border-input bg-muted pl-2 pr-6 text-[12px] font-medium"
                            {...register(`rows.${index}.quantity`)}
                          />
                        </div>

                        {/* THE load-bearing control. `per_serving` decides how the
                            row aggregates in computeRecipeMacros: a "por ración"
                            row's quantity is multiplied by the servings before it
                            enters the total (so it lands whole in EVERY serving);
                            an "en total" row's is not (so it is split across them).
                            The visible label shortens on mobile; the accessible
                            name stays the long form, which contains it. */}
                        <button
                          type="button"
                          aria-pressed={perServing}
                          // The visible label shortens below `md` — and the long
                          // one is `display:none` there, so it is out of the
                          // accessibility tree entirely. An explicit aria-label is
                          // what keeps the button NAMED on a phone: without it the
                          // chip announces as an unlabelled toggle. (jsdom applies
                          // no CSS and so cannot see this — a real browser can.)
                          aria-label={perServing ? t('form.typePerServing') : t('form.typeTotal')}
                          onClick={() =>
                            setValue(`rows.${index}.per_serving`, !perServing, {
                              shouldDirty: true,
                            })
                          }
                          className={cn(
                            // `justify-self-start` so the chip hugs its label
                            // instead of stretching across the fixed Tipo column.
                            'inline-flex h-[19px] items-center justify-center justify-self-start rounded-full border px-2 text-[9.5px] font-medium transition-colors',
                            perServing
                              ? 'border-accent-line bg-accent-soft text-accent-ink'
                              : 'border-input bg-card text-text-dim hover:bg-muted',
                          )}
                        >
                          <span className="md:hidden">
                            {perServing ? t('form.typePerServingShort') : t('form.typeTotalShort')}
                          </span>
                          <span className="hidden md:inline">
                            {perServing ? t('form.typePerServing') : t('form.typeTotal')}
                          </span>
                        </button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t('form.removeRowLabel', { name })}
                          onClick={() => setConfirmRowId(field.rowId)}
                          className="size-7 text-text-dim"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {/* The add affordance. Web: the search line lives at the foot of the
                table and picking a result appends a row. Mobile: a thumb cannot
                reach a dropdown pinned under a 12px input, so the canvas swaps it
                for a full-width button that opens the bottom sheet. */}
            <div className="rounded-b-lg border-t bg-muted px-3 py-2.5 md:px-3.5">
              <Button
                type="button"
                onClick={() => setAddOpen(true)}
                className="h-10 w-full rounded-[11px] md:hidden"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                {t('form.addRow')}
              </Button>
              <div className="hidden md:block">
                <IngredientAutocomplete
                  selected={null}
                  onSelect={(ing) => addIngredient(ing)}
                  onClear={() => {}}
                  placeholder={t('form.addRowSearch')}
                />
              </div>
            </div>
          </Card>

          <AddIngredientSheet
            open={addOpen}
            onOpenChange={setAddOpen}
            recipeName={recipeName}
            onAdd={(ing, quantity) => addIngredient(ing, quantity)}
          />

          {/* R-36: structured steps replace the single `instructions` textarea. */}
          <Card className="overflow-hidden">
            <div className="border-b bg-muted px-4 py-2.5">
              <h2 className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-text-dim">
                {t('form.steps')}
              </h2>
            </div>
            <div className="p-3.5">
              <RecipeStepsField />
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
    </FormProvider>
  );
}
