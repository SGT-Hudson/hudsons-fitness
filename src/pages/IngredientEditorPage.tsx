import { useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Barcode, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/layout/PageShell';
import { useAuth } from '@/features/auth/AuthProvider';
import { useIngredient } from '@/features/ingredients/hooks';
import { canEditIngredient } from '@/features/ingredients/ownership';
import {
  INGREDIENTS_LIST,
  readIngredientEditorState,
} from '@/features/ingredients/editorRoute';
import {
  IngredientEditorForm,
  INGREDIENT_EDITOR_FORM_ID,
} from '@/features/ingredients/components/IngredientEditorForm';
import {
  emptyForm,
  type IngredientFormState,
} from '@/features/ingredients/components/IngredientFormFields';

/**
 * The ingredient editor as a PAGE (canvas `IngredienteCrearWebV2` /
 * `IngredienteEditarMobile`) — one component behind two routes:
 *
 *  - `/recipes/ingredients/new/manual` — empty, or seeded from whatever the
 *    method picker / the scanner put in `location.state` (see
 *    `IngredientEditorRouteState`, the contract they code against);
 *  - `/recipes/ingredients/:id/edit` — the stored row, OWNER ONLY.
 *
 * The body (`IngredientEditorForm`) owns the mutations and the three-way submit
 * branch; this page only decides what seeds it, who may see it, and where you
 * land afterwards. "Guardar" lives in the header on both artboards and submits
 * the form it sits outside via `form={INGREDIENT_EDITOR_FORM_ID}`; cancel is
 * desktop-only (mobile cancels with the back arrow) — the same division of
 * labour as `RecetaEditorPage`.
 */
export function IngredientEditorPage() {
  const { id } = useParams<{ id?: string }>();
  const isNew = !id;
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { t } = useTranslation('ingredientes');
  const { t: tCommon } = useTranslation('common');

  const query = useIngredient(isNew ? null : id);
  const ingredient = isNew ? undefined : query.data;
  const [submitting, setSubmitting] = useState(false);

  // `location.state` is stable across THIS route's re-renders (it only changes
  // on a fresh navigation, which remounts the page), and the reader hands back
  // the very objects it was given — so `offProduct` keeps its identity while the
  // user types. That matters: `IngredientEditorForm` re-seeds itself (a
  // `reset()`) whenever a seed's identity changes, and a fresh reference per
  // render would silently wipe whatever had been typed. Same reason
  // `RecetaEditorPage` memoizes its `initial`. Above the early returns below, so
  // hook order stays constant regardless of loading/error state.
  const { offProduct, ean, name } = readIngredientEditorState(location.state);
  const initialValues: IngredientFormState | undefined = useMemo(
    () => (name ? { ...emptyForm, name } : undefined),
    [name],
  );

  // Where the editor exits to: the list, still scoped to the search the user
  // came from (`?q=` rides along both ways — the list carries it in, this
  // carries it back out). There is no ingredient read view to return to.
  const exitTo = `${INGREDIENTS_LIST}${location.search}`;

  if (!isNew && query.isLoading) {
    return <div className="text-muted-foreground">{tCommon('loading')}</div>;
  }
  if (!isNew && query.error) {
    return <Navigate to={exitTo} replace />;
  }
  // Constraint 8 — a deep link (a bookmark, a typed URL; nothing in the UI links
  // here) to a row I did not create. `updateIngredient` is a direct table write
  // and RLS would reject it, so rendering the editor could only end in a failed
  // save. Covers the system seeds too (`created_by_user_id` null): nobody owns
  // them, so nobody edits them.
  if (!isNew && ingredient && !canEditIngredient(ingredient, user?.id)) {
    return <Navigate to={exitTo} replace />;
  }

  const actions = (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => navigate(exitTo)}
        className="hidden md:inline-flex"
      >
        {tCommon('cancel')}
      </Button>
      <Button
        type="submit"
        form={INGREDIENT_EDITOR_FORM_ID}
        size="sm"
        disabled={submitting}
        className="md:h-9 md:px-3.5"
      >
        <Save className="h-4 w-4" aria-hidden="true" />
        {submitting ? tCommon('loading') : tCommon('save')}
      </Button>
    </>
  );

  return (
    <PageShell
      title={isNew ? t('editor.newTitle') : t('editor.editTitle')}
      subtitle={isNew ? t('editor.newSubtitle') : ingredient?.name}
      actions={actions}
      back={exitTo}
    >
      <div className="space-y-3 md:space-y-3.5">
        {/* R-01 (★ model item 5): the shared-library contract, stated where the
            contribution happens. */}
        {isNew && <p className="text-[12.5px] text-muted-foreground">{t('createNoteHint')}</p>}

        {/* The scanner's not-found path: we have a barcode but OFF has no
            product behind it. The row will be manual and will NOT keep the code
            (the `ingredients_external_consistency` CHECK forbids an external_id
            on a manual row), so this says so instead of pretending otherwise. */}
        {isNew && ean && (
          <p className="flex items-start gap-1.5 rounded-[12px] border border-amber-line bg-amber-soft px-3 py-2 text-[11.5px] leading-[1.45] text-amber-ink">
            <Barcode className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            {t('editor.scannedNotFound', { code: ean })}
          </p>
        )}

        <IngredientEditorForm
          ingredient={ingredient}
          offProduct={offProduct}
          initialValues={initialValues}
          onSubmittingChange={setSubmitting}
          onSaved={() => navigate(exitTo, { replace: true })}
        />
      </div>
    </PageShell>
  );
}
