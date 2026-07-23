import { codesInGroup, type MuscleGroup } from '@/core/muscles';
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

const PUSH_CODES = ['pec_upper', 'pec_lower', 'delt_front', 'delt_side', 'tri_long', 'tri_lateral'];
const PULL_CODES = ['lat', 'trap', 'rhomboids', 'biceps', 'forearms'];
const UPPER_CODES = [
  ...codesInGroup('shoulders'), ...codesInGroup('chest'),
  ...codesInGroup('back'), ...codesInGroup('arms'),
];

/**
 * Curated bilingual lay-term → muscle-code map (R-31). The muscle labels
 * already cover the canonical anatomical names, so this table only carries
 * what a label lookup misses: gym slang, English terms typed while the UI is
 * in Spanish (and vice versa), and movement patterns ("push"/"tirón") that
 * are not muscles at all.
 *
 * `terms` are stored pre-normalized (lowercase, no diacritics) — the test
 * asserts it, so matching never has to normalize the table at runtime.
 */
export const MUSCLE_SEARCH_ALIASES: ReadonlyArray<{
  terms: readonly string[];
  codes: readonly string[];
}> = [
  { terms: ['abs', 'abdominales', 'abdomen', 'tableta', 'six pack', 'sixpack', 'barriga'],
    codes: ['abs_upper', 'abs_lower'] },
  { terms: ['core', 'cintura', 'oblicuos', 'obliques'], codes: ['abs_upper', 'abs_lower', 'obliques'] },
  { terms: ['pecho', 'pectorales', 'pecs', 'chest', 'pectos'], codes: ['pec_upper', 'pec_lower'] },
  { terms: ['dorsales', 'dorsal', 'lats', 'jalon', 'jalones', 'espalda alta'],
    codes: ['lat', 'rhomboids'] },
  { terms: ['trapecios', 'traps', 'trapas'], codes: ['trap'] },
  { terms: ['lumbares', 'lumbar', 'zona lumbar', 'low back', 'espalda baja'], codes: ['lower_back'] },
  { terms: ['hombros', 'deltoides', 'delts', 'shoulders', 'deltos'],
    codes: ['delt_front', 'delt_side', 'delt_rear'] },
  { terms: ['bicis', 'bis', 'biceps', 'brazo', 'brazos', 'arms'],
    codes: ['biceps', 'tri_long', 'tri_lateral'] },
  { terms: ['tris', 'triceps', 'tricep'], codes: ['tri_long', 'tri_lateral'] },
  { terms: ['antebrazos', 'forearms', 'agarre', 'grip'], codes: ['forearms'] },
  { terms: ['cuadris', 'cuads', 'quads', 'cuadriceps'], codes: ['quads'] },
  { terms: ['isquios', 'isquiotibiales', 'femorales', 'hamstrings', 'hams'], codes: ['hamstrings'] },
  { terms: ['gluteos', 'gluteo', 'culo', 'cadera', 'glutes', 'butt'], codes: ['glutes'] },
  { terms: ['gemelos', 'pantorrillas', 'calves', 'soleo'], codes: ['calves'] },
  { terms: ['aductores', 'adductors', 'ingle', 'ingles'], codes: ['adductors'] },
  { terms: ['abductores', 'abductors'], codes: ['abductors'] },
  { terms: ['cuello', 'neck'], codes: ['neck'] },
  { terms: ['piernas', 'pierna', 'legs', 'tren inferior', 'lower body', 'pata', 'patas'],
    codes: codesInGroup('legs') },
  { terms: ['tren superior', 'upper body', 'torso'], codes: UPPER_CODES },
  { terms: ['empuje', 'empujar', 'push'], codes: PUSH_CODES },
  { terms: ['tiron', 'tirones', 'jalar', 'pull'], codes: PULL_CODES },
  { terms: ['cuerpo completo', 'full body', 'fullbody', 'todo el cuerpo'], codes: ['full_body'] },
];

/**
 * Muscle codes reached by the curated lay-term map. A term matches when the
 * query is a substring of it ("gemel" → "gemelos"), or — for terms long
 * enough not to be noisy — when the term is a substring of the query
 * ("piernas de acero" → "piernas"). Queries shorter than 2 chars are ignored,
 * mirroring `musclesMatchingQuery`.
 */
export function aliasMusclesForQuery(query: string): PrimaryMuscle[] {
  const q = normalizeText(query);
  if (q.length < 2) return [];
  const out = new Set<string>();
  for (const { terms, codes } of MUSCLE_SEARCH_ALIASES) {
    const hit = terms.some((term) => term.includes(q) || (term.length >= 4 && q.includes(term)));
    if (hit) for (const code of codes) out.add(code);
  }
  return [...out] as PrimaryMuscle[];
}

/**
 * Muscle codes the typed text should surface: fine-muscle labels, whole
 * group names ("piernas" → every leg code) and the lay-term aliases, unioned
 * and de-duplicated. This is what both the browse page and the picker feed
 * into `textMuscles`.
 */
export function muscleCodesForQuery(
  query: string,
  labelByCode: Record<string, string>,
  groupLabelByKey: Record<string, string>,
): PrimaryMuscle[] {
  const q = normalizeText(query);
  const out = new Set<string>(musclesMatchingQuery(query, labelByCode));
  if (q.length >= 2) {
    for (const [group, label] of Object.entries(groupLabelByKey)) {
      if (normalizeText(label).includes(q)) {
        for (const code of codesInGroup(group as MuscleGroup)) out.add(code);
      }
    }
  }
  for (const code of aliasMusclesForQuery(query)) out.add(code);
  return [...out] as PrimaryMuscle[];
}
