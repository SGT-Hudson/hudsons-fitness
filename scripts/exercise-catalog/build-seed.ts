import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// free-exercise-db pinned at b0eed061e1c832b3ed815fbaa4b45b3cdc14df49 (Unlicense).
// Images served via jsDelivr; only the relative path is stored — the URL helper
// (B2) builds the full CDN URL:
//   https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@<PINNED_SHA>/exercises/<path>
export const PINNED_SHA = 'b0eed061e1c832b3ed815fbaa4b45b3cdc14df49';

export interface RawExercise {
  id: string;
  name: string;
  force: string | null;
  level: string;
  mechanic: string | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  category: string;
  images?: string[];
  instructions?: string[]; // present in source, deferred to B2 — not imported in B1
}

// ── equipment map (§5): dataset string -> our snake_case value, 1:1 lossless ──
const EQUIPMENT_MAP: Record<string, string> = {
  'body only': 'bodyweight',
  bands: 'band',
  kettlebells: 'kettlebell',
  'e-z curl bar': 'ez_curl_bar',
  'medicine ball': 'medicine_ball',
  'exercise ball': 'exercise_ball',
  'foam roll': 'foam_roller',
  barbell: 'barbell',
  dumbbell: 'dumbbell',
  cable: 'cable',
  machine: 'machine',
  other: 'other',
};

export function mapEquipment(eq: string | null): string | null {
  if (eq == null) return null;
  return EQUIPMENT_MAP[eq] ?? null;
}

// ── 1:1 coarse -> fine maps (§7) ──────────────────────────────────────────────
const ONE_TO_ONE: Record<string, string> = {
  abductors: 'abductors',
  adductors: 'adductors',
  biceps: 'biceps',
  calves: 'calves',
  forearms: 'forearms',
  glutes: 'glutes',
  hamstrings: 'hamstrings',
  lats: 'lat',
  'lower back': 'lower_back',
  'middle back': 'rhomboids',
  neck: 'neck',
  quadriceps: 'quads',
  traps: 'trap',
};

// ── the four ambiguous coarse codes — disambiguate by name keyword (§7) ───────
// NOTE: keyword precedence follows the §7 rule order. Because checks are ordered,
// a confident-but-wrong hit is possible (e.g. a name containing both "lateral"
// and "rear" returns delt_side — "lateral" is tested first per §7). Such rows do
// NOT trip the linter's `ambiguous_default` flag (they hit a branch, not the
// else-default), so they ship is_verified=false but unflagged. This is the
// accepted §7/§8 approximation; see the README caveat.
function mapChest(name: string): string {
  if (name.includes('incline')) return 'pec_upper';
  if (name.includes('decline')) return 'pec_lower';
  return 'pec_lower';
}
function mapShoulders(name: string): string {
  if (name.includes('lateral')) return 'delt_side';
  if (name.includes('rear') || name.includes('reverse') || name.includes('face pull')) {
    return 'delt_rear';
  }
  if (
    name.includes('front raise') ||
    name.includes('press') ||
    name.includes('overhead') ||
    name.includes('military')
  ) {
    return 'delt_front';
  }
  return 'delt_side';
}
function mapTriceps(name: string): string {
  if (
    name.includes('overhead') ||
    name.includes('skull') ||
    name.includes('french') ||
    name.includes('lying')
  ) {
    return 'tri_long';
  }
  if (name.includes('pushdown') || name.includes('kickback') || name.includes('dip')) {
    return 'tri_lateral';
  }
  return 'tri_lateral';
}
function mapAbdominals(name: string): string {
  if (name.includes('leg raise') || name.includes('reverse') || name.includes('hanging')) {
    return 'abs_lower';
  }
  return 'abs_upper';
}

/** Maps one dataset coarse muscle to our fine code, using the exercise name for
 *  the four ambiguous codes. Returns null for an unrecognized coarse code. */
export function mapFineMuscle(coarse: string, exerciseName: string): string | null {
  const name = exerciseName.toLowerCase();
  switch (coarse) {
    case 'chest':
      return mapChest(name);
    case 'shoulders':
      return mapShoulders(name);
    case 'triceps':
      return mapTriceps(name);
    case 'abdominals':
      return mapAbdominals(name);
    default:
      return ONE_TO_ONE[coarse] ?? null;
  }
}

/** Image relative paths pass through verbatim (host decoupled — §6). */
export function imagePaths(images: string[] | undefined): string[] {
  return images ?? [];
}

// ── SQL emission helpers ──────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/'/g, "''");
const sqlText = (s: string | null) => (s == null ? 'null' : `'${esc(s)}'`);
const sqlTextArray = (xs: string[]) =>
  xs.length === 0 ? `array[]::text[]` : `array[${xs.map((x) => `'${esc(x)}'`).join(',')}]`;

/** One generated VALUES tuple. Constant columns (is_verified/source/created_by)
 *  live in the migration footer's SELECT-less VALUES list cast — see Task 7 —
 *  so they are NOT part of this tuple. `nameEs` is the reviewed ES name (falls
 *  back to the English name upstream when es-names.json lacks the id). */
export function buildRow(raw: RawExercise, nameEs: string): string {
  const primary = raw.primaryMuscles
    .map((m) => mapFineMuscle(m, raw.name))
    .filter((c): c is string => c != null);
  const secondary = raw.secondaryMuscles
    .map((m) => mapFineMuscle(m, raw.name))
    .filter((c): c is string => c != null);
  return (
    `  (${sqlText(nameEs)}, ${sqlText(raw.name)}, ` +
    `${sqlTextArray(primary)}, ${sqlTextArray(secondary)}, ` +
    `${sqlText(mapEquipment(raw.equipment))}, ${sqlText(raw.level)}, ` +
    `${sqlText(raw.mechanic)}, ${sqlText(raw.force)}, ${sqlText(raw.category)}, ` +
    `${sqlTextArray(imagePaths(raw.images))}, ${sqlText(raw.id)})`
  );
}
