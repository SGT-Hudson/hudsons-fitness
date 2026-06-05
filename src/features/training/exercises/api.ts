import { supabase } from '@/lib/supabase';
import { DOUBLE_PROGRESSION_DEFAULTS } from '@/core/training';
import { MUSCLE_CODES, MUSCLES } from '@/core/muscles';
import type { Tables, TablesInsert } from '@/types/database';

export type Exercise = Tables<'exercises'>;

export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'kettlebell'
  | 'ez_curl_bar'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'band'
  | 'medicine_ball'
  | 'exercise_ball'
  | 'foam_roller'
  | 'other';

export const EQUIPMENT_VALUES: Equipment[] = [
  'barbell',
  'dumbbell',
  'kettlebell',
  'ez_curl_bar',
  'machine',
  'cable',
  'bodyweight',
  'band',
  'medicine_ball',
  'exercise_ball',
  'foam_roller',
  'other',
];

// Fine taxonomy (Project A). full_body is a valid PRIMARY but never a secondary.
export type PrimaryMuscle = (typeof MUSCLE_CODES)[number] | 'full_body';
export const PRIMARY_MUSCLE_VALUES: PrimaryMuscle[] = [
  ...MUSCLES.filter((m) => !m.isFullBody).map((m) => m.code),
  'full_body',
];

/** Secondary movers — the 22 fine codes (full_body is not a valid secondary). */
export type SecondaryMuscle = Exclude<PrimaryMuscle, 'full_body'>;

export const SECONDARY_MUSCLE_VALUES: SecondaryMuscle[] = MUSCLE_CODES.map((c) => c);

export interface ExerciseCreateInput {
  name_es: string;
  name_en: string | null;
  primary_muscles: PrimaryMuscle[];
  secondary_muscles: SecondaryMuscle[];
  equipment: Equipment | null;
  default_increment_kg: number | null;
}

export interface ExerciseSearchOptions {
  limit?: number;
  muscle?: PrimaryMuscle | null; // hard AND filter from the dropdown
  textMuscles?: PrimaryMuscle[]; // muscle codes the typed text matched (OR'd with name)
}

/**
 * Locale-aware pool search — queries both `name_es` and `name_en` via
 * trigram (single OR clause, no per-locale code path). Display is at
 * render: the picker chooses the user's locale and falls back to the
 * other column when the preferred one is null.
 *
 * Verified rows surface first, then alphabetical on `name_es`.
 *
 * `query` is sanitized of PostgREST OR-grammar metacharacters (`%_,`)
 * before composition — otherwise a user typing `a,b` would split into
 * two filter terms.
 *
 * `opts.muscle` adds a hard AND contains-on-array filter (dropdown selection).
 * `opts.textMuscles` adds per-code `primary_muscles.cs.{<code>}` OR terms
 * so that typing a muscle name in the text box surfaces matching exercises.
 */
export async function searchExercises(
  query: string,
  opts: ExerciseSearchOptions = {},
): Promise<Exercise[]> {
  const { limit = 20, muscle = null, textMuscles = [] } = opts;
  const trimmed = query.trim();
  const safe = trimmed.replace(/[%_,]/g, '');

  let builder = supabase.from('exercises').select('*');

  if (muscle) {
    builder = builder.contains('primary_muscles', [muscle]);
  }

  const terms: string[] = [];
  if (safe !== '') {
    terms.push(`name_es.ilike.%${safe}%`, `name_en.ilike.%${safe}%`);
  }
  for (const code of textMuscles) {
    terms.push(`primary_muscles.cs.{${code}}`);
  }

  if (terms.length > 0) {
    builder = builder.or(terms.join(','));
  }

  const { data, error } = await builder
    .order('is_verified', { ascending: false })
    .order('name_es')
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

/**
 * Auto-suggest a `default_increment_kg` from equipment. Mirrors the core
 * `DOUBLE_PROGRESSION_DEFAULTS.incrementByEquipment` map so the rule
 * engine and the create-form agree on what "the right next jump" is.
 */
export function suggestIncrementForEquipment(eq: Equipment | null): number {
  if (eq === null) return DOUBLE_PROGRESSION_DEFAULTS.fallbackIncrementKg;
  return (
    DOUBLE_PROGRESSION_DEFAULTS.incrementByEquipment[eq] ??
    DOUBLE_PROGRESSION_DEFAULTS.fallbackIncrementKg
  );
}

export async function createExercise(
  userId: string,
  input: ExerciseCreateInput,
): Promise<Exercise> {
  const payload: TablesInsert<'exercises'> = {
    created_by_user_id: userId,
    source: 'manual',
    name_es: input.name_es,
    name_en: input.name_en,
    primary_muscles: input.primary_muscles,
    secondary_muscles: input.secondary_muscles,
    equipment: input.equipment,
    default_increment_kg: input.default_increment_kg,
  };
  const { data, error } = await supabase
    .from('exercises')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Display name picker. Falls back across locales when the preferred
 * column is null — matches the post-R-01 ingredient pool's bilingual
 * search/display split (§0.11).
 */
export function exerciseDisplayName(ex: Exercise, lang: 'es' | 'en'): string {
  if (lang === 'es') return ex.name_es;
  return ex.name_en ?? ex.name_es;
}
