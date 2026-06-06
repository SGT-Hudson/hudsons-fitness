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
 *  back to the English name upstream when es-names.json lacks the id).
 *  `primaryOverride`, when given, REPLACES the mapped primary fine codes with an
 *  operator-curated set from primary-overrides.json (the post-import muscle-tag
 *  review). Secondary codes always come from the mapper. */
export function buildRow(raw: RawExercise, nameEs: string, primaryOverride?: string[]): string {
  const primary =
    primaryOverride ??
    raw.primaryMuscles
      .map((m) => mapFineMuscle(m, raw.name))
      .filter((c): c is string => c != null);
  // Secondary is mapper-derived, then deduped against primary: a muscle is the
  // prime mover OR an assister for a given exercise, never both. Without this a
  // code promoted to primary (via override, or via two coarse codes collapsing to
  // one fine code) would sit in both arrays and double-count in the heatmap
  // (primary 1.0 + secondary 0.5). Order-preserving.
  const primarySet = new Set(primary);
  const secondary = raw.secondaryMuscles
    .map((m) => mapFineMuscle(m, raw.name))
    .filter((c): c is string => c != null && !primarySet.has(c));
  return (
    `  (${sqlText(nameEs)}, ${sqlText(raw.name)}, ` +
    `${sqlTextArray(primary)}, ${sqlTextArray(secondary)}, ` +
    `${sqlText(mapEquipment(raw.equipment))}, ${sqlText(raw.level)}, ` +
    `${sqlText(raw.mechanic)}, ${sqlText(raw.force)}, ${sqlText(raw.category)}, ` +
    `${sqlTextArray(imagePaths(raw.images))}, ${sqlText(raw.id)})`
  );
}

/** One generated VALUES tuple for the instructions BACKFILL migration:
 *  (external_id, instructions_en, instructions_es). English steps come from the
 *  SHA-pinned source (raw.instructions ?? []); Spanish from es-instructions.json
 *  (passed in as esInstructions). Both arrays go through sqlTextArray, which
 *  doubles embedded single quotes — instruction prose has apostrophes (81 EN
 *  steps; the ES translations too). Non-empty arrays are emitted UNCAST: the
 *  standalone UPDATE…FROM(values) infers each column type from the first row
 *  (matching the shipped 20260604120000 retag migration); only empty arrays
 *  carry array[]::text[]. This is SEPARATE from the seed tuple (buildRow): the
 *  seed (dated 2026-06-04) cannot reference the instruction columns, which are
 *  added by a 2026-06-06 migration that sorts after it; all instruction data is
 *  written by the 2026-06-06 backfill. */
export function buildInstructionsBackfillRow(
  raw: RawExercise,
  esInstructions: string[],
): string {
  const en = raw.instructions ?? [];
  return `  (${sqlText(raw.id)}, ${sqlTextArray(en)}, ${sqlTextArray(esInstructions)})`;
}

/** Build-time integrity for es-instructions.json (fails `exercises:build` on
 *  drift, mirroring the primary-overrides.json validation). Throws when:
 *   (a) an es-instructions key is not a known dataset external_id (stale entry);
 *   (b) for any exercise, instructions_es.length !== instructions_en.length,
 *       UNLESS both are empty (the source='system' rows + the 5 no-source rows). */
export function validateInstructions(
  raws: RawExercise[],
  esInstructions: Record<string, string[]>,
): void {
  const datasetIds = new Set(raws.map((r) => r.id));
  for (const id of Object.keys(esInstructions)) {
    if (!datasetIds.has(id)) {
      throw new Error(`es-instructions.json: unknown external_id "${id}"`);
    }
  }
  for (const raw of raws) {
    const enLen = (raw.instructions ?? []).length;
    const esLen = (esInstructions[raw.id] ?? []).length;
    if (enLen === 0 && esLen === 0) continue;
    if (enLen !== esLen) {
      throw new Error(
        `es-instructions.json: "${raw.id}" has ${esLen} ES steps but ${enLen} EN steps`,
      );
    }
  }
}

// ── low-confidence linter (§8). Returns the flags that fired for one row. ─────
const AMBIGUOUS_COARSE = new Set(['chest', 'shoulders', 'triceps', 'abdominals']);

/** True when an ambiguous coarse code fell through to its `else` default. */
function hitAmbiguousDefault(raw: RawExercise): boolean {
  const name = raw.name.toLowerCase();
  for (const coarse of raw.primaryMuscles) {
    if (!AMBIGUOUS_COARSE.has(coarse)) continue;
    if (coarse === 'chest' && !name.includes('incline') && !name.includes('decline')) return true;
    if (
      coarse === 'shoulders' &&
      !name.includes('lateral') &&
      !name.includes('rear') &&
      !name.includes('reverse') &&
      !name.includes('face pull') &&
      !name.includes('front raise') &&
      !name.includes('press') &&
      !name.includes('overhead') &&
      !name.includes('military')
    ) {
      return true;
    }
    if (
      coarse === 'triceps' &&
      !name.includes('overhead') &&
      !name.includes('skull') &&
      !name.includes('french') &&
      !name.includes('lying') &&
      !name.includes('pushdown') &&
      !name.includes('kickback') &&
      !name.includes('dip')
    ) {
      return true;
    }
    if (
      coarse === 'abdominals' &&
      !name.includes('leg raise') &&
      !name.includes('reverse') &&
      !name.includes('hanging')
    ) {
      return true;
    }
  }
  return false;
}

