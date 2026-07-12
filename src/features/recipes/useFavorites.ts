import { useCallback, useEffect, useState } from 'react';
import { toggleFavorite } from './favorites';

/** Unchanged since the pre-redesign list — favourites survive the redesign. */
export const RECIPE_FAVORITES_KEY = 'hudsons-fitness-recetas-favorites';

function loadFavorites(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(RECIPE_FAVORITES_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export interface RecipeFavorites {
  /** The favourite recipe ids. Pass straight to `partitionFavorites`. */
  favorites: Set<string>;
  isFavorite: (recipeId: string) => boolean;
  toggle: (recipeId: string) => void;
}

/**
 * Device-local recipe favourites (localStorage, no schema — D-*: a client UI
 * preference, same convention as the shopping checklist). Lives outside
 * `hooks.ts` on purpose: that module imports the supabase client, and the read
 * view / the list page must be testable without one.
 *
 * The pure set helpers stay in `favorites.ts` (`toggleFavorite`,
 * `partitionFavorites` + their tests); this hook is only the storage edge.
 * Two mounted instances do not sync live — they are separate pages, and each
 * reads fresh storage on mount.
 */
export function useRecipeFavorites(): RecipeFavorites {
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);

  useEffect(() => {
    window.localStorage.setItem(RECIPE_FAVORITES_KEY, JSON.stringify([...favorites]));
  }, [favorites]);

  const toggle = useCallback((recipeId: string) => {
    setFavorites((prev) => toggleFavorite(prev, recipeId));
  }, []);

  const isFavorite = useCallback((recipeId: string) => favorites.has(recipeId), [favorites]);

  return { favorites, isFavorite, toggle };
}
