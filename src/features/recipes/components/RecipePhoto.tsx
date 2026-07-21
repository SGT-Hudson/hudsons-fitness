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
  /** Same slot vocabulary as the placeholder it falls back to. */
  variant?: RecipeMediaVariant;
  className?: string;
}

/**
 * A recipe's cover photo, with the shared placeholder as the no-photo case
 * (R-36b). Every media slot goes through this — the list card, the mobile row,
 * the detail hero and the editor tile — so "has a photo" is decided in exactly
 * one place and the empty case never regresses into a broken `<img>`.
 *
 * The hero asks for the 1600px `full` rendition; every smaller slot takes the
 * 400px `thumb`. Both are pre-sized WebP blobs uploaded by the client
 * (photoResize.ts), so nothing here is transformed on read.
 *
 * Fills its container — size and rounding are the caller's className, exactly
 * as with the placeholder, so the two are interchangeable at every call site.
 */
export function RecipePhoto({ recipe, variant = 'card', className }: Props) {
  const { t } = useTranslation('recetas');
  const url = publicPhotoUrl(recipe, variant === 'hero' ? 'full' : 'thumb');

  if (!url) {
    return <RecipeMediaPlaceholder recipeId={recipe.id} variant={variant} className={className} />;
  }

  return (
    <img
      src={url}
      alt={t('media.photoAlt', { name: recipe.name })}
      loading="lazy"
      className={cn('h-full w-full object-cover', className)}
    />
  );
}
