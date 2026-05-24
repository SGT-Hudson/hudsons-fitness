import type { PrimaryMuscle } from './api';

/** Lowercase + strip diacritics for accent-insensitive matching. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Muscle codes whose localized label matches the query (accent-insensitive
 * substring). Returns [] for queries shorter than 2 chars (avoids noise).
 * `labelByCode` maps each muscle code to its label in the active locale.
 */
export function musclesMatchingQuery(
  query: string,
  labelByCode: Record<string, string>,
): PrimaryMuscle[] {
  const q = normalizeText(query);
  if (q.length < 2) return [];
  return (Object.keys(labelByCode) as PrimaryMuscle[]).filter((code) =>
    normalizeText(labelByCode[code]).includes(q),
  );
}
