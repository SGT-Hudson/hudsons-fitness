import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  emptyEditorState,
  recipeToEditorState,
  RecipeEditorForm,
  type EditorState,
} from '@/features/recipes/components/RecipeEditorForm';
import { useRecipe, useSaveRecipe } from '@/features/recipes/hooks';

export function RecetaEditorPage() {
  const { id } = useParams<{ id?: string }>();
  const isNew = !id || id === 'nuevo';
  const navigate = useNavigate();
  const { t } = useTranslation('recetas');

  const recipeQuery = useRecipe(isNew ? null : id);
  const save = useSaveRecipe();
  const [error, setError] = useState<string | null>(null);

  if (!isNew && recipeQuery.isLoading) {
    return <div className="text-muted-foreground">{t('editor.loading')}</div>;
  }
  if (!isNew && recipeQuery.error) {
    return <Navigate to="/recetas" replace />;
  }

  const initial: EditorState | undefined =
    !isNew && recipeQuery.data ? recipeToEditorState(recipeQuery.data) : undefined;

  async function handleSubmit(state: EditorState) {
    setError(null);
    try {
      const newId = await save.mutateAsync({
        recipeId: isNew ? null : id!,
        name: state.name.trim(),
        servings: Number(state.servings),
        description: state.description.trim() === '' ? null : state.description.trim(),
        instructions: state.instructions.trim() === '' ? null : state.instructions.trim(),
        ingredients: state.rows
          .filter((r) => r.ingredient && Number(r.quantity) > 0)
          .map((r, i) => ({
            ingredient_id: r.ingredient!.id,
            quantity: Number(r.quantity),
            per_serving: r.per_serving,
            display_order: i,
          })),
      });
      navigate(isNew ? `/recetas/${newId}` : '/recetas', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function handleDuplicate() {
    if (!recipeQuery.data) return;
    const dup = recipeToEditorState(recipeQuery.data);
    navigate('/recetas/nuevo', { state: { duplicate: { ...dup, name: `${dup.name} (copia)` } } });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">
        {isNew ? t('editor.newTitle') : t('editor.editTitle')}
      </h1>
      {/* R-01 (★ model item 5): make the shared-library contract loud at
          create time. Private content belongs in the per-user note on the
          reference row (not yet UI-surfaced — coming with the library
          notes feature), not in the recipe's name/description. */}
      {isNew && (
        <p className="text-sm text-muted-foreground">{t('editor.sharedLibraryHint')}</p>
      )}
      <RecipeEditorForm
        initial={initial ?? emptyEditorState()}
        submitting={save.isPending}
        error={error}
        onSubmit={handleSubmit}
        onCancel={() => navigate('/recetas')}
        onDuplicate={!isNew && recipeQuery.data ? handleDuplicate : undefined}
      />
    </div>
  );
}
