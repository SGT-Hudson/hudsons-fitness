import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useRecipeNote, useSaveRecipeNote } from '../hooks';

/**
 * R-36 — a private, per-user note on a recipe.
 *
 * The note lives on user_recipe_refs.note, so it exists only for recipes in the
 * user's library — including recipes created by someone else, which the user
 * cannot edit but can still annotate. Saves on blur: the note is read often
 * (while cooking) and written briefly, so a dialog would tax the common case.
 *
 * `data.exists` is the gate, not edit-ownership: saveRecipeNote runs an
 * `update … eq('recipe_id', …)` with no user filter (RLS scopes it), so
 * calling it with no ref row matches zero rows and resolves with no error —
 * a silent no-op. Returning null here keeps the textarea from ever existing
 * for a non-member, so that path is unreachable from this component.
 */
export function RecipeNotesCard({ recipeId }: { recipeId: string }) {
  const { t } = useTranslation('recetas');
  const { data, isLoading } = useRecipeNote(recipeId);
  const save = useSaveRecipeNote();
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Skip reseeding while the field is focused: a save's invalidation
    // refetch resolves after the user has already clicked back in and kept
    // typing, and would otherwise clobber their in-progress text.
    if (data && document.activeElement !== textareaRef.current) setDraft(data.note);
  }, [data]);

  if (isLoading || !data?.exists) return null;

  function handleBlur() {
    if (draft.trim() === (data?.note ?? '').trim()) return;
    save.mutate({ recipeId, note: draft }, { onSuccess: () => setSaved(true) });
  }

  return (
    <Card data-slot="notes" className="px-4 pb-3 pt-0 md:px-4.5">
      <div className="flex items-center justify-between border-b py-3">
        <h2 className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-text-dim">
          {t('detail.notesTitle')}
        </h2>
        {saved && !save.isPending && (
          <span className="text-[10.5px] text-text-dim">{t('detail.notesSaved')}</span>
        )}
      </div>
      <div className="py-3">
        <Textarea
          ref={textareaRef}
          rows={3}
          aria-label={t('detail.notesTitle')}
          placeholder={t('detail.notesPlaceholder')}
          className="min-h-[72px] resize-y rounded-[10px] bg-muted text-[13px] leading-[1.6]"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setSaved(false);
          }}
          onBlur={handleBlur}
        />
      </div>
    </Card>
  );
}