export function lintRow(raw: RawExercise, nameEs: string): string[] {
  const flags: string[] = [];
  const name = raw.name.toLowerCase();
  const primary = raw.primaryMuscles
    .map((m) => mapFineMuscle(m, raw.name))
    .filter((c): c is string => c != null);
  const secondary = raw.secondaryMuscles
    .map((m) => mapFineMuscle(m, raw.name))
    .filter((c): c is string => c != null);

  if (hitAmbiguousDefault(raw)) flags.push('ambiguous_default');
  if (secondary.length >= 4) flags.push('big_compound');
  if (name.includes('curl') && !primary.includes('biceps') && !secondary.includes('biceps')) {
    flags.push('curl_no_biceps');
  }
  if (primary.length === 0 && raw.category !== 'cardio' && raw.category !== 'stretching') {
    flags.push('empty_primary');
  }
  if (nameEs.trim() === '') flags.push('es_missing');
  return flags;
}

// ── SQL migration header/footer (constant columns in the outer INSERT, not the
//    per-row VALUES tuple — mirrors the whole-foods precedent to avoid VALUES
//    type-inference on null::uuid). ────────────────────────────────────────────
const MIGRATION_HEADER = `-- Project B1 step 2/2 — free-exercise-db catalog seed (873 exercises).
-- Generated by scripts/exercise-catalog/build-seed.ts from the SHA-pinned
-- scripts/exercise-catalog/exercises.json + es-names.json + primary-overrides.json
-- (instructions live in the sibling 20260606120400 backfill, also from this run).
-- DO NOT hand-edit — re-run \`pnpm exercises:build\`. Idempotent: on conflict
-- (external_id) do update. Every imported row is is_verified=false,
-- source='free-exercise-db'. primary_muscles for the 146 rows listed in
-- primary-overrides.json are operator-curated (post-import muscle-tag review),
-- not the raw coarse->fine mapper output; is_verified is flipped for the 402
-- reviewed-correct rows by a later review migration, never here.

insert into public.exercises
  (name_es, name_en, primary_muscles, secondary_muscles, equipment, level,
   mechanic, force, category, images, external_id, is_verified, source,
   created_by_user_id)
select v.name_es, v.name_en, v.primary_muscles, v.secondary_muscles, v.equipment,
       v.level, v.mechanic, v.force, v.category, v.images, v.external_id,
       false, 'free-exercise-db', null
from (values
`;

const MIGRATION_FOOTER = `
) as v(name_es, name_en, primary_muscles, secondary_muscles, equipment, level,
       mechanic, force, category, images, external_id)
-- DELIBERATELY does NOT update is_verified / source / created_by_user_id: a
-- re-run must preserve operator-flipped is_verified=true on reviewed rows. Do
-- NOT add \`is_verified = excluded.is_verified\` — that would silently un-verify
-- every reviewed row on the next build.
-- The \`where external_id is not null\` predicate is REQUIRED: idx_exercises_external_id
-- is a PARTIAL unique index, so the ON CONFLICT arbiter must repeat its predicate
-- for Postgres to infer it (else: "no unique or exclusion constraint matching").
on conflict (external_id) where external_id is not null do update set
  name_es = excluded.name_es, name_en = excluded.name_en,
  primary_muscles = excluded.primary_muscles,
  secondary_muscles = excluded.secondary_muscles,
  equipment = excluded.equipment, level = excluded.level,
  mechanic = excluded.mechanic, force = excluded.force,
  category = excluded.category, images = excluded.images;
`;

const BACKFILL_HEADER = `-- B2a step 3/3 — exercise instructions backfill.
-- Writes instructions_en/instructions_es onto already-seeded rows (envs where
-- the B1 seed ran before the instruction columns existed, e.g. production).
-- Generated by scripts/exercise-catalog/build-seed.ts from exercises.json
-- (RawExercise.instructions) + es-instructions.json — one deterministic
-- \`pnpm exercises:build\` produces this AND the regenerated seed, so they can
-- never disagree. Idempotent; guarded source='free-exercise-db' so it never
-- touches the source='system' rows or any user row. The 5 source rows with no
-- instructions get empty arrays (== the column default). DO NOT hand-edit.
-- No BEGIN/COMMIT: Supabase wraps each migration file in its own transaction.
-- Fresh resets get the same data from the regenerated 20260604120200 seed's
-- rows + this backfill (which sorts after the 20260606120300 columns migration).
-- Non-empty arrays are emitted UNCAST (Postgres infers column types from the
-- first VALUES row, matching 20260604120000_fine_muscle_taxonomy.sql); only
-- empty arrays carry ::text[].
update public.exercises e
set instructions_en = v.instructions_en,
    instructions_es = v.instructions_es
from (values
`;

