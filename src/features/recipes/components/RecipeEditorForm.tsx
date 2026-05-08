import { useState, type FormEvent } from 'react';
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

let rowIdCounter = 0;
function newRowId() {
  rowIdCounter += 1;
  return `row-${Date.now()}-${rowIdCounter}`;
}

export interface EditorRow {
  rowId: string;
  ingredient: Ingredient | null;
  quantity: string;
  per_serving: boolean;
}

export interface EditorState {
  name: string;
  servings: string;
  description: string;
  instructions: string;
  rows: EditorRow[];
}

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
  const [state, setState] = useState<EditorState>(initial ?? emptyEditorState());
  const [validationError, setValidationError] = useState<string | null>(null);

  const servingsNum = Number(state.servings);
  const macroRows = state.rows
    .filter((r) => r.ingredient && Number(r.quantity) > 0)
    .map((r) => ({
      ingredient: r.ingredient!,
      quantity: Number(r.quantity),
      perServing: r.per_serving,
    }));

  function update<K extends keyof EditorState>(key: K, value: EditorState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function updateRow(rowId: string, patch: Partial<EditorRow>) {
    setState((s) => ({
      ...s,
      rows: s.rows.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)),
    }));
  }

  function addRow() {
    setState((s) => ({
      ...s,
      rows: [...s.rows, { rowId: newRowId(), ingredient: null, quantity: '', per_serving: false }],
    }));
  }

  function removeRow(rowId: string) {
    setState((s) => ({ ...s, rows: s.rows.filter((r) => r.rowId !== rowId) }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setValidationError(null);
    const name = state.name.trim();
    const servings = Number(state.servings);
    if (name === '') {
      setValidationError(t('errors.nameRequired'));
      return;
    }
    if (!Number.isFinite(servings) || servings <= 0) {
      setValidationError(t('errors.servingsInvalid'));
      return;
    }
    const filledRows = state.rows.filter((r) => r.ingredient || r.quantity.trim() !== '');
    if (filledRows.length === 0) {
      setValidationError(t('errors.noIngredients'));
      return;
    }
    for (const row of filledRows) {
      if (!row.ingredient) {
        setValidationError(t('errors.rowMissingIngredient'));
        return;
      }
      const q = Number(row.quantity);
      if (!Number.isFinite(q) || q <= 0) {
        setValidationError(t('errors.rowInvalidQuantity'));
        return;
      }
    }
    onSubmit({ ...state, rows: filledRows });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6 min-w-0">
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-4">
              <div className="space-y-2">
                <Label htmlFor="recipe-name">{t('form.name')}</Label>
                <Input
                  id="recipe-name"
                  required
                  value={state.name}
                  onChange={(e) => update('name', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recipe-servings">{t('form.servings')}</Label>
                <Input
                  id="recipe-servings"
                  type="number"
                  inputMode="decimal"
                  min={0.5}
                  step="0.5"
                  required
                  value={state.servings}
                  onChange={(e) => update('servings', e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="recipe-description">{t('form.description')}</Label>
              <Input
                id="recipe-description"
                value={state.description}
                onChange={(e) => update('description', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recipe-instructions">{t('form.instructions')}</Label>
              <Textarea
                id="recipe-instructions"
                rows={4}
                value={state.instructions}
                onChange={(e) => update('instructions', e.target.value)}
              />
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
              {state.rows.map((row) => {
                const unitSuffix = !row.ingredient
                  ? ''
                  : row.ingredient.unit_type === 'unit'
                    ? t('form.units')
                    : 'g';
                return (
                  <li
                    key={row.rowId}
                    className="grid gap-2 sm:grid-cols-[1fr_140px_auto_auto] items-start"
                  >
                    <IngredientAutocomplete
                      selected={row.ingredient}
                      onSelect={(ing) => updateRow(row.rowId, { ingredient: ing })}
                      onClear={() => updateRow(row.rowId, { ingredient: null })}
                    />
                    <div className="relative">
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        min={0}
                        placeholder={t('form.quantity')}
                        value={row.quantity}
                        onChange={(e) => updateRow(row.rowId, { quantity: e.target.value })}
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
                        checked={row.per_serving}
                        onChange={(e) =>
                          updateRow(row.rowId, { per_serving: e.target.checked })
                        }
                      />
                      <span>{t('form.perServing')}</span>
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={tCommon('delete')}
                      onClick={() => removeRow(row.rowId)}
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
