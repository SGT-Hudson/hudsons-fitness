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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RecipeAutocomplete, type RecipeOption } from '@/features/diario/components/RecipeAutocomplete';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRecipe?: { id: string; name: string; servings: number } | null;
  onSave: (
    recipeId: string,
    recipeName: string,
    servings: number,
  ) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  busy?: boolean;
}

export function RecipePickerDialog({
  open,
  onOpenChange,
  initialRecipe,
  onSave,
  onDelete,
  busy,
}: Props) {
  const { t } = useTranslation('planning');
  const { t: tCommon } = useTranslation('common');
  const isEdit = !!initialRecipe;
  const [recipe, setRecipe] = useState<RecipeOption | null>(null);
  const [servings, setServings] = useState('1');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (initialRecipe) {
      setRecipe({
        id: initialRecipe.id,
        name: initialRecipe.name,
        servings: 1,
        ingredient_count: 0,
      });
      setServings(String(initialRecipe.servings));
    } else {
      setRecipe(null);
      setServings('1');
    }
  }, [open, initialRecipe]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!recipe) {
      setError(t('picker.errors.pickRecipe'));
      return;
    }
    const s = Number(servings);
    if (!Number.isFinite(s) || s <= 0) {
      setError(t('picker.errors.servings'));
      return;
    }
    try {
      await onSave(recipe.id, recipe.name, s);
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t('picker.editTitle') : t('picker.addTitle')}</DialogTitle>
          <DialogDescription>{t('picker.subtitle')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-2">
            <Label>{t('picker.recipe')}</Label>
            <RecipeAutocomplete
              selected={recipe}
              onSelect={setRecipe}
              onClear={() => setRecipe(null)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="picker-servings">{t('picker.servings')}</Label>
            <Input
              id="picker-servings"
              type="number"
              inputMode="decimal"
              min={0.25}
              step="0.25"
              value={servings}
              onChange={(e) => setServings(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="sm:justify-between">
            <div>
              {isEdit && onDelete && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void onDelete()}
                  disabled={busy}
                >
                  {tCommon('delete')}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {tCommon('cancel')}
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? tCommon('loading') : tCommon('save')}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
