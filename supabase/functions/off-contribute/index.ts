// off-contribute (R-21)
//
// POST /functions/v1/off-contribute  (Authorization: Bearer <user JWT>)
// Body: { barcode, name, brand, kcalPer100g, proteinPer100g, carbsPer100g,
//         fatPer100g, fiberPer100g, mode: 'new' | 'complete' }
//
// Pushes an objective product to Open Food Facts under the single app-owned
// OFF account (creds in edge secrets OFF_USER_ID / OFF_PASSWORD). For
// mode='complete' it fetches the live OFF product and writes ONLY the
// nutriment/name/brand fields OFF currently lacks (never overwrites). Spec
// §5/§6/§7. Eligibility was already checked client-side; this is the writer.
//
// Switch OFF_BASE to https://world.openfoodfacts.net (staging) for smoke tests.
//
// Uses the Deno global runtime (Deno.serve / Deno.env) directly, matching the
// other functions here — no edge-runtime.d.ts import (deno lint forbids the
// unversioned specifier, and the Deno globals are available without it).

const OFF_BASE = 'https://world.openfoodfacts.org';
const UA = 'HudsonFitness/1.0 (https://hudsonfitness.vercel.app)';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

interface Payload {
  barcode: string;
  name: string;
  brand: string | null;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number;
  mode: 'new' | 'complete';
}

// Map our shape to OFF write params (kept in sync with core/offContribute.ts;
// the edge runtime can't import the @/ alias, so this is a small duplicate).
function allParams(p: Payload): Record<string, string> {
  return {
    code: p.barcode,
    product_name: p.name,
    brands: p.brand ?? '',
    nutrition_data_per: '100g',
    'nutriment_energy-kcal': String(p.kcalPer100g),
    nutriment_proteins: String(p.proteinPer100g),
    nutriment_carbohydrates: String(p.carbsPer100g),
    nutriment_fat: String(p.fatPer100g),
    nutriment_fiber: String(p.fiberPer100g),
  };
}

// For complete-mode: which fields does OFF already have? Return the param
// subset to write (only blanks). Always keep `code` + `nutrition_data_per`.
async function fillMissingParams(p: Payload): Promise<Record<string, string>> {
  const res = await fetch(
    `${OFF_BASE}/api/v2/product/${encodeURIComponent(p.barcode)}.json?fields=product_name,brands,nutriments`,
    { headers: { 'User-Agent': UA, Accept: 'application/json' } },
  );
  if (!res.ok) return allParams(p); // can't diff → treat as new (safe: OFF merges)
  const data = (await res.json()) as {
    status?: number;
    product?: { product_name?: string; brands?: string; nutriments?: Record<string, unknown> };
  };
  const prod = data.product ?? {};
  const n = prod.nutriments ?? {};
  const out: Record<string, string> = { code: p.barcode, nutrition_data_per: '100g' };
  const all = allParams(p);
  if (!prod.product_name) out.product_name = all.product_name;
  if (!prod.brands) out.brands = all.brands;
  const offHas = (key: string) => n[key] !== undefined && n[key] !== '';
  if (!offHas('energy-kcal_100g')) out['nutriment_energy-kcal'] = all['nutriment_energy-kcal'];
  if (!offHas('proteins_100g')) out.nutriment_proteins = all.nutriment_proteins;
  if (!offHas('carbohydrates_100g')) out.nutriment_carbohydrates = all.nutriment_carbohydrates;
  if (!offHas('fat_100g')) out.nutriment_fat = all.nutriment_fat;
  if (!offHas('fiber_100g')) out.nutriment_fiber = all.nutriment_fiber;
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const userId = Deno.env.get('OFF_USER_ID');
  const password = Deno.env.get('OFF_PASSWORD');
  if (!userId || !password) return json({ error: 'missing_off_credentials' }, 500);

  let p: Payload;
  try {
    p = (await req.json()) as Payload;
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (!p.barcode || !p.name) return json({ error: 'bad_request' }, 400);

  const fields = p.mode === 'complete' ? await fillMissingParams(p) : allParams(p);
  // If complete-mode found nothing to fill (only code + per), skip the write.
  if (p.mode === 'complete' && Object.keys(fields).length <= 2) {
    return json({ ok: true, skipped: 'nothing_to_fill' });
  }

  const form = new URLSearchParams({ user_id: userId, password, ...fields });
  const writeRes = await fetch(`${OFF_BASE}/cgi/product_jqm2.pl`, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
  if (!writeRes.ok) {
    console.error(`OFF_CONTRIBUTE_FAILED status=${writeRes.status} code=${p.barcode}`);
    return json({ error: 'off_write_failed', status: writeRes.status }, 502);
  }
  return json({ ok: true });
});
