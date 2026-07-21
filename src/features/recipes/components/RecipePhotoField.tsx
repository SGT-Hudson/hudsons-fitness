import { useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/AuthProvider';
import type { Recipe } from '../api';
import { useClearRecipePhoto, useSetRecipePhoto } from '../hooks';
import { canEditRecipe } from '../ownership';
import { PhotoDecodeError } from '../photoResize';
import { RecipePhoto, type RecipePhotoSource } from './RecipePhoto';

interface Props {
  recipe: RecipePhotoSource & Pick<Recipe, 'created_by_user_id'>;
}

/**
 * The editor's media area: the cover photo (or the placeholder) plus the
 * add / replace / remove controls.
 *
 * The controls are gated on `canEditRecipe` (R-01): a recipe is a pooled
 * object you may merely hold a ref to, and the bucket's RLS only lets its
 * creator write under that recipe's prefix — so for anyone else the upload is
 * a guaranteed denial. They see the photo; they get no controls. The editor
 * route already bounces non-creators to the read view, which makes this a
 * second gate rather than the only one — deliberately, because the tile is the
 * only thing here that writes to Storage.
 *
 * `accept="image/*"` is what makes iOS hand back a converted JPEG from the
 * photo picker instead of a raw HEIC; when a HEIC does arrive anyway (picking
 * through Files), `resizeToWebp` rejects with `PhotoDecodeError` and that is
 * the one failure reported inline here — it is the user's to fix, and the
 * generic toast would not tell them how.
 */
export function RecipePhotoField({ recipe }: Props) {
  const { t } = useTranslation('recetas');
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [decodeFailed, setDecodeFailed] = useState(false);

  const setPhoto = useSetRecipePhoto();
  const clearPhoto = useClearRecipePhoto();
  const busy = setPhoto.isPending || clearPhoto.isPending;

  const canEdit = canEditRecipe(recipe, user?.id);
  const hasPhoto = !!recipe.photo_url;

  async function handlePick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Cleared eagerly so picking the SAME file again still fires `change`
    // (the browser only fires it when the value differs) — otherwise a retry
    // after a failed upload would do nothing.
    e.target.value = '';
    if (!file) return;
    setDecodeFailed(false);
    try {
      await setPhoto.mutateAsync({ recipeId: recipe.id, file });
    } catch (err) {
      // Everything else is already toasted by the mutation's own onError.
      if (err instanceof PhotoDecodeError) setDecodeFailed(true);
    }
  }

  return (
    <div className="flex w-[70px] shrink-0 flex-col gap-1.5 md:w-24">
      <div className="relative size-[70px] overflow-hidden rounded-[12px] md:size-24">
        {/* The tile draws at 70px (96px at `md`) — the hero *placeholder* look
            (40px icon) is right here, but downloading the 1600px `full` image
            into that small a box is not, hence the explicit thumb rendition. */}
        <RecipePhoto recipe={recipe} variant="hero" rendition="thumb" />
        {busy && (
          <div
            role="status"
            className="absolute inset-0 grid place-items-center bg-background/70 text-text-dim"
          >
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            <span className="sr-only">
              {clearPhoto.isPending ? t('media.removing') : t('media.uploading')}
            </span>
          </div>
        )}
      </div>

      {canEdit && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            aria-label={t('media.filePicker')}
            className="sr-only"
            onChange={(e) => void handlePick(e)}
          />
          <Button
            type="button"
            variant="outline"
            aria-label={hasPhoto ? t('media.replacePhoto') : t('media.addPhoto')}
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="h-7 w-full rounded-[9px] px-1.5 text-[10.5px]"
          >
            {hasPhoto ? t('media.replaceShort') : t('media.addShort')}
          </Button>
          {hasPhoto && (
            <Button
              type="button"
              variant="ghost"
              aria-label={t('media.removePhoto')}
              disabled={busy}
              onClick={() => {
                // A leftover "Formato no admitido" from a prior failed pick
                // must not survive a successful remove of the (different)
                // photo that replaced it.
                setDecodeFailed(false);
                clearPhoto.mutate(recipe.id);
              }}
              className="h-7 w-full rounded-[9px] px-1.5 text-[10.5px]"
            >
              {t('media.removeShort')}
            </Button>
          )}
          {decodeFailed && (
            <p role="alert" className="text-[10px] leading-[1.35] text-danger-ink">
              {t('media.unsupportedFormat')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
