export interface OFFNutriments {
  'energy-kcal_100g'?: number;
  proteins_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
  fiber_100g?: number;
}

export interface OFFProduct {
  code: string;
  product_name?: string;
  brands?: string;
  nutriments?: OFFNutriments;
  image_thumb_url?: string;
}

export interface OFFSearchResult {
  code: string;
  name: string;
  brand: string | null;
  thumbnailUrl: string | null;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number;
}

const OFF_BASE = 'https://world.openfoodfacts.org';

export async function searchOpenFoodFacts(
  query: string,
  options: { signal?: AbortSignal; pageSize?: number } = {},
): Promise<OFFSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const params = new URLSearchParams({
    search_terms: trimmed,
    search_simple: '1',
    json: '1',
    page_size: String(options.pageSize ?? 12),
    fields: 'code,product_name,brands,nutriments,image_thumb_url',
  });

  const res = await fetch(`${OFF_BASE}/cgi/search.pl?${params}`, {
    signal: options.signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`OpenFoodFacts search failed: ${res.status}`);
  }

  const json = (await res.json()) as { products?: OFFProduct[] };
  const products = json.products ?? [];

  return products
    .filter((p) => p.code && p.product_name && p.nutriments?.['energy-kcal_100g'] !== undefined)
    .map<OFFSearchResult>((p) => ({
      code: p.code,
      name: p.product_name!,
      brand: p.brands?.split(',')[0]?.trim() || null,
      thumbnailUrl: p.image_thumb_url ?? null,
      kcalPer100g: round2(p.nutriments!['energy-kcal_100g'] ?? 0),
      proteinPer100g: round2(p.nutriments!.proteins_100g ?? 0),
      carbsPer100g: round2(p.nutriments!.carbohydrates_100g ?? 0),
      fatPer100g: round2(p.nutriments!.fat_100g ?? 0),
      fiberPer100g: round2(p.nutriments!.fiber_100g ?? 0),
    }));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
