import { supabase } from '@/lib/supabase';
import { DOUBLE_PROGRESSION_DEFAULTS } from '@/core/training';
import type { Tables, TablesInsert } from '@/types/database';

export type Exercise = Tables<'exercises'>;

export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'kettlebell'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'band'
  | 'other';

export const EQUIPMENT_VALUES: Equipment[] = [
  'barbell',
  'dumbbell',
  'kettlebell',
  'machine',
  'cable',
  'bodyweight',
  'band',
  'other',
];

export type PrimaryMuscle =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'biceps'
  | 'triceps'
  | 'core'
  | 'forearms'
  | 'full_body';

export const PRIMARY_MUSCLE_VALUES: PrimaryMuscle[] = [
  'chest',
  'back',
  'shoulders',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'biceps',
  'triceps',
  'core',
  'forearms',
  'full_body',
];

export interface ExerciseCreateInput {
  name_es: string;
  name_en: string | null;
  primary_muscle: PrimaryMuscle | null;
  equipment: Equipment | null;
  default_increment_kg: number | null;
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
 */
export async function searchExercises(query: string, limit = 20): Promise<Exercise[]> {
  const trimmed = query.trim();
  if (trimmed === '') {
    const { data, error } = await supabase
      .from('exercises')
      .select('*')
      .order('is_verified', { ascending: false })
      .order('name_es')
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  }
  const safe = trimmed.replace(/[%_,]/g, '');
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .or(`name_es.ilike.%${safe}%,name_en.ilike.%${safe}%`)
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
    primary_muscle: input.primary_muscle,
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
