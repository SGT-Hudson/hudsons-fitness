import { useMemo, useState } from 'react';
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
import { IngredientEditorForm, INGREDIENT_EDITOR_FORM_ID } from './IngredientEditorForm';
import { emptyForm } from '../ingredientForm';
import type { Ingredient } from '../api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefill the name — the query the caller searched for and did not find. */
  defaultName?: string;
  /** The created row, handed straight back so the caller can select it. */
  onSaved?: (ingredient: Ingredient) => void;
}

/**
 * CREATE-ONLY. R-33 wave 6 moved ingredient create/edit onto routes
 * (`/recipes/ingredients/new`, `/new/manual`, `/scan`, `/:id/edit`), and this
 * dialog kept exactly ONE job the routes cannot do: **create-then-select, in
 * place**. You are filling a recipe row, the ingredient does not exist, you
 * create it here — and it is selected into the row you were filling. `onSaved`
 * stays a synchronous local callback instead of a return-to intent parked in
 * router state (Gonzalo, 2026-07-13).
 *
 * Its body is `IngredientEditorForm` — the very editor the routes mount, so
 * there is ONE editor, not two. That form owns the mutations and the submit
 * branch; the footer's "Guardar" sits outside it and submits it by id.
 *
 * Callers: `IngredientAutocomplete` (recipe editor, web) and `AddIngredientSheet`
 * (recipe editor, mobile — where this nests inside a vaul Drawer).
 */
export function IngredientDialog({ open, onOpenChange, defaultName, onSaved }: Props) {
  const { t } = useTranslation('ingredientes');
  const { t: tCommon } = useTranslation('common');
  const [submitting, setSubmitting] = useState(false);

  // Must be a STABLE reference: `IngredientEditorForm` re-seeds itself (a
  // `reset()`) whenever its seed's identity changes, so a fresh object per
  // render would wipe whatever the user has typed. Same reason
  // `IngredientEditorPage` memoizes its own.
  const initialValues = useMemo(
    () => ({ ...emptyForm, name: defaultName?.trim() ?? '' }),
    [defaultName],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('dialog.createTitle')}</DialogTitle>
          <DialogDescription>{t('dialog.createSubtitle')}</DialogDescription>
        </DialogHeader>

        {/* R-01 (★ model item 5): the shared-library contract, stated where the
            contribution happens — as on the editor route. Private content goes
            in the per-user note on the user_ingredient_refs row, not in the
            ingredient's name/brand. */}
        <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
          {t('createNoteHint')}
        </p>

        {/* One column: the editor's `md:` right rail is sized for a page, and
            this is a dialog. The preview card stacks under the fields instead. */}
        <IngredientEditorForm
          initialValues={initialValues}
          onSubmittingChange={setSubmitting}
          onSaved={(ingredient) => {
            onSaved?.(ingredient);
            onOpenChange(false);
          }}
          className="md:grid-cols-1"
        />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon('cancel')}
          </Button>
          <Button type="submit" form={INGREDIENT_EDITOR_FORM_ID} disabled={submitting}>
            {submitting ? tCommon('loading') : tCommon('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
