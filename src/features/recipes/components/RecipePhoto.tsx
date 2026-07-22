import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { Recipe } from '../api';
import { publicPhotoUrl } from '../photoStorage';
import { RecipeMediaPlaceholder, type RecipeMediaVariant } from './RecipeMediaPlaceholder';

/**
 * The minimum a media slot needs to draw a recipe: the id (the placeholder's
 * hue), the photo's object path, `updated_at` (the cache-bust) and the name
 * (the alt text). `RecipeListItem` and `Recipe` both satisfy it, so the card
 * grid and the detail page pass what they already have — no extra fetch.
 */
export type RecipePhotoSource = Pick<Recipe, 'id' | 'name' | 'photo_url' | 'updated_at'>;

interface Props {
  recipe: RecipePhotoSource;
  /** Same slot vocabulary as the placeholder it falls back to — also picks
   * the rendition (see `rendition` below) when that prop is left unset. */
  variant?: RecipeMediaVariant;
  /**
   * Which sized blob to fetch. Defaults to the variant's implied choice
   * (`hero` → the 1600px `full`, everything else → the 400px `thumb`) — set
   * this explicitly to decouple the two, e.g. the 70px editor tile wants the
   * hero *placeholder* look (40px icon) but has no excuse to download the
   * full-size image into that small a box, so it passes `variant="hero"
   * rendition="thumb"`.
   */
  rendition?: 'full' | 'thumb';
  /**
   * Fired with the URL that failed to load, when this component gives up on it
   * and swaps to the placeholder. Exists because the fallback is otherwise
   * invisible to the caller: the detail page decides whether the hero is
   * tappable (and whether the lightbox exists) from the same URL, and without
   * this it would keep offering "ver la foto a tamaño completo" over a broken
   * `<img>`. Callers that render the placeholder identically to the photo — the
   * card, the row, the editor tile — need nothing and pass nothing.
   */
  onBroken?: (url: string) => void;
  className?: string;
}

/**
 * A recipe's cover photo, with the shared placeholder as the no-photo case
 * (R-36b). Every media slot goes through this — the list card, the mobile row,
 * the detail hero and the editor tile — so "has a photo" is decided in exactly
 * one place. The empty case never regresses into a broken `<img>`, and neither
 * does a dangling `photo_url` (Storage object gone, column update never ran —
 * see photoStorage.ts): if the photo itself fails to load, the `onError`
 * fallback below swaps back to the placeholder — and tells the caller via
 * `onBroken`, so an affordance built on "there is a photo" (the detail page's
 * tappable hero and its lightbox) disappears with it instead of pointing at a
 * broken image.
 *
 * The hero asks for the 1600px `full` rendition by default; every smaller
 * slot takes the 400px `thumb` — see `rendition` above to override that. Both
 * are pre-sized WebP blobs uploaded by the client (photoResize.ts), so
 * nothing here is transformed on read.
 *
 * Fills its container — size and rounding are the caller's className, exactly
 * as with the placeholder, so the two are interchangeable at every call site.
 */
export function RecipePhoto({ recipe, variant = 'card', rendition, onBroken, className }: Props) {
  const { t } = useTranslation('recetas');
  const url = publicPhotoUrl(recipe, rendition ?? (variant === 'hero' ? 'full' : 'thumb'));

  // The failure belongs to the URL that produced it, not to the component: a
  // new url (a different recipe, or a replace/clear) deserves a fresh attempt.
  // Storing WHICH url broke, rather than a boolean reset by an effect, makes
  // that atomic — an effect-based reset renders the placeholder for one frame
  // against the new url before clearing, which is a visible flash on a replace.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);

  if (!url || url === brokenUrl) {
    return <RecipeMediaPlaceholder recipeId={recipe.id} variant={variant} className={className} />;
  }

  return (
    <img
      // Remount on a url change so the browser starts a clean load rather than
      // reusing the element that just failed.
      key={url}
      src={url}
      alt={t('media.photoAlt', { name: recipe.name })}
      loading="lazy"
      onError={() => {
        setBrokenUrl(url);
        onBroken?.(url);
      }}
      className={cn('h-full w-full object-cover', className)}
    />
  );
}
