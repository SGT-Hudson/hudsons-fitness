import { useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/AuthProvider';
import type { Recipe } from '../api';
import { useClearRecipePhoto, useSetRecipePhoto } from '../hooks';
import { canEditRecipe } from '../ownership';
import { PhotoDecodeError } from '../photoResize';
import { publicPhotoUrl } from '../photoStorage';
import { RecipePhoto, type RecipePhotoSource } from './RecipePhoto';
import { RecipePhotoLightbox } from './RecipePhotoLightbox';

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
 *
 * Only the add/replace control sits under the tile. Remove is a trash badge in
 * the photo's corner, and tapping the photo itself opens the same lightbox the
 * detail page uses: two stacked full-width buttons under a 70px tile made the
 * meta row taller than the title beside it, and a photo you had just uploaded
 * could only be seen big by leaving the editor.
 *
 * The unsupported-format message is a SIBLING of the tile column, not a child:
 * inside a 70px column it wrapped to one word per line. The editor's meta card
 * wraps, so it lands on its own full-width line under the row.
 */
export function RecipePhotoField({ recipe }: Props) {
  const { t } = useTranslation('recetas');
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [decodeFailed, setDecodeFailed] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);

  const setPhoto = useSetRecipePhoto();
  const clearPhoto = useClearRecipePhoto();
  const busy = setPhoto.isPending || clearPhoto.isPending;

  const canEdit = canEditRecipe(recipe, user?.id);
  const hasPhoto = !!recipe.photo_url;
  // The tile draws the thumb; the lightbox opens the full rendition. Offered
  // only while the tile's own image loads — same rule as the detail page's
  // hero, so a dangling `photo_url` (see photoStorage.ts) never opens a modal
  // onto a broken `<img>`. The broken URL is stored rather than a flag so a
  // replace, which changes the URL, gets a fresh chance without an effect.
  const fullUrl = publicPhotoUrl(recipe);
  const thumbUrl = publicPhotoUrl(recipe, 'thumb');
  const canOpen = !!fullUrl && thumbUrl !== brokenUrl && !busy;

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
    <>
      <div className="flex w-[70px] shrink-0 flex-col gap-1.5 md:w-24">
        <div className="relative size-[70px] overflow-hidden rounded-[12px] md:size-24">
          {/* The tile draws at 70px (96px at `md`) — the hero *placeholder* look
              (40px icon) is right here, but downloading the 1600px `full` image
              into that small a box is not, hence the explicit thumb rendition. */}
          <RecipePhoto recipe={recipe} variant="hero" rendition="thumb" onBroken={setBrokenUrl} />
          {/* An overlay rather than a wrapper, so the photo keeps its place in
              the tree when the affordance appears or disappears (wrapping would
              remount it and re-request an image that had just failed). */}
          {canOpen && (
            <button
              type="button"
              aria-label={t('media.openPhoto')}
              onClick={() => setLightboxOpen(true)}
              className="absolute inset-0 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            />
          )}
          {canEdit && hasPhoto && (
            <button
              type="button"
              aria-label={t('media.removePhoto')}
              disabled={busy}
              onClick={() => {
                // A leftover "Formato no admitido" from a prior failed pick must
                // not survive a successful remove of the (different) photo that
                // replaced it.
                setDecodeFailed(false);
                clearPhoto.mutate(recipe.id);
              }}
              // A light disc under a red glyph, not a red fill: at 24px on top of
              // an arbitrary photo, a tinted solid reads as part of the food.
              className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-card/85 text-danger-ink shadow-hi backdrop-blur-sm transition-colors hover:bg-card focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-danger disabled:opacity-60 md:right-1.5 md:top-1.5 md:size-7"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </button>
          )}
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
          </>
        )}
      </div>

      {canEdit && decodeFailed && (
        // `order-last`, so the message wraps BELOW the whole meta row instead
        // of splitting the tile from the title it sits beside. Its place in the
        // DOM stays next to the control that produced it, which is what the
        // alert announcement and the reading order want.
        <p role="alert" className="order-last w-full text-[11px] leading-[1.35] text-danger-ink">
          {t('media.unsupportedFormat')}
        </p>
      )}

      {canOpen && fullUrl && (
        <RecipePhotoLightbox
          open={lightboxOpen}
          onOpenChange={setLightboxOpen}
          src={fullUrl}
          alt={t('media.photoAlt', { name: recipe.name })}
        />
      )}
    </>
  );
}
