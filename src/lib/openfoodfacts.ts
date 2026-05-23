export interface OFFNutriments {
  'energy-kcal_100g'?: number;
  proteins_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
  fiber_100g?: number;
  sugars_100g?: number;
  'saturated-fat_100g'?: number;
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
  // U-1: optional "of which" sub-macros. `null` = OFF did not provide it
  // (≠ 0 — never assert "sugar-free" from a missing value).
  sugarPer100g: number | null;
  satFatPer100g: number | null;
}

/** Barcode-lookup result: an OFFSearchResult plus whether OFF already had an
 *  energy value (drives the dialog's "review & save" vs "fill the gaps"
 *  banner). R-21. */
export interface OFFProductLookup extends OFFSearchResult {
  complete: boolean;
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
      ...mapOFFNutriments(p.nutriments!),
    }));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Map OFF's optional sub-macro nutriments, preserving `null` when absent
 *  (U-1: a missing OFF value must NOT become 0 — that would falsely assert
 *  "sugar-free"). Used by both the search and barcode-lookup paths. */
export function mapOFFNutriments(n: OFFNutriments): {
  sugarPer100g: number | null;
  satFatPer100g: number | null;
} {
  return {
    sugarPer100g: n.sugars_100g != null ? round2(n.sugars_100g) : null,
    satFatPer100g: n['saturated-fat_100g'] != null ? round2(n['saturated-fat_100g']) : null,
  };
}

/**
 * EAN-8 / EAN-13 / UPC-A (12-digit) checksum validation. Cheap guard run
 * before any network call — kills scanner false-positives (partial-frame
 * misreads) and bad manual input upstream of OpenFoodFacts.
 */
export function isValidEan(code: string): boolean {
  if (!/^\d+$/.test(code)) return false;
  if (![8, 12, 13].includes(code.length)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  let sum = 0;
  for (let i = digits.length - 1, mult = 3; i >= 0; i--, mult = mult === 3 ? 1 : 3) {
    sum += digits[i] * mult;
  }
  const computed = (10 - (sum % 10)) % 10;
  return computed === check;
}

interface OFFProductResponse {
  status?: number;
  product?: OFFProduct;
}

/**
 * Look up a single product by barcode via the OFF v2 product endpoint.
 * Returns the same `OFFSearchResult` shape the search path produces, so the
 * dialog's prefill flow is identical. Returns `null` only when the product
 * is genuinely absent (HTTP 404 / `status: 0`) or has no usable name. OFF v2
 * answers an unknown barcode with HTTP 404, treated as a clean "not found"
 * (null), not an error — only genuine transport / 5xx failures throw.
 *
 * Deliberately MORE lenient than `searchOpenFoodFacts`: it does NOT require
 * an energy value. The user scanned a specific product on purpose, and a
 * large share of Spanish OFF entries have a name + brand but incomplete
 * nutriments. Returning the partial product (missing macros default to 0)
 * drops the user onto the prefilled, editable manual form to complete it —
 * far better than a dead "not found". The text-search path keeps its energy
 * filter, because there a list of 0-kcal hits would just be noise.
 */
export async function getProductByBarcode(
  code: string,
  options: { signal?: AbortSignal } = {},
): Promise<OFFProductLookup | null> {
  const params = new URLSearchParams({
    fields: 'code,product_name,brands,nutriments,image_thumb_url',
  });
  const res = await fetch(`${OFF_BASE}/api/v2/product/${encodeURIComponent(code)}.json?${params}`, {
    signal: options.signal,
    headers: { Accept: 'application/json' },
  });
  if (res.status === 404) return null; // OFF: unknown barcode
  if (!res.ok) {
    throw new Error(`OpenFoodFacts lookup failed: ${res.status}`);
  }
  const json = (await res.json()) as OFFProductResponse;
  const p = json.product;
  if (json.status !== 1 || !p || !p.product_name) return null;
  const n = p.nutriments;
  return {
    code: p.code,
    name: p.product_name,
    brand: p.brands?.split(',')[0]?.trim() || null,
    thumbnailUrl: p.image_thumb_url ?? null,
    kcalPer100g: round2(n?.['energy-kcal_100g'] ?? 0),
    proteinPer100g: round2(n?.proteins_100g ?? 0),
    carbsPer100g: round2(n?.carbohydrates_100g ?? 0),
    fatPer100g: round2(n?.fat_100g ?? 0),
    fiberPer100g: round2(n?.fiber_100g ?? 0),
    ...mapOFFNutriments(n ?? {}),
    // Drives the dialog banner: a found product WITH an energy value is
    // "review & save"; WITHOUT one it's "fill the gaps". (OFF entries often
    // have a name but no nutriments — the lenient lookup still returns them
    // with 0s, so completeness is flagged separately.)
    complete: n?.['energy-kcal_100g'] !== undefined,
  };
}