const BACKFILL_FOOTER = `
) as v(external_id, instructions_en, instructions_es)
where e.external_id = v.external_id and e.source = 'free-exercise-db';
`;

// Every valid fine muscle code (mirrors public.muscles.code — kept in sync with
// the fine-taxonomy migration). Used to validate operator overrides at build time.
const FINE_CODES = new Set([
  'delt_front', 'delt_side', 'delt_rear', 'pec_upper', 'pec_lower', 'lat', 'trap',
  'rhomboids', 'lower_back', 'neck', 'biceps', 'tri_long', 'tri_lateral', 'forearms',
  'abs_upper', 'abs_lower', 'obliques', 'quads', 'hamstrings', 'glutes', 'abductors',
  'adductors', 'calves', 'tibialis', 'full_body',
]);

async function main(): Promise<void> {
  const dir = resolve(import.meta.dirname);
  const raws = JSON.parse(
    readFileSync(resolve(dir, 'exercises.json'), 'utf8'),
  ) as RawExercise[];
  const esNames = JSON.parse(
    readFileSync(resolve(dir, 'es-names.json'), 'utf8'),
  ) as Record<string, string>;
  // Post-import muscle-tag review: { "<external_id>": ["<fine_code>", ...] } that
  // REPLACES the mapper's primary for rows it tagged wrong (incl. obliques/
  // full_body/tibialis, which the coarse->fine mapper cannot emit). Validated below.
  const overrides = JSON.parse(
    readFileSync(resolve(dir, 'primary-overrides.json'), 'utf8'),
  ) as Record<string, string[]>;
  // Machine-translated Spanish steps, { "<external_id>": ["<paso>", …] }, mirrors
  // es-names.json. index-aligned to raw.instructions; validated below.
  const esInstructions = JSON.parse(
    readFileSync(resolve(dir, 'es-instructions.json'), 'utf8'),
  ) as Record<string, string[]>;

  const datasetIds = new Set(raws.map((r) => r.id));
  for (const [id, codes] of Object.entries(overrides)) {
    if (!datasetIds.has(id)) throw new Error(`primary-overrides.json: unknown external_id "${id}"`);
    if (!Array.isArray(codes) || codes.length === 0) throw new Error(`primary-overrides.json: "${id}" must list >=1 code`);
    for (const c of codes) if (!FINE_CODES.has(c)) throw new Error(`primary-overrides.json: "${id}" has unknown code "${c}"`);
  }
  validateInstructions(raws, esInstructions);

  const rows: string[] = [];
  const report: string[] = ['external_id,name_en,name_es,primary_fine,secondary_count,flags,override'];

  for (const raw of raws) {
    const nameEs = (esNames[raw.id] ?? '').trim() || raw.name; // fallback to EN, flagged below
    const flags = lintRow(raw, esNames[raw.id] ?? '');
    const override = overrides[raw.id];
    rows.push(buildRow(raw, nameEs, override));
    if (flags.length > 0) {
      const primary = raw.primaryMuscles
        .map((m) => mapFineMuscle(m, raw.name))
        .filter((c): c is string => c != null)
        .join('|');
      const csvEsc = (s: string) => `"${s.replace(/"/g, '""')}"`;
      report.push(
        [
          csvEsc(raw.id),
          csvEsc(raw.name),
          csvEsc(nameEs),
          csvEsc(primary),
          String(raw.secondaryMuscles.length),
          csvEsc(flags.join('|')),
          csvEsc((override ?? []).join('|')),
        ].join(','),
      );
    }
  }

  const backfillRows = raws.map((raw) =>
    buildInstructionsBackfillRow(raw, esInstructions[raw.id] ?? []),
  );
  const backfillSql =
    BACKFILL_HEADER + backfillRows.join(',\n') + BACKFILL_FOOTER;
  const outBackfill = resolve(
    dir,
    '../../supabase/migrations/20260606120400_b2a_instructions_backfill.sql',
  );
  writeFileSync(outBackfill, backfillSql);
  console.log(`wrote ${backfillRows.length} instruction backfill rows -> ${outBackfill}`);

  const sql = MIGRATION_HEADER + rows.join(',\n') + MIGRATION_FOOTER;
  const outSql = resolve(dir, '../../supabase/migrations/20260604120200_b1_catalog_seed.sql');
  writeFileSync(outSql, sql);
  const outCsv = resolve(dir, 'ingest-report.csv');
  writeFileSync(outCsv, report.join('\n') + '\n');
  console.log(`wrote ${rows.length} rows (${Object.keys(overrides).length} primary overrides) -> ${outSql}`);
  console.log(`flagged ${report.length - 1} low-confidence rows -> ${outCsv}`);
}

// Run main() only when invoked directly, never on import (keeps the test pure).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
