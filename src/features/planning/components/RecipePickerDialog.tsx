import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RecipeAutocomplete, type RecipeOption } from '@/features/diario/components/RecipeAutocomplete';
import {
  firstRecipePickerError,
  recipePickerFormSchema,
  type RecipePickerFormValues,
} from '../schema';

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
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<RecipePickerFormValues>({
    resolver: zodResolver(recipePickerFormSchema),
    defaultValues: { hasRecipe: false, servings: '1' },
  });

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
      reset({ hasRecipe: true, servings: String(initialRecipe.servings) });
    } else {
      setRecipe(null);
      reset({ hasRecipe: false, servings: '1' });
    }
  }, [open, initialRecipe, reset]);

  function handleSelectRecipe(r: RecipeOption | null) {
    setRecipe(r);
    setValue('hasRecipe', !!r, { shouldValidate: true });
  }

  async function onValid(values: RecipePickerFormValues) {
    setError(null);
    if (!recipe) return;
    try {
      await onSave(recipe.id, recipe.name, Number(values.servings));
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // One localized message, original precedence (recipe → servings) — parity.
  const validationCode = firstRecipePickerError(
    errors as Record<string, { message?: string } | undefined>,
  );
  const validationError = validationCode
    ? t(`picker.errors.${validationCode}`)
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t('picker.editTitle') : t('picker.addTitle')}</DialogTitle>
          <DialogDescription>{t('picker.subtitle')}</DialogDescription>
        </DialogHeader>
        <form
          // The dialog is portaled but stays in the React tree, so its submit
          // would otherwise bubble to an ancestor <form> (e.g. the template
          // editor), saving stale state + navigating away. Stop it at the source.
          onSubmit={(e) => {
            e.stopPropagation();
            void handleSubmit(onValid)(e);
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label>{t('picker.recipe')}</Label>
            <RecipeAutocomplete
              selected={recipe}
              onSelect={handleSelectRecipe}
              onClear={() => handleSelectRecipe(null)}
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
              {...register('servings')}
            />
          </div>
          {(validationError || error) && (
            <p className="text-sm text-destructive">{validationError ?? error}</p>
          )}
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
