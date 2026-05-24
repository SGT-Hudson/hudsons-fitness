import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { FoodEntry } from './build-seed';

const FDC = 'https://api.nal.usda.gov/fdc/v1';

type Candidate = { fdcId: number; description: string };

// Top-N SR Legacy candidates for a query. The #1 hit is auto-assigned, but the
// alternatives are logged so a wrong #1 (FDC relevance can mis-rank, e.g.
// "almonds" → "Abiyuch") is easy to spot and pin by hand.
async function searchCandidates(query: string, key: string, n = 5): Promise<Candidate[]> {
  const res = await fetch(`${FDC}/foods/search?api_key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, dataType: ['SR Legacy'], pageSize: n }),
  });
  if (!res.ok) throw new Error(`FDC search failed for "${query}": ${res.status}`);
  const json = (await res.json()) as { foods?: Candidate[] };
  return (json.foods ?? []).map((f) => ({ fdcId: f.fdcId, description: f.description }));
}

async function main(): Promise<void> {
  const dir = resolve(import.meta.dirname);
  const path = resolve(dir, 'foods.json');
  const foods = JSON.parse(readFileSync(path, 'utf8')) as FoodEntry[];
  const key = process.env.FDC_API_KEY;
  if (!key) throw new Error('set FDC_API_KEY (free at https://api.data.gov/signup)');

  const save = () => writeFileSync(path, JSON.stringify(foods, null, 2) + '\n');
  let filled = 0;
  const misses: string[] = [];
  for (const f of foods) {
    if (f.fdc_id != null) continue; // already resolved — skip
    const cands = await searchCandidates(f.query, key);
    if (cands.length === 0) {
      misses.push(f.query);
      console.warn(`NO MATCH: "${f.query}" — leave unresolved, refine query`);
      continue; // don't abort the whole run on one miss
    }
    f.fdc_id = cands[0].fdcId;
    f.fdc_description = cands[0].description;
    filled++;
    console.log(`${f.query} -> ${cands[0].fdcId}  ${cands[0].description}`);
    for (const c of cands.slice(1)) console.log(`     alt: ${c.fdcId}  ${c.description}`);
    save(); // incremental — a later failure never loses earlier progress
  }
  save();
  console.log(`\nresolved ${filled} entries; review fdc_description values before building`);
  if (misses.length) console.warn(`${misses.length} unresolved (no match): ${misses.join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
