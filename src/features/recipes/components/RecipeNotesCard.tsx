import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useRecipeNote, useSaveRecipeNote } from '../hooks';

/**
 * R-36 — a private, per-user note on a recipe.
 *
 * The note lives on user_recipe_refs.note, so it exists only for recipes in the
 * user's library — including recipes created by someone else, which the user
 * cannot edit but can still annotate. It is read often (while cooking) and
 * written briefly, which is why it sits inline on the detail page rather than
 * behind a dialog.
 *
 * Saves on an explicit button, and only on that. It used to save on blur, which
 * made it the one field in the app that wrote itself — every other surface is a
 * form with a submit. Blur-save also looked saved when it was not: nothing
 * marked the note dirty, so text lost to a closed tab went unannounced. The
 * unsaved marker is what makes the explicit button fair, so the two ship
 * together (spec 2026-07-20-recipe-note-explicit-save).
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

  // Derived, not state: a useState mirror of two values that already exist
  // would only be a way to hold a stale answer. Trimmed on both sides so
  // trailing whitespace alone never counts as a change.
  const dirty = draft.trim() !== data.note.trim();

  function handleSave() {
    save.mutate({ recipeId, note: draft }, { onSuccess: () => setSaved(true) });
  }

  return (
    <Card data-slot="notes" className="px-4 pb-3 pt-0 md:px-4.5">
      <div className="flex items-center justify-between border-b py-3">
        <h2 className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-text-dim">
          {t('detail.notesTitle')}
        </h2>
        {/* Dirty wins: you cannot be simultaneously saved and unsaved, and the
            state that needs acting on is the one worth showing. */}
        {dirty ? (
          <span className="text-[10.5px] text-text-dim">{t('detail.notesUnsaved')}</span>
        ) : (
          saved &&
          !save.isPending && (
            <span className="text-[10.5px] text-text-dim">{t('detail.notesSaved')}</span>
          )
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
        />
        <div className="mt-2.5 flex justify-end">
          <Button
            type="button"
            size="sm"
            disabled={!dirty || save.isPending}
            onClick={handleSave}
          >
            {t('detail.notesSave')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
