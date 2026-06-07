import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mapFineMuscle, type RawExercise } from './build-seed';

// Deep-tier partition keys are RAW dataset coarse strings (primaryMuscles[0])
// and RAW dataset category strings — NOT fine codes. See design §3a.
export const COARSE_DEEP = new Set(['chest', 'shoulders', 'triceps', 'abdominals']);
export const CAT_DEEP = new Set(['olympic weightlifting', 'plyometrics', 'strongman']);

export interface ReviewRow {
  external_id: string;
  name_en: string;
  name_es: string;
  category: string;
  equipment: string | null;
  force: string | null;
  mechanic: string | null;
  instructions: string[]; // raw movement description — judge context, not a slug
  coarse_primary: string;
  mapped_fine_primary: string[];
  tier: 'deep' | 'bulk';
  deep_reason: string; // '' for bulk; e.g. 'coarse:shoulders | category:plyometrics'
}

/** Parse the flagged external_ids (col1) from ingest-report.csv. The id is the
 *  first quoted field on each data line; capture it with a start-anchored regex
 *  BEFORE any embedded comma (e.g. "Rowing, Stationary") can shift columns.
 *  CSV-internal quotes are escaped by doubling ("") — un-double them. (All real
 *  ids are underscore slugs; the doubling/comma handling is defensive.) */
export function parseFlaggedIds(csv: string): Set<string> {
  return new Set(
    csv
      .split('\n')
      .slice(1) // drop header
      .filter((l) => l.trim() !== '')
      .map((l) => {
        const m = /^"((?:[^"]|"")*)"/.exec(l);
        if (!m) throw new Error(`ingest-report.csv: unparseable line: ${l.slice(0, 40)}`);
        return m[1].replace(/""/g, '"');
      }),
  );
}

/** Build the 469 review rows = exercises.json rows whose id is NOT flagged. */
export function buildReviewRows(
  raws: RawExercise[],
  esNames: Record<string, string>,
  flagged: Set<string>,
): ReviewRow[] {
  const reviewable = raws.filter((r) => !flagged.has(r.id));
  return reviewable.map((raw) => {
    const coarse = raw.primaryMuscles[0] ?? '';
    const isCoarseDeep = COARSE_DEEP.has(coarse);
    const isCatDeep = CAT_DEEP.has(raw.category);
    const reasons: string[] = [];
    if (isCoarseDeep) reasons.push(`coarse:${coarse}`);
    if (isCatDeep) reasons.push(`category:${raw.category}`);
    const mapped = raw.primaryMuscles
      .map((m) => mapFineMuscle(m, raw.name))
      .filter((c): c is string => c != null);
    return {
      external_id: raw.id,
      name_en: raw.name,
      name_es: (esNames[raw.id] ?? '').trim() || raw.name,
      category: raw.category,
      equipment: raw.equipment,
      force: raw.force ?? null,
      mechanic: raw.mechanic ?? null,
      instructions: Array.isArray(raw.instructions) ? raw.instructions : [],
      coarse_primary: coarse,
      mapped_fine_primary: mapped,
      tier: isCoarseDeep || isCatDeep ? 'deep' : 'bulk',
      deep_reason: reasons.join(' | '),
    };
  });
}

async function main(): Promise<void> {
  const dir = resolve(import.meta.dirname);
  const raws = JSON.parse(
    readFileSync(resolve(dir, 'exercises.json'), 'utf8'),
  ) as RawExercise[];
  const esNames = JSON.parse(
    readFileSync(resolve(dir, 'es-names.json'), 'utf8'),
  ) as Record<string, string>;
  const csv = readFileSync(resolve(dir, 'ingest-report.csv'), 'utf8');

  const flagged = parseFlaggedIds(csv);
  const rows = buildReviewRows(raws, esNames, flagged);

  // Regression guards — fail the build loudly if the partition drifts.
  if (rows.length !== 469) {
    throw new Error(`expected 469 reviewable rows, got ${rows.length}`);
  }
  const deep = rows.filter((r) => r.tier === 'deep').length;
  const bulk = rows.filter((r) => r.tier === 'bulk').length;
  if (deep !== 144) throw new Error(`expected 144 deep rows, got ${deep}`);
  if (bulk !== 325) throw new Error(`expected 325 bulk rows, got ${bulk}`);

  const out = resolve(dir, 'review-input.json');
  writeFileSync(out, JSON.stringify(rows, null, 2) + '\n');
  console.log(`wrote ${rows.length} review rows (deep ${deep}, bulk ${bulk}) -> ${out}`);
}

// Run main() only when invoked directly, never on import (keeps the test pure).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
