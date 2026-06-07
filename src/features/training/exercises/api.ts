import { supabase } from '@/lib/supabase';
import { DOUBLE_PROGRESSION_DEFAULTS } from '@/core/training';
import { MUSCLE_CODES, MUSCLES, codesInGroup, MUSCLE_GROUPS } from '@/core/muscles';
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

/** Raw `category` strings as stored at ingest (free-exercise-db, un-mapped). */
export const CATEGORY_VALUES = [
  'strength', 'stretching', 'plyometrics', 'powerlifting',
  'strongman', 'olympic weightlifting', 'cardio',
] as const;
export type Category = (typeof CATEGORY_VALUES)[number];

/** Raw `level` strings as stored at ingest. */
export const LEVEL_VALUES = ['beginner', 'intermediate', 'expert'] as const;
export type Level = (typeof LEVEL_VALUES)[number];

/** i18n-key-safe slug for a category (the raw value has a space). */
export function categorySlug(value: string): string {
  return value.replace(/\s+/g, '_');
}

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
  groupMuscles?: PrimaryMuscle[]; // a whole group's fine codes — AND overlap filter
}

export interface ExerciseFilterOptions {
  query?: string;
  category?: string | null;
  equipment?: Equipment | null;
  level?: string | null;
  muscle?: PrimaryMuscle | null;     // hard AND contains
  groupMuscles?: PrimaryMuscle[];    // AND overlap
  textMuscles?: PrimaryMuscle[];     // OR'd with name terms
}

/**
 * Apply the shared WHERE + ORDER for every exercise pool query. Returns the
 * builder for the caller to finish with `.limit()` or `.range()`. The PostgREST
 * array operators here escape the typecheck — verified on Tier-3 db-test CI.
 */
function buildExerciseQuery<B>(builder: B, opts: ExerciseFilterOptions): B {
  const {
    query = '', category = null, equipment = null, level = null,
    muscle = null, groupMuscles = [], textMuscles = [],
  } = opts;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let b: any = builder;
  if (category) b = b.eq('category', category);
  if (equipment) b = b.eq('equipment', equipment);
  if (level) b = b.eq('level', level);
  if (muscle) b = b.contains('primary_muscles', [muscle]);
  if (groupMuscles.length > 0) b = b.overlaps('primary_muscles', groupMuscles);

  const safe = query.trim().replace(/[%_,]/g, '');
  const terms: string[] = [];
  if (safe !== '') terms.push(`name_es.ilike.%${safe}%`, `name_en.ilike.%${safe}%`);
  for (const code of textMuscles) terms.push(`primary_muscles.cs.{${code}}`);
  if (terms.length > 0) b = b.or(terms.join(','));

  return b.order('is_verified', { ascending: false }).order('name_es') as B;
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
  const { limit = 20, muscle = null, textMuscles = [], groupMuscles = [] } = opts;
  const builder = buildExerciseQuery(supabase.from('exercises').select('*'), {
    query, muscle, textMuscles, groupMuscles,
  });
  const { data, error } = await builder.limit(limit);
  if (error) throw error;
  return data ?? [];
}

export interface ExerciseBrowseParams {
  query: string;
  category: string | null;
  equipment: Equipment | null;
  level: string | null;
  /** picker convention: '' | <fineCode> | `group:<group>` */
  muscleValue: string;
  textMuscles: PrimaryMuscle[];
  page: number;
  pageSize: number;
}

/** Server-side paged + filtered pool query for the browse page. */
export async function searchExercisesPaged(
  params: ExerciseBrowseParams,
): Promise<{ rows: Exercise[]; total: number }> {
  const { query, category, equipment, level, muscleValue, textMuscles, page, pageSize } = params;

  const isGroup = muscleValue.startsWith('group:');
  const groupKey = isGroup ? muscleValue.slice('group:'.length) : null;
  const muscle = !isGroup && muscleValue !== '' ? (muscleValue as PrimaryMuscle) : null;
  const groupMuscles = groupKey
    ? (codesInGroup(groupKey as (typeof MUSCLE_GROUPS)[number]) as PrimaryMuscle[])
    : [];

  const builder = buildExerciseQuery(
    supabase.from('exercises').select('*', { count: 'exact' }),
    { query, category, equipment, level, muscle, groupMuscles, textMuscles },
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, count, error } = await builder.range(from, to);
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
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

/**
 * Instruction-steps picker. Mirrors `exerciseDisplayName`'s fallback: returns the
 * stored steps for the requested language, falling back to the other language when
 * the chosen array is empty (e.g. an EN-only or ES-only row), and `[]` when both
 * are empty (the source='system' rows + the 5 no-source rows). The ES steps are
 * the machine-translated B2a content — this is a stored-array pick, NOT a runtime
 * translation.
 */
export function exerciseInstructions(ex: Exercise, lang: 'es' | 'en'): string[] {
  const preferred = lang === 'es' ? ex.instructions_es : ex.instructions_en;
  if (preferred.length > 0) return preferred;
  return lang === 'es' ? ex.instructions_en : ex.instructions_es;
}

/** Fetch a single exercise by id (the runner's id-only detail path). Uses
 *  `select('*')` so it carries instructions + images with no fragile column list. */
export async function getExercise(id: string): Promise<Exercise> {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}
