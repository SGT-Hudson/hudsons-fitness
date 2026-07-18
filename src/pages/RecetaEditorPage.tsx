import { useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Copy, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog';
import { PageShell } from '@/components/layout/PageShell';
import {
  emptyEditorState,
  recipeToEditorState,
  RecipeEditorForm,
  RECIPE_EDITOR_FORM_ID,
  type EditorState,
} from '@/features/recipes/components/RecipeEditorForm';
import { RecipeMediaPlaceholder } from '@/features/recipes/components/RecipeMediaPlaceholder';
import { useAuth } from '@/features/auth/AuthProvider';
import { useHideRecipe, useRecipe, useSaveRecipe } from '@/features/recipes/hooks';
import { navigateToRecipeDuplicate } from '@/features/recipes/duplicate';
import { canEditRecipe } from '@/features/recipes/ownership';
import { parsePrepTimeMinutes, SERVINGS_MIN } from '@/features/recipes/schema';
import { parseDecimalInput } from '@/lib/number';

/**
 * The recipe editor (canvas `RecetaEditorWebV2` / `RecetaCrearWebV2`, and
 * `RecetaEditarMobile` / `RecetaCrearMobile`).
 *
 * The actions live in the page header on BOTH artboards — and `PageShell`
 * renders `actions` into the mobile BackHeader and PageHeaderV2 alike (one is
 * CSS-hidden), so "Guardar" is the one that shows on mobile while cancel /
 * duplicate / remove are desktop-only (`hidden md:inline-flex`). Mobile reaches
 * cancel through the back arrow and remove through the form's footer button —
 * exactly the artboards' division of labour. The buttons submit the form they
 * are outside of via `form={RECIPE_EDITOR_FORM_ID}`.
 */
export function RecetaEditorPage() {
  const { id } = useParams<{ id?: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { t } = useTranslation('recetas');
  const { t: tCommon } = useTranslation('common');

  const recipeQuery = useRecipe(isNew ? null : id);
  const save = useSaveRecipe();
  const hide = useHideRecipe();
  const [error, setError] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);

  const recipe = isNew ? undefined : recipeQuery.data;
  // `recipe` (react-query's `data`) keeps a stable identity across re-renders
  // as long as the underlying data hasn't changed, so these memoize on it
  // rather than the page's own re-render — `setError`/`isPending`/`removeOpen`
  // churn (e.g. opening then cancelling the remove dialog) must NOT produce a
  // new `initial` identity, or RecipeEditorForm's reset-on-`initial`-change
  // effect wipes whatever the user has typed. Above the early returns below
  // so hook order stays constant regardless of loading/error state.
  const initial: EditorState | undefined = useMemo(
    () => (recipe ? recipeToEditorState(recipe) : undefined),
    [recipe],
  );
  // The create page has no `recipe`. Reached via "Duplicar" (the editor's own
  // button, or the read view's — `navigateToRecipeDuplicate`), `location.state`
  // carries the source recipe's `EditorState` instead of a blank one;
  // `location.state` itself is stable across this route's re-renders (it only
  // changes on a fresh navigation, which unmounts/remounts this page), so
  // memoizing on it is safe — the same "don't reset the user's typing"
  // constraint as `initial` above.
  const duplicateState = (location.state as { duplicate?: EditorState } | null)?.duplicate;
  const emptyInitial = useMemo(() => duplicateState ?? emptyEditorState(), [duplicateState]);

  if (!isNew && recipeQuery.isLoading) {
    return <div className="text-muted-foreground">{t('editor.loading')}</div>;
  }
  if (!isNew && recipeQuery.error) {
    return <Navigate to="/recipes" replace />;
  }
  // A non-owner deep link (a bookmark, a typed URL — nothing in the UI links
  // here any more): `save_recipe` would 400 on this recipe, so send them to the
  // read view instead of rendering an editor that can only fail. Does not
  // affect item 1's duplicate path, which always targets `/recipes/new` (this
  // branch only fires for `/recipes/:id/edit`, `id` truthy).
  if (!isNew && recipe && !canEditRecipe(recipe, user?.id)) {
    return <Navigate to={`/recipes/${id}`} replace />;
  }

  async function handleSubmit(state: EditorState) {
    setError(null);
    // Form boundary (invariant 6): the minutes string becomes the integer|null
    // the RPC writes. A non-number / out-of-range value cannot reach here — the
    // zod schema blocks submit — but it maps to null (= "no time") rather than
    // shipping a string Postgres would choke on.
    const prep = parsePrepTimeMinutes(state.prepTime);
    try {
      const savedId = await save.mutateAsync({
        recipeId: isNew ? null : id!,
        name: state.name.trim(),
        // Fraction-capable (half servings are legal) and comma-typed, so it
        // parses through the shared boundary like the row quantities below.
        // The zod schema already refused anything below SERVINGS_MIN.
        servings: parseDecimalInput(state.servings) ?? SERVINGS_MIN,
        description: state.description.trim() === '' ? null : state.description.trim(),
        mealTypes: state.mealTypes,
        prepTimeMinutes: typeof prep === 'number' ? prep : null,
        // The quantity is a string the user typed and it may carry a decimal
        // COMMA (a Spanish keyboard's default) — so it parses through the
        // shared boundary (invariant 6), the same one the schema validated it
        // with. `Number('82,4')` is NaN, which this filter would silently drop:
        // the row would vanish from the saved recipe.
        ingredients: state.rows
          .map((r) => ({ row: r, quantity: parseDecimalInput(r.quantity) ?? 0 }))
          .filter(({ row, quantity }) => row.ingredient && quantity > 0)
          .map(({ row, quantity }, i) => ({
            ingredient_id: row.ingredient!.id,
            quantity,
            per_serving: row.per_serving,
            display_order: i,
          })),
        // R-36: blank steps are filtered here too (belt-and-braces — the zod
        // schema already refuses to submit one), and `display_order` is the
        // index AFTER filtering, so a blank step in the middle leaves no gap
        // in the saved sequence.
        steps: state.steps
          .map((s) => s.text.trim())
          .filter((text) => text !== '')
          .map((text, i) => ({ text, display_order: i })),
      });
      // After a successful save (create OR edit) land on the recipe's read
      // view — the thing you were making. The RPC returns the id, so this works
      // for a brand-new recipe too. (Pre-R-33 this went to the list, because
      // `/recipes/:id` was the editor itself and staying there was a no-op.)
      navigate(`/recipes/${savedId}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function handleDuplicate() {
    if (!recipe) return;
    navigateToRecipeDuplicate(navigate, recipe, t('actions.duplicateName', { name: recipe.name }));
  }

  async function handleRemove() {
    if (!id) return;
    try {
      await hide.mutateAsync(id);
      navigate('/recipes', { replace: true });
    } catch {
      // useHideRecipe already toasts the failure; keep the editor open.
      setRemoveOpen(false);
    }
  }

  // Leaving the editor (back / cancel) returns you where you came from: the read
  // view of the recipe you were editing, or the list when creating a new one.
  const exitTo = isNew ? '/recipes' : `/recipes/${id}`;

  const actions = (
    <>
      {recipe && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDuplicate}
          className="hidden md:inline-flex"
        >
          <Copy className="h-4 w-4" aria-hidden="true" />
          {t('actions.duplicate')}
        </Button>
      )}
      {recipe && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setRemoveOpen(true)}
          className="hidden border-danger-line text-danger-ink hover:bg-danger-soft md:inline-flex"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {t('editor.remove')}
        </Button>
      )}
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
        form={RECIPE_EDITOR_FORM_ID}
        size="sm"
        disabled={save.isPending}
        className="md:h-9 md:px-3.5"
      >
        <Save className="h-4 w-4" aria-hidden="true" />
        {save.isPending ? tCommon('loading') : tCommon('save')}
      </Button>
    </>
  );

  return (
    <PageShell
      title={isNew ? t('editor.newTitle') : t('editor.editTitle')}
      subtitle={isNew ? t('editor.newSubtitle') : recipe?.name}
      actions={actions}
      back={exitTo}
    >
      <div className="space-y-3 md:space-y-3.5">
        {/* R-01 (★ model item 5): make the shared-library contract loud at
            create time. Private content belongs in the per-user note on the
            reference row (not yet UI-surfaced — coming with the library
            notes feature), not in the recipe's name/description. */}
        {isNew && (
          <p className="text-[12.5px] text-muted-foreground">{t('editor.sharedLibraryHint')}</p>
        )}
        <RecipeEditorForm
          initial={initial ?? emptyInitial}
          error={error}
          onSubmit={handleSubmit}
          recipeId={recipe?.id}
          onRemove={recipe ? () => setRemoveOpen(true) : undefined}
        />
      </div>

      {/* Removing an entity = a centred confirm with a preview of the thing and
          its consequences (canvas `EliminarRecetaMobile`). The consequences are
          real and specific: `hide_owned_recipe` drops my library ref AND, if I
          created it, hands the recipe to the anonymous owner — I lose the right
          to edit it. So the action is "quitar de tu biblioteca", not "eliminar":
          the recipe survives, my claim on it does not. */}
      {recipe && (
        <ResponsiveDialog
          open={removeOpen}
          onOpenChange={setRemoveOpen}
          title={t('editor.removeTitle')}
          variant="centered"
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-danger-soft text-danger-ink">
                <Trash2 className="size-4" aria-hidden="true" />
              </span>
              <h2 className="pt-1 text-[16.5px] font-semibold tracking-[-0.01em]">
                {t('editor.removeTitle')}
              </h2>
            </div>

            <div className="flex items-center gap-3 rounded-[13px] border bg-muted p-2.5">
              <div className="size-10 shrink-0 overflow-hidden rounded-[11px]">
                <RecipeMediaPlaceholder recipeId={recipe.id} variant="thumbnail" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{recipe.name}</p>
                <p className="tnum text-[11px] text-text-dim">
                  {t('detail.servings', { count: recipe.servings })} ·{' '}
                  {t('list.ingredients', { count: recipe.recipe_ingredients.length })}
                </p>
              </div>
            </div>

            <p className="rounded-[11px] border border-danger-line bg-danger-soft p-2.5 text-[11.5px] leading-[1.45] text-danger-ink">
              {t('editor.removeConsequences')}
            </p>

            <div className="flex gap-2.5 pt-0.5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRemoveOpen(false)}
                className="h-11 flex-1 rounded-[13px]"
              >
                {tCommon('cancel')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={hide.isPending}
                onClick={handleRemove}
                className="h-11 flex-[1.25] rounded-[13px]"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {hide.isPending ? t('editor.removing') : t('editor.remove')}
              </Button>
            </div>
          </div>
        </ResponsiveDialog>
      )}
    </PageShell>
  );
}
