# OFF Contribute-Back Implementation Plan (R-21)

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user creates or completes a barcode-identified product that
Open Food Facts lacks, push the objective product data to OFF (under one
app-owned account, gated by a profile preference) so the next scan finds it.

**Architecture:** A pure eligibility/mapping core (`core/offContribute.ts`), a
new `off-contribute` Deno edge function holding the OFF credentials, a
client gate (`lib/offContribute.ts`) that fires-and-forgets after a successful
ingredient save, the scanned barcode threaded into the create path so the row
keeps its EAN, and a synced `profiles.contribute_to_off` toggle in Settings.

**Tech Stack:** Postgres + Supabase (1 staged migration), Deno edge function,
React 18 + TS, TanStack Query, RHF, Vitest Tier-1, i18next (ES + EN).

Spec: `docs/superpowers/specs/2026-05-21-off-contribute-back-design.md`.

---

## Prerequisites & branch

- [ ] **Depends on R-20 (barcode scanning, PR #75).** This plan extends the
      R-20 barcode flow (`getProductByBarcode`, `BarcodeTab` in
      `IngredientDialog`) and the lenient-lookup change. **Execute on a branch
      cut from `develop` AFTER PR #75 has merged to `develop`.** If PR #75 is
      not yet merged when you start, branch from `claude/barcode-scanning`
      instead (it has R-20). Branch name: `claude/r21-off-contribute`.
- [ ] **Toolchain:** `pnpm` is not on PATH here; run via local binaries —
      `node_modules/.bin/vitest run <path>`, `node_modules/.bin/tsc --noEmit`,
      `node_modules/.bin/eslint .`. Commits: plain conventional, **no AI
      attribution**. Commit per task; do not push until the end.

## Secrets mechanism (spec correction)

The spec says "Vault." Vault is the DB→edge cron path. For credentials the
**edge function itself** uses, the correct mechanism is Supabase **edge-function
secrets** read via `Deno.env.get(...)` (same as `delete-account` reads
`SUPABASE_SERVICE_ROLE_KEY`). Set once at deploy time:
`supabase secrets set OFF_USER_ID=<account> OFF_PASSWORD=<pw> --project-ref upvraruehzurbetzrxov`.
The runbook step is in Task 10.

## File structure (decomposition map)

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260523120000_r21_profiles_contribute_to_off.sql` | STAGED: add `profiles.contribute_to_off boolean not null default true` |
| `src/types/database.ts` | hand-edit: add the column to `profiles` Row/Insert/Update |
| `src/core/offContribute.ts` (+ `.test.ts`) | pure: `isContributionEligible` (name+kcal+Atwater+gram) + `toOffWriteParams` mapper |
| `src/features/ingredients/api.ts` | `barcode?` on `ManualIngredientInput`; persist it as `external_id` in `createManualIngredient` |
| `supabase/functions/off-contribute/index.ts` | Deno: receive payload, (complete) re-fetch + fill-missing-only, POST to OFF with creds |
| `src/lib/offContribute.ts` | client: gated fire-and-forget call to the edge fn |
| `src/features/ingredients/components/IngredientDialog.tsx` | 404 → stash barcode + auto-switch + banner; trigger contribution on save (new/complete) gated on profile flag |
| `src/pages/SettingsPage.tsx` | the `contribute_to_off` toggle |
| `src/i18n/{es,en}/ingredientes.json` | the two transition banners |
| `src/i18n/{es,en}/settings.json` | the toggle label/description |
| `docs/{operations,changelog,roadmap}.md` | Wave-3 list + secrets runbook; changelog; flip R-21 |

---

## Task 1: Staged migration — `profiles.contribute_to_off`

**Files:**
- Create: `supabase/migrations/20260523120000_r21_profiles_contribute_to_off.sql`

- [ ] **Step 1: Write the migration**

```sql
-- R-21 — OFF contribute-back: per-user opt-out for sharing scanned products.
--
-- STAGED — DO NOT AUTO-APPLY.
--
-- Specced in docs/superpowers/specs/2026-05-21-off-contribute-back-design.md §4.
-- Synced, DB-canonical preference (like profiles.language); default ON
-- (default-on-with-opt-out consent model). The client reads this flag and
-- skips the off-contribute call when false. NULL is disallowed so the gate
-- is unambiguous for every existing row.

alter table public.profiles
  add column if not exists contribute_to_off boolean not null default true;

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- ROLLBACK:
--   alter table public.profiles drop column if exists contribute_to_off;
```

- [ ] **Step 2: Eyeball it** — single `add column`, `not null default true`
      backfills existing rows, ROLLBACK present. No data migration needed.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260523120000_r21_profiles_contribute_to_off.sql
git commit -m "feat(r21): profiles.contribute_to_off opt-out column (STAGED)"
```

---

## Task 2: `src/types/database.ts` hand-edit

**Files:**
- Modify: `src/types/database.ts` (the `profiles` table block)

R-04 generated types haven't shipped; hand-edit per the interim convention.

- [ ] **Step 1: Add the column to all three `profiles` shapes**

In `src/types/database.ts`, find the `profiles:` table entry. Add
`contribute_to_off: boolean` to its `Row`, and `contribute_to_off?: boolean`
to its `Insert` and `Update` (alphabetical position within each block). Example
for `Row` (place near the top, after any `c…` field):

```ts
          contribute_to_off: boolean
```

and in `Insert` and `Update`:

```ts
          contribute_to_off?: boolean
```

- [ ] **Step 2: Typecheck**

Run: `node_modules/.bin/tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(r21): types — profiles.contribute_to_off"
```

---

## Task 3: `src/core/offContribute.ts` — eligibility gate + payload mapper (TDD)

**Files:**
- Create: `src/core/offContribute.ts`
- Create: `src/core/offContribute.test.ts`

Pure, dependency-free (same constitution as `core/macros.ts`). No barcode
checksum here — the client gate reuses `isValidEan` from `lib/openfoodfacts`
(keeping `core` free of the `lib` import).

- [ ] **Step 1: Write the failing test — `src/core/offContribute.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';
import {
  isContributionEligible,
  toOffWriteParams,
  type OffContributionInput,
} from './offContribute';

const base: OffContributionInput = {
  barcode: '5000112637922',
  name: 'Coca-Cola',
  brand: 'Coca-Cola',
  unitType: 'gram',
  kcalPer100g: 42,
  proteinPer100g: 0,
  carbsPer100g: 10.6,
  fatPer100g: 0,
  fiberPer100g: 0,
};

describe('isContributionEligible', () => {
  it('accepts a sane gram product whose macros match kcal (Atwater)', () => {
    // 4*0 + 4*10.6 + 9*0 = 42.4 vs 42 → within 20%
    expect(isContributionEligible(base)).toBe(true);
  });
  it('rejects a per-unit product (cannot map to OFF per-100g)', () => {
    expect(isContributionEligible({ ...base, unitType: 'unit' })).toBe(false);
  });
  it('rejects a blank name', () => {
    expect(isContributionEligible({ ...base, name: '   ' })).toBe(false);
  });
  it('rejects zero/absent kcal', () => {
    expect(isContributionEligible({ ...base, kcalPer100g: 0 })).toBe(false);
  });
  it('rejects when Atwater is wildly off (decimal slip)', () => {
    // 4*0 + 4*10.6 + 9*0 = 42.4 vs claimed 420 → way over 20%
    expect(isContributionEligible({ ...base, kcalPer100g: 420 })).toBe(false);
  });
  it('rejects all-zero macros (Atwater 0)', () => {
    expect(
      isContributionEligible({
        ...base,
        kcalPer100g: 50,
        proteinPer100g: 0,
        carbsPer100g: 0,
        fatPer100g: 0,
      }),
    ).toBe(false);
  });
  it('accepts a realistic high-fat product within tolerance', () => {
    // olive oil ~900 kcal/100g, fat ~100g → 9*100 = 900
    expect(
      isContributionEligible({
        ...base,
        name: 'Aceite de oliva',
        kcalPer100g: 900,
        proteinPer100g: 0,
        carbsPer100g: 0,
        fatPer100g: 100,
      }),
    ).toBe(true);
  });
});

describe('toOffWriteParams', () => {
  it('maps to OFF write params with nutrition_data_per=100g', () => {
    expect(toOffWriteParams(base)).toEqual({
      code: '5000112637922',
      product_name: 'Coca-Cola',
      brands: 'Coca-Cola',
      nutrition_data_per: '100g',
      'nutriment_energy-kcal': '42',
      nutriment_proteins: '0',
      nutriment_carbohydrates: '10.6',
      nutriment_fat: '0',
      nutriment_fiber: '0',
    });
  });
  it('emits an empty brands string when brand is null', () => {
    expect(toOffWriteParams({ ...base, brand: null }).brands).toBe('');
  });
});
```

- [ ] **Step 2: Run it, verify it FAILS**

Run: `node_modules/.bin/vitest run src/core/offContribute.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement — `src/core/offContribute.ts`:**

```ts
// Pure core for OFF contribute-back (R-21). No IO, no clock, no @/ alias.
// Decides whether a product is safe to push to Open Food Facts, and maps our
// per-100g shape to OFF's write params. Spec §6/§7.

export interface OffContributionInput {
  barcode: string;
  name: string;
  brand: string | null;
  unitType: string; // 'gram' | 'unit'
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number;
}

/** Atwater tolerance: |4P + 4C + 9F − kcal| / kcal must be ≤ this. */
export const ATWATER_TOLERANCE = 0.2;

/**
 * Eligibility gate. Contribute only a gram-based product with a name, a
 * positive kcal, and macros that roughly reconcile with that kcal via the
 * Atwater factors (catches decimal slips / unit confusion before they go
 * public). Per-unit products are skipped — OFF is per-100g.
 */
export function isContributionEligible(input: OffContributionInput): boolean {
  if (input.unitType !== 'gram') return false;
  if (input.name.trim() === '') return false;
  if (!(input.kcalPer100g > 0)) return false;
  const atwater =
    4 * input.proteinPer100g + 4 * input.carbsPer100g + 9 * input.fatPer100g;
  if (!(atwater > 0)) return false;
  const relDiff = Math.abs(atwater - input.kcalPer100g) / input.kcalPer100g;
  return relDiff <= ATWATER_TOLERANCE;
}

export type OffWriteParams = Record<string, string>;

/** Map our per-100g product to OFF's product_jqm2.pl write params. */
export function toOffWriteParams(input: OffContributionInput): OffWriteParams {
  return {
    code: input.barcode,
    product_name: input.name,
    brands: input.brand ?? '',
    nutrition_data_per: '100g',
    'nutriment_energy-kcal': String(input.kcalPer100g),
    nutriment_proteins: String(input.proteinPer100g),
    nutriment_carbohydrates: String(input.carbsPer100g),
    nutriment_fat: String(input.fatPer100g),
    nutriment_fiber: String(input.fiberPer100g),
  };
}
```

- [ ] **Step 4: Run the test, verify all PASS.**

Run: `node_modules/.bin/vitest run src/core/offContribute.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/core/offContribute.ts src/core/offContribute.test.ts
git commit -m "feat(r21): pure OFF eligibility gate + write-param mapper (Tier-1)"
```

---

## Task 4: thread the scanned barcode through `createManualIngredient`

**Files:**
- Modify: `src/features/ingredients/api.ts`

- [ ] **Step 1: Add `barcode?` to `ManualIngredientInput`**

In `src/features/ingredients/api.ts`, extend the interface (after
`fiber_g_per_unit`):

```ts
export interface ManualIngredientInput {
  name: string;
  brand: string | null;
  unit_type: IngredientUnitType;
  kcal_per_unit: number;
  protein_g_per_unit: number;
  carbs_g_per_unit: number;
  fat_g_per_unit: number;
  fiber_g_per_unit: number;
  /** Optional EAN/UPC when this manual product originated from a barcode
   *  scan that OFF didn't have. Persisted as `external_id` so the row keeps
   *  its identity (and the unique(source, external_id) constraint dedupes
   *  repeat scans). R-21. */
  barcode?: string;
}
```

- [ ] **Step 2: Persist it in `createManualIngredient`**

Change the `payload` in `createManualIngredient` to include `external_id` when
a barcode is present:

```ts
  const payload: TablesInsert<'ingredients'> = {
    created_by_user_id: userId,
    source: 'manual',
    external_id: input.barcode ?? null,
    name: input.name,
    brand: input.brand,
    unit_type: input.unit_type,
    kcal_per_unit: input.kcal_per_unit,
    protein_g_per_unit: input.protein_g_per_unit,
    carbs_g_per_unit: input.carbs_g_per_unit,
    fat_g_per_unit: input.fat_g_per_unit,
    fiber_g_per_unit: input.fiber_g_per_unit,
  };
```

(`external_id` already exists on `ingredients`; manual rows previously left it
null. Setting it for barcode-origin rows enables dedupe via the existing
`unique(source, external_id)` constraint — two `manual` rows with the same
barcode now collide, recovered the same way `importIngredientFromOFF` recovers
a `23505`. Note: a future-nicety would be to recover-on-conflict here too, but
the create path's existing behavior is unchanged for null barcodes, so this is
out of scope — YAGNI.)

- [ ] **Step 3: Typecheck**

Run: `node_modules/.bin/tsc --noEmit` → 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/features/ingredients/api.ts
git commit -m "feat(r21): retain scanned barcode as external_id on manual create"
```

---

## Task 5: `off-contribute` edge function

**Files:**
- Create: `supabase/functions/off-contribute/index.ts`

Receives a contribution payload from the authenticated client, and writes to
OFF under the app account. For `mode: 'complete'` it re-fetches the live OFF
product and writes only the fields OFF still has blank (server-authoritative
fill-missing-only). Network failures are returned as JSON but the client
ignores them (fire-and-forget).

- [ ] **Step 1: Write the function**

```ts
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

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

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
```

- [ ] **Step 2: Note (no unit test).** Edge network writes aren't unit-tested
      (same stance as the other edge fns). Verification is the staging smoke in
      Task 10 / the plan's validation.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/off-contribute/index.ts
git commit -m "feat(r21): off-contribute edge function (new + fill-missing-only)"
```

---

## Task 6: `src/lib/offContribute.ts` — client call (gated, fire-and-forget)

**Files:**
- Create: `src/lib/offContribute.ts`

- [ ] **Step 1: Write the client helper**

```ts
import { supabase } from '@/lib/supabase';
import { isValidEan } from '@/lib/openfoodfacts';
import {
  isContributionEligible,
  type OffContributionInput,
} from '@/core/offContribute';

export interface ContributeArgs extends OffContributionInput {
  mode: 'new' | 'complete';
}

/**
 * Fire-and-forget contribution to OFF via the edge function. Returns
 * immediately; never throws and never blocks the caller. Skips silently when
 * the user opted out, the barcode is invalid, or the data fails the
 * eligibility gate. A failed contribution is a non-event — the ingredient is
 * already saved locally.
 */
export function contributeToOff(args: ContributeArgs, optedIn: boolean): void {
  if (!optedIn) return;
  if (!isValidEan(args.barcode)) return;
  if (!isContributionEligible(args)) return;

  void supabase.functions
    .invoke('off-contribute', {
      body: {
        barcode: args.barcode,
        name: args.name,
        brand: args.brand,
        kcalPer100g: args.kcalPer100g,
        proteinPer100g: args.proteinPer100g,
        carbsPer100g: args.carbsPer100g,
        fatPer100g: args.fatPer100g,
        fiberPer100g: args.fiberPer100g,
        mode: args.mode,
      },
    })
    .catch(() => {
      // swallow — fire-and-forget
    });
}
```

- [ ] **Step 2: Typecheck**

Run: `node_modules/.bin/tsc --noEmit` → 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/offContribute.ts
git commit -m "feat(r21): client contributeToOff (gated, fire-and-forget)"
```

---

## Task 7: wire the 404 banner + barcode retention + contribution into `IngredientDialog`

**Files:**
- Modify: `src/features/ingredients/components/IngredientDialog.tsx`

Read the current file first. Relevant existing pieces (from R-20): the
`BarcodeTab` sub-component (`resolve(code)` calls `useBarcodeLookup`), the
`onResolved` handler in the `barcode` TabsContent that does `setPickedOFF` +
`setForm` + `setTab('manual')`, the `pickedOFF` state, and the `onValid` submit
which branches `isEdit` / `pickedOFF` / else→`create`.

- [ ] **Step 1: Add a "scanned barcode, not in OFF" state + banner copy hook**

In the dialog component, add state to remember a barcode that 404'd, plus the
profile flag:

```tsx
import { useProfile } from '@/features/profile/hooks';
import { contributeToOff } from '@/lib/offContribute';
// ... inside the component:
const { data: profile } = useProfile();
const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
const [barcodeBanner, setBarcodeBanner] = useState<'new' | 'complete' | null>(null);
```

- [ ] **Step 2: On a 404, stash the barcode + switch to manual + show banner**

`BarcodeTab` currently shows a "not found" message on null. Change `BarcodeTab`
to accept an `onNotFound: (code: string) => void` prop and call it instead of
only setting local `notFound`. In `resolve()`:

```tsx
async function resolve(code: string) {
  setNotFound(false);
  setScanning(false);
  try {
    const result = await lookup.mutateAsync(code);
    if (result) onResolved(result);
    else onNotFound(code); // 404 → parent stashes barcode + switches tab
  } catch {
    // transport error already toasted by useBarcodeLookup.onError
  }
}
```

Wire the new prop where `<BarcodeTab>` is rendered:

```tsx
<BarcodeTab
  onResolved={(r) => {
    setScannedBarcode(r.code);     // completion case keeps the EAN too
    setBarcodeBanner('complete');
    setPickedOFF(r);
    setForm({
      name: r.name,
      brand: r.brand ?? '',
      unit_type: 'gram',
      kcal_per_unit: String(r.kcalPer100g),
      protein_g_per_unit: String(r.proteinPer100g),
      carbs_g_per_unit: String(r.carbsPer100g),
      fat_g_per_unit: String(r.fatPer100g),
      fiber_g_per_unit: String(r.fiberPer100g),
    });
    setTab('manual');
  }}
  onNotFound={(code) => {
    setScannedBarcode(code);
    setBarcodeBanner('new');
    setPickedOFF(null);            // genuinely absent — manual create path
    setTab('manual');
  }}
/>
```

- [ ] **Step 3: Render the banner atop the manual tab**

At the top of the `manual` `TabsContent` (before `IngredientFormFields`):

```tsx
{barcodeBanner && (
  <p className="text-sm rounded-md border border-dashed p-2 text-muted-foreground">
    {t(barcodeBanner === 'new' ? 'barcode.bannerNew' : 'barcode.bannerComplete')}
  </p>
)}
```

- [ ] **Step 4: Thread the barcode into the create payload + fire the contribution**

In `onValid`, after the existing save logic, two changes:
(a) when the save goes through the manual `create` path and we have a
`scannedBarcode`, pass it so the row keeps its EAN; (b) after a successful save
of a barcode-origin product, fire the contribution. Adjust the create branch:

```tsx
} else {
  saved = await create.mutateAsync({ ...parsed, barcode: scannedBarcode ?? undefined });
}
// ...after saved is obtained and onSaved?.(saved) is about to run:
if (scannedBarcode) {
  contributeToOff(
    {
      barcode: scannedBarcode,
      name: parsed.name,
      brand: parsed.brand,
      unitType: parsed.unit_type,
      kcalPer100g: parsed.kcal_per_unit,
      proteinPer100g: parsed.protein_g_per_unit,
      carbsPer100g: parsed.carbs_g_per_unit,
      fatPer100g: parsed.fat_g_per_unit,
      fiberPer100g: parsed.fiber_g_per_unit,
      mode: barcodeBanner === 'complete' ? 'complete' : 'new',
    },
    profile?.contribute_to_off ?? true,
  );
}
```

(`parsed` is the already-validated `ParsedIngredientForm` the dialog computes
before saving — reuse it; do not re-read the raw form. The `import` path —
`pickedOFF` set — also has `scannedBarcode` set in Step 2, so the completion
contribution fires there too.)

- [ ] **Step 5: Reset the new state when the dialog re-opens**

In the existing `useEffect` that resets on `open`, add:

```tsx
setScannedBarcode(null);
setBarcodeBanner(null);
```

- [ ] **Step 6: Typecheck + lint**

Run: `node_modules/.bin/tsc --noEmit` and
`node_modules/.bin/eslint src/features/ingredients/components/IngredientDialog.tsx`
→ 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/features/ingredients/components/IngredientDialog.tsx
git commit -m "feat(r21): 404 banner + barcode retention + OFF contribution trigger"
```

---

## Task 8: Settings toggle for `contribute_to_off`

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

Mirror the existing language-section pattern (`saveSection` + a `handleSave…`
that calls `update.mutateAsync`). No `Switch` primitive exists in the repo; use
a native checkbox (same approach as the warmup checkbox elsewhere).

- [ ] **Step 1: Add local state synced from profile**

Near the other `useState`/`useEffect`:

```tsx
const [contributeOff, setContributeOff] = useState(true);
// inside the existing `useEffect(() => { if (!profile) return; … }, [profile, …])`:
setContributeOff(profile.contribute_to_off ?? true);
```

- [ ] **Step 2: Add the save handler**

```tsx
async function handleToggleContribute(next: boolean) {
  setContributeOff(next);
  await saveSection('contribute', { contribute_to_off: next });
}
```

- [ ] **Step 3: Add a Privacy/Data card** (place after the Appearance card):

```tsx
<Card>
  <CardHeader>
    <CardTitle>{t('privacy.title')}</CardTitle>
    <CardDescription>{t('privacy.description')}</CardDescription>
  </CardHeader>
  <CardContent>
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input
        type="checkbox"
        className="h-4 w-4"
        checked={contributeOff}
        onChange={(e) => void handleToggleContribute(e.target.checked)}
      />
      {t('privacy.contributeOff')}
    </label>
    {savedSection === 'contribute' && !update.isPending && (
      <p className="text-sm text-muted-foreground mt-2">{t('actions.saved')}</p>
    )}
  </CardContent>
</Card>
```

- [ ] **Step 4: Typecheck**

Run: `node_modules/.bin/tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/SettingsPage.tsx
git commit -m "feat(r21): Settings toggle for OFF contribution"
```

---

## Task 9: i18n — banners + toggle (ES + EN)

**Files:**
- Modify: `src/i18n/es/ingredientes.json`, `src/i18n/en/ingredientes.json`
- Modify: `src/i18n/es/settings.json`, `src/i18n/en/settings.json`

- [ ] **Step 1: Add the two banners under the `barcode` block**

ES `ingredientes.json` → inside `"barcode": { … }` add:

```json
    "bannerNew": "Aún no está en Open Food Facts. Añade sus datos para que otros puedan escanearlo después.",
    "bannerComplete": "Faltan algunos datos. Complétalos para terminar la ficha."
```

EN `ingredientes.json` → inside `"barcode": { … }` add:

```json
    "bannerNew": "Not in Open Food Facts yet. Add its details so others can scan it later.",
    "bannerComplete": "Some values are missing. Fill them in to complete it."
```

- [ ] **Step 2: Add the privacy card strings**

ES `settings.json` → add a top-level block:

```json
  "privacy": {
    "title": "Privacidad",
    "description": "Controla qué datos se comparten.",
    "contributeOff": "Contribuir productos escaneados a Open Food Facts"
  }
```

EN `settings.json`:

```json
  "privacy": {
    "title": "Privacy",
    "description": "Control what data is shared.",
    "contributeOff": "Contribute scanned products to Open Food Facts"
  }
```

(Place each `privacy` block as a sibling of the existing top-level keys; mind
the trailing commas so the JSON stays valid.)

- [ ] **Step 3: Validate JSON + typecheck**

```bash
node -e "['es','en'].forEach(l=>{JSON.parse(require('fs').readFileSync('src/i18n/'+l+'/ingredientes.json'));JSON.parse(require('fs').readFileSync('src/i18n/'+l+'/settings.json'))});console.log('JSON OK')"
node_modules/.bin/tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/i18n/es/ingredientes.json src/i18n/en/ingredientes.json src/i18n/es/settings.json src/i18n/en/settings.json
git commit -m "feat(r21): i18n — barcode banners + OFF contribution toggle (ES+EN)"
```

---

## Task 10: docs — Wave-3 list + secrets runbook + changelog + roadmap flip

**Files:**
- Modify: `docs/operations.md`, `docs/changelog.md`, `docs/roadmap.md`

- [ ] **Step 1: operations.md — migration + secrets runbook**

Append the migration to the Wave-3 sequence block:

```
20260523120000_r21_profiles_contribute_to_off.sql   # STAGED — R-21 (opt-out column)
```

And add a short runbook note near the edge-functions section:

```
**R-21 OFF contribute-back setup.** Register one Open Food Facts contributor
account ("HudsonFitness"). Set its credentials as edge secrets:
`supabase secrets set OFF_USER_ID=<account> OFF_PASSWORD=<pw> --project-ref upvraruehzurbetzrxov`.
Deploy: `supabase functions deploy off-contribute --project-ref upvraruehzurbetzrxov`.
Smoke against OFF staging first by switching OFF_BASE to
`https://world.openfoodfacts.net` in the function; flip back to `.org` for prod.
```

- [ ] **Step 2: changelog.md — dated entry** (top of the dated section):

```markdown
### 2026-05-21 — R-21 OFF contribute-back

- When a user creates a barcoded product OFF lacked, or completes an incomplete one, the app pushes the objective data back to Open Food Facts under a single app account (via the new `off-contribute` edge fn), gated by a default-on `profiles.contribute_to_off` toggle in Settings. Eligibility gate (name + kcal + Atwater ±20% + gram-only) and server-side fill-missing-only for completions. Fire-and-forget; never blocks the user. Scanned barcode now persists as `external_id` on manual create (with dedupe). STAGED migration.
```

- [ ] **Step 3: roadmap.md — flip R-21 from sketch to done**

Replace the R-21 `status:` line (currently "sketch (2026-05-21)…") with:

```markdown
- **status:** done (2026-05-21) — pure eligibility gate + mapper
  (`core/offContribute.ts`, Tier-1), `off-contribute` edge fn (new +
  fill-missing-only), client fire-and-forget gated on the new
  `profiles.contribute_to_off` toggle, barcode retained as `external_id` on
  manual create. STAGED migration; OFF account creds via edge secrets.
  Plan: `docs/superpowers/plans/2026-05-21-off-contribute-back.md`.
```

- [ ] **Step 4: Commit**

```bash
git add docs/operations.md docs/changelog.md docs/roadmap.md
git commit -m "docs(r21): Wave-3 migration + OFF secrets runbook + changelog + roadmap"
```

---

## Validation (run before declaring done)

- [ ] `node_modules/.bin/tsc --noEmit` — 0 errors.
- [ ] `node_modules/.bin/eslint .` — 0 errors (pre-existing warnings OK).
- [ ] `node_modules/.bin/vitest run` — all green (incl. new `offContribute.test.ts`).
- [ ] `node_modules/.bin/vite build` — succeeds.
- [ ] **Manual smoke (after Wave-3 apply + edge deploy, OFF staging first):**
      scan a product OFF lacks → banner appears → fill macros → save → confirm
      it lands on OFF staging. Toggle the Settings switch off → save another →
      confirm NO contribution fires. Scan an incomplete OFF product → complete
      it → confirm only the blank fields get filled on OFF.

## Wave-3 apply procedure

Apply the one staged migration via `apply_migration`:
`20260523120000_r21_profiles_contribute_to_off.sql`. Then set the edge secrets
(Task 10 runbook) and `supabase functions deploy off-contribute`. Flip the
`STAGED — R-21` marker in operations.md to `applied <date>`; mark R-21 done.

## Deferred (intentional, vs spec §6)

- **Per-day write cap:** the spec mentioned a cap. A real cap needs server-side
  state (a counter table), which is scope creep for a solo/F&F app where the
  natural volume is one write per eligible barcode-save. OFF rate-limits
  server-side, and the eligibility gate already bounds volume. Deferred; revisit
  if abuse appears.
- **v3 OFF write endpoint:** using v1 `product_jqm2.pl`; revisit if OFF
  deprecates it.
