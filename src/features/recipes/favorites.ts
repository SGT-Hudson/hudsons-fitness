// Pure favorites helpers for the recipe list. Persistence is localStorage
// (client UI preference, same convention as the Recetas view toggle / the
// shopping checklist) — no schema. These are the deterministic, testable
// parts; the component owns the storage read/write.

/** Favorites first (original order kept), then the rest (original order). Stable. */
export function partitionFavorites<T extends { id: string }>(
  items: T[],
  favoriteIds: Set<string>,
): T[] {
  const fav: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    if (favoriteIds.has(item.id)) fav.push(item);
    else rest.push(item);
  }
  return [...fav, ...rest];
}

/** Immutable toggle of an id in a Set (returns a new Set). */
export function toggleFavorite(ids: Set<string>, id: string): Set<string> {
  const next = new Set(ids);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
