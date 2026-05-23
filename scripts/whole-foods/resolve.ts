import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { FoodEntry } from './build-seed';

const FDC = 'https://api.nal.usda.gov/fdc/v1';

async function searchTop(query: string, key: string): Promise<{ fdcId: number; description: string }> {
  const res = await fetch(`${FDC}/foods/search?api_key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, dataType: ['SR Legacy'], pageSize: 1 }),
  });
  if (!res.ok) throw new Error(`FDC search failed for "${query}": ${res.status}`);
  const json = (await res.json()) as { foods?: { fdcId: number; description: string }[] };
  const top = json.foods?.[0];
  if (!top) throw new Error(`no SR Legacy match for "${query}"`);
  return { fdcId: top.fdcId, description: top.description };
}

async function main(): Promise<void> {
  const dir = resolve(import.meta.dirname);
  const path = resolve(dir, 'foods.json');
  const foods = JSON.parse(readFileSync(path, 'utf8')) as FoodEntry[];
  const key = process.env.FDC_API_KEY;
  if (!key) throw new Error('set FDC_API_KEY (free at https://api.data.gov/signup)');

  let filled = 0;
  for (const f of foods) {
    if (f.fdc_id != null) continue; // already resolved — skip
    const { fdcId, description } = await searchTop(f.query, key);
    f.fdc_id = fdcId;
    f.fdc_description = description;
    filled++;
    console.log(`${f.query} -> ${fdcId}  ${description}`);
  }
  writeFileSync(path, JSON.stringify(foods, null, 2) + '\n');
  console.log(`resolved ${filled} entries; review fdc_description values before building`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
