import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Mirrors build-seed.ts FINE_CODES (25) and public.muscles.code. Any corrected
// code outside this set fails reconcile BEFORE it can reach the override map.
export const FINE_CODES = new Set([
  'delt_front', 'delt_side', 'delt_rear', 'pec_upper', 'pec_lower', 'lat', 'trap',
  'rhomboids', 'lower_back', 'neck', 'biceps', 'tri_long', 'tri_lateral', 'forearms',
  'abs_upper', 'abs_lower', 'obliques', 'quads', 'hamstrings', 'glutes', 'abductors',
  'adductors', 'calves', 'tibialis', 'full_body',
]);

export interface Verdict {
  external_id: string;
  tier: 'deep' | 'bulk';
  current_fine: string[];
  decision: 'confirm' | 'correct' | 'hold';
  corrected_fine?: string[];
  lens_votes?: string[];
  rationale?: string;
}

export interface ReconcileResult {
  confirmed: Verdict[];
  corrections: Verdict[]; // each has a valid, non-empty, non-no-op corrected_fine
  held: Verdict[];
  verifiedIds: Set<string>; // confirmed UNION corrected — the is_verified=true set
}

function sameCodes(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((x, i) => x === sb[i]);
}

/** Partition + validate verdicts. Throws on any inconsistency so a bad judge
 *  result can never silently corrupt the override map or migration. */
export function reconcile(
  verdicts: Verdict[],
  reviewIds: Set<string>,
  existingOverrideIds: Set<string>,
): ReconcileResult {
  const seen = new Set<string>();
  for (const v of verdicts) {
    if (!reviewIds.has(v.external_id)) {
      throw new Error(`verdict "${v.external_id}" is not in the 469 review set`);
    }
    if (seen.has(v.external_id)) {
      throw new Error(`duplicate verdict for "${v.external_id}"`);
    }
    seen.add(v.external_id);
  }
  for (const id of reviewIds) {
    if (!seen.has(id)) throw new Error(`review row "${id}" is missing a verdict`);
  }

  const confirmed: Verdict[] = [];
  const corrections: Verdict[] = [];
  const held: Verdict[] = [];

  for (const v of verdicts) {
    if (v.decision === 'confirm') {
      confirmed.push(v);
    } else if (v.decision === 'hold') {
      held.push(v);
    } else if (v.decision === 'correct') {
      if (!v.corrected_fine) {
        throw new Error(`"${v.external_id}" decision=correct must list corrected_fine`);
      }
      if (v.corrected_fine.length === 0) {
        throw new Error(`"${v.external_id}" corrected_fine must have at least one code`);
      }
      for (const c of v.corrected_fine) {
        if (!FINE_CODES.has(c)) {
          throw new Error(`"${v.external_id}" has unknown fine code "${c}"`);
        }
      }
      if (sameCodes(v.corrected_fine, v.current_fine)) {
        throw new Error(
          `"${v.external_id}" no-op correction — corrected_fine equals current_fine; use confirm`,
        );
      }
      if (existingOverrideIds.has(v.external_id)) {
        throw new Error(
          `"${v.external_id}" is already in primary-overrides (404 set) — out of scope`,
        );
      }
      corrections.push(v);
    } else {
      throw new Error(`"${v.external_id}" has invalid decision "${v.decision}"`);
    }
  }

  const verifiedIds = new Set<string>([
    ...confirmed.map((v) => v.external_id),
    ...corrections.map((v) => v.external_id),
  ]);

  return { confirmed, corrections, held, verifiedIds };
}

async function main(): Promise<void> {
  const dir = resolve(import.meta.dirname);
  const verdicts = JSON.parse(
    readFileSync(resolve(dir, 'review-verdicts.json'), 'utf8'),
  ) as Verdict[];
  const reviewRows = JSON.parse(
    readFileSync(resolve(dir, 'review-input.json'), 'utf8'),
  ) as Array<{ external_id: string; mapped_fine_primary: string[] }>;
  const overrides = JSON.parse(
    readFileSync(resolve(dir, 'primary-overrides.json'), 'utf8'),
  ) as Record<string, string[]>;

  const reviewIds = new Set(reviewRows.map((r) => r.external_id));
  const existing = new Set(Object.keys(overrides));

  // Cross-check each verdict's current_fine against the review-input mapper output
  // so a stale/mis-copied current_fine can't slip a wrong no-op judgment through.
  const mapByid = new Map(reviewRows.map((r) => [r.external_id, r.mapped_fine_primary]));
  for (const v of verdicts) {
    const m = mapByid.get(v.external_id);
    if (m && !sameCodes(m, v.current_fine)) {
      throw new Error(
        `"${v.external_id}" current_fine ${JSON.stringify(v.current_fine)} != review-input ${JSON.stringify(m)}`,
      );
    }
  }

  const r = reconcile(verdicts, reviewIds, existing);

  const out = resolve(dir, 'review-output.json');
  writeFileSync(
    out,
    JSON.stringify(
      {
        confirmed: r.confirmed.map((v) => v.external_id).sort(),
        corrections: Object.fromEntries(
          r.corrections
            .map((v) => [v.external_id, v.corrected_fine!] as const)
            .sort(([a], [b]) => a.localeCompare(b)),
        ),
        held: r.held.map((v) => v.external_id).sort(),
        verifiedCount: r.verifiedIds.size,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `reconciled 469: confirmed ${r.confirmed.length}, ` +
      `corrected ${r.corrections.length}, held ${r.held.length}, ` +
      `verified-total-this-pass ${r.verifiedIds.size} -> ${out}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
