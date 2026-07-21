import { useEffect, useState } from 'react';
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
  className?: string;
}

/**
 * A recipe's cover photo, with the shared placeholder as the no-photo case
 * (R-36b). Every media slot goes through this — the list card, the mobile row,
 * the detail hero and the editor tile — so "has a photo" is decided in exactly
 * one place. The empty case never regresses into a broken `<img>`, and neither
 * does a dangling `photo_url` (Storage object gone, column update never ran —
 * see photoStorage.ts): if the photo itself fails to load, the `onError`
 * fallback below swaps back to the placeholder.
 *
 * The hero asks for the 1600px `full` rendition by default; every smaller
 * slot takes the 400px `thumb` — see `rendition` above to override that. Both
 * are pre-sized WebP blobs uploaded by the client (photoResize.ts), so
 * nothing here is transformed on read.
 *
 * Fills its container — size and rounding are the caller's className, exactly
 * as with the placeholder, so the two are interchangeable at every call site.
 */
export function RecipePhoto({ recipe, variant = 'card', rendition, className }: Props) {
  const { t } = useTranslation('recetas');
  const url = publicPhotoUrl(recipe, rendition ?? (variant === 'hero' ? 'full' : 'thumb'));
  const [broken, setBroken] = useState(false);

  // A new url (a different recipe, or a replace/clear) deserves a fresh
  // attempt — the failure belongs to the URL that produced it, not forever.
  useEffect(() => {
    setBroken(false);
  }, [url]);

  if (!url || broken) {
    return <RecipeMediaPlaceholder recipeId={recipe.id} variant={variant} className={className} />;
  }

  return (
    <img
      src={url}
      alt={t('media.photoAlt', { name: recipe.name })}
      loading="lazy"
      onError={() => setBroken(true)}
      className={cn('h-full w-full object-cover', className)}
    />
  );
}
