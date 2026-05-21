# Barcode Scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user scan a product barcode with the device camera (or type the
EAN by hand), look it up in OpenFoodFacts, and prefill the New Ingredient form —
replacing the disabled "Próximamente — escáner de código de barras" placeholder
tab in `IngredientDialog`.

**Architecture:** A new pure `getProductByBarcode(code)` adapter on the existing
`src/lib/openfoodfacts.ts` (mirrors `searchOpenFoodFacts`'s mapping + filtering),
plus an `isValidEan(code)` checksum guard. A self-contained `BarcodeScanner`
component owns the camera: it prefers the zero-bundle native `BarcodeDetector`
Web API and lazy-falls-back to `@zxing/browser` when that API is absent (iOS
Safari). On a successful decode (or a typed EAN) the dialog reuses its existing
`pickedOFF` → `setForm` → `useImportFromOFF` plumbing unchanged — so the barcode
tab and the OFF-search tab converge on one prefill path.

**Tech Stack:** React 18 + Vite + TS, TanStack Query, RHF + zod (R-09),
Tailwind + shadcn/ui, Vitest + RTL/jsdom (R-16 Tier-1/Tier-2),
`@zxing/browser` (lazy-loaded), the native `BarcodeDetector` API, i18next
(ES + EN complete).

This is **client-only** — no DB migration, no RPC, no edge function. It does not
touch the staged-migration / Wave-3 flow.

---

## File structure (decomposition map)

| Path | Responsibility |
|---|---|
| `src/lib/openfoodfacts.ts` | **Modify.** Add `getProductByBarcode(code, opts)` (OFF v2 product endpoint → `OFFSearchResult \| null`) + `isValidEan(code)` (EAN-8/13 + UPC-A checksum). |
| `src/lib/openfoodfacts.test.ts` | **Create.** Tier-1 unit tests for both new pure functions (mocked `fetch`). |
| `src/features/ingredients/hooks.ts` | **Modify.** Add `useBarcodeLookup()` — a mutation wrapping `getProductByBarcode`, no toast on success (the dialog drives UX), `toastError` on failure. |
| `src/features/ingredients/components/BarcodeScanner.tsx` | **Create.** Camera scanner: native `BarcodeDetector` fast-path → `@zxing/browser` fallback; renders `<video>`, a guide rectangle, a Stop button; calls `onDetected(code)` once. |
| `src/features/ingredients/components/IngredientDialog.tsx` | **Modify.** Widen `tab` union to include `'barcode'`; enable the third tab; render a `BarcodeTab` (scanner + manual-EAN input) that resolves a barcode → `setPickedOFF` + `setForm` (identical to the OFF pick handler). |
| `src/i18n/es/ingredientes.json` / `src/i18n/en/ingredientes.json` | **Modify.** Rename `tabs.imported`→`tabs.barcode`, drop `tabs.importedSoon`, add a `barcode.*` block. |
| `vite.config.ts` | **Modify.** Add a `zxing: ['@zxing/browser']` entry to `manualChunks`. |
| `package.json` | **Modify.** Add the `@zxing/browser` dependency (via `pnpm add`). |
| `docs/changelog.md`, `docs/roadmap.md`, `docs/features.md` | **Modify.** R-20 entry; promote the barcode "product idea" to shipped; changelog line. |

---

## Task 1: Add the `@zxing/browser` dependency

**Files:**
- Modify: `package.json` (+ `pnpm-lock.yaml`, auto)

- [ ] **Step 1: Install the package**

Run:
```bash
pnpm add @zxing/browser
```

Expected: `package.json` `dependencies` gains `"@zxing/browser": "^0.1.5"` (or
the current latest 0.1.x), `pnpm-lock.yaml` updated. `@zxing/library` is pulled
in transitively (it is `@zxing/browser`'s peer/runtime dep and re-exports
`BarcodeFormat` / `DecodeHintType`).

- [ ] **Step 2: Verify the install resolves the API used by Task 4**

Run:
```bash
node -e "const z = require('@zxing/browser'); console.log(typeof z.BrowserMultiFormatReader)"
```
Expected: `function`. If it prints `undefined`, the installed version moved the
export — pause and check the package's `README` for the reader class name before
writing Task 4's component.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): add @zxing/browser for barcode scanning"
```

---

## Task 2: `isValidEan` + `getProductByBarcode` (TDD, Tier-1)

**Files:**
- Modify: `src/lib/openfoodfacts.ts`
- Create: `src/lib/openfoodfacts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/openfoodfacts.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getProductByBarcode, isValidEan } from './openfoodfacts';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isValidEan', () => {
  it('accepts a valid EAN-13 (check digit correct)', () => {
    // 5000112637922 — real Coca-Cola EAN-13, checksum valid.
    expect(isValidEan('5000112637922')).toBe(true);
  });
  it('accepts a valid EAN-8', () => {
    // 96385074 — canonical EAN-8 test value.
    expect(isValidEan('96385074')).toBe(true);
  });
  it('accepts a valid UPC-A (12 digits)', () => {
    // 036000291452 — canonical UPC-A test value.
    expect(isValidEan('036000291452')).toBe(true);
  });
  it('rejects a wrong check digit', () => {
    expect(isValidEan('5000112637923')).toBe(false);
  });
  it('rejects non-digit and wrong-length input', () => {
    expect(isValidEan('50001126ABCDE')).toBe(false);
    expect(isValidEan('12345')).toBe(false);
    expect(isValidEan('')).toBe(false);
  });
});

describe('getProductByBarcode', () => {
  function mockFetch(body: unknown, ok = true, status = 200) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok,
        status,
        json: () => Promise.resolve(body),
      }),
    );
  }

  it('maps a found product to OFFSearchResult', async () => {
    mockFetch({
      status: 1,
      product: {
        code: '5000112637922',
        product_name: 'Coca-Cola',
        brands: 'Coca-Cola, The Coca-Cola Company',
        nutriments: {
          'energy-kcal_100g': 42,
          proteins_100g: 0,
          carbohydrates_100g: 10.6,
          fat_100g: 0,
          fiber_100g: 0,
        },
        image_thumb_url: 'https://img/thumb.jpg',
      },
    });
    const result = await getProductByBarcode('5000112637922');
    expect(result).toEqual({
      code: '5000112637922',
      name: 'Coca-Cola',
      brand: 'Coca-Cola',
      thumbnailUrl: 'https://img/thumb.jpg',
      kcalPer100g: 42,
      proteinPer100g: 0,
      carbsPer100g: 10.6,
      fatPer100g: 0,
      fiberPer100g: 0,
    });
  });

  it('returns null when OFF reports status 0 (not found)', async () => {
    mockFetch({ status: 0 });
    expect(await getProductByBarcode('0000000000000')).toBeNull();
  });

  it('returns null when the product has no energy value', async () => {
    mockFetch({
      status: 1,
      product: { code: '5000112637922', product_name: 'X', nutriments: {} },
    });
    expect(await getProductByBarcode('5000112637922')).toBeNull();
  });

  it('throws on a non-OK HTTP response', async () => {
    mockFetch({}, false, 503);
    await expect(getProductByBarcode('5000112637922')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm vitest run src/lib/openfoodfacts.test.ts`
Expected: FAIL — `getProductByBarcode` / `isValidEan` are not exported yet.

- [ ] **Step 3: Implement both functions**

Append to `src/lib/openfoodfacts.ts` (after `round2`):

```ts
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
  // For EAN-13 the rightmost data digit has weight 3; for EAN-8 and UPC-A
  // the standard alternating 3/1 weighting from the check digit leftward
  // produces the same result when we walk right-to-left.
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
 * dialog's prefill flow is identical. Returns `null` for not-found
 * (`status: 0`) and for products missing an energy value (consistent with
 * `searchOpenFoodFacts`'s filter). Throws on transport / non-OK HTTP.
 */
export async function getProductByBarcode(
  code: string,
  options: { signal?: AbortSignal } = {},
): Promise<OFFSearchResult | null> {
  const params = new URLSearchParams({
    fields: 'code,product_name,brands,nutriments,image_thumb_url',
  });
  const res = await fetch(`${OFF_BASE}/api/v2/product/${encodeURIComponent(code)}.json?${params}`, {
    signal: options.signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`OpenFoodFacts lookup failed: ${res.status}`);
  }
  const json = (await res.json()) as OFFProductResponse;
  const p = json.product;
  if (json.status !== 1 || !p || !p.product_name) return null;
  if (p.nutriments?.['energy-kcal_100g'] === undefined) return null;
  return {
    code: p.code,
    name: p.product_name,
    brand: p.brands?.split(',')[0]?.trim() || null,
    thumbnailUrl: p.image_thumb_url ?? null,
    kcalPer100g: round2(p.nutriments['energy-kcal_100g'] ?? 0),
    proteinPer100g: round2(p.nutriments.proteins_100g ?? 0),
    carbsPer100g: round2(p.nutriments.carbohydrates_100g ?? 0),
    fatPer100g: round2(p.nutriments.fat_100g ?? 0),
    fiberPer100g: round2(p.nutriments.fiber_100g ?? 0),
  };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm vitest run src/lib/openfoodfacts.test.ts`
Expected: PASS (all 9 cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/openfoodfacts.ts src/lib/openfoodfacts.test.ts
git commit -m "feat(off): getProductByBarcode + isValidEan (Tier-1 tested)"
```

---

## Task 3: `useBarcodeLookup` hook

**Files:**
- Modify: `src/features/ingredients/hooks.ts`

- [ ] **Step 1: Add the hook**

At the top of `src/features/ingredients/hooks.ts`, ensure the import line that
already pulls from `@/lib/openfoodfacts` also imports `getProductByBarcode`
(if the file imports `searchOpenFoodFacts`, extend that import; otherwise add a
new import). Then add, near `useOFFSearch`:

```ts
export function useBarcodeLookup() {
  return useMutation({
    mutationFn: (code: string) => getProductByBarcode(code),
    onError: toastError,
    // No success toast — the dialog shows the prefilled form or a
    // "not found" message; a toast here would double up.
  });
}
```

Verify `useMutation` and `toastError` are already imported in this file (they
are — `useImportFromOFF` uses both). If `getProductByBarcode` isn't imported
yet, add it to the existing `from '@/lib/openfoodfacts'` import.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/ingredients/hooks.ts
git commit -m "feat(ingredients): useBarcodeLookup mutation hook"
```

---

## Task 4: `BarcodeScanner` component

**Files:**
- Create: `src/features/ingredients/components/BarcodeScanner.tsx`

This component owns ONLY the camera → decoded-string concern. It does not do the
OFF lookup (the dialog does, in Task 5). It calls `onDetected(code)` exactly once
per mount-scan and stops the camera.

- [ ] **Step 1: Write the component**

Create `src/features/ingredients/components/BarcodeScanner.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isValidEan } from '@/lib/openfoodfacts';

interface Props {
  /** Fired once with a checksum-valid EAN/UPC; the parent stops rendering us. */
  onDetected: (code: string) => void;
}

// Minimal structural type for the native BarcodeDetector (no DOM lib types
// for it yet in our TS target). We only use what we need.
interface NativeBarcodeDetector {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}
interface BarcodeDetectorCtor {
  new (opts: { formats: string[] }): NativeBarcodeDetector;
}

const EAN_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

export function BarcodeScanner({ onDetected }: Props) {
  const { t } = useTranslation('ingredientes');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stoppedRef = useRef(false);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting');

  useEffect(() => {
    stoppedRef.current = false;
    let zxingControls: { stop: () => void } | null = null;
    let rafId = 0;

    function fire(code: string) {
      if (stoppedRef.current) return;
      if (!isValidEan(code)) return; // reject partial-frame misreads
      stoppedRef.current = true;
      stopCamera();
      onDetected(code);
    }

    function stopCamera() {
      if (rafId) cancelAnimationFrame(rafId);
      zxingControls?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        });
        if (stoppedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true'); // iOS Safari: inline, not fullscreen
        video.muted = true;
        await video.play();
        setStatus('scanning');

        const Detector = (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
          .BarcodeDetector;
        if (Detector) {
          // Native fast-path (Chromium / Android). Poll frames via rAF.
          const detector = new Detector({ formats: EAN_FORMATS });
          const tick = async () => {
            if (stoppedRef.current || !videoRef.current) return;
            try {
              const found = await detector.detect(videoRef.current);
              if (found[0]?.rawValue) {
                fire(found[0].rawValue);
                return;
              }
            } catch {
              // transient per-frame decode error: keep polling
            }
            rafId = requestAnimationFrame(tick);
          };
          rafId = requestAnimationFrame(tick);
        } else {
          // Fallback: ZXing (iOS Safari). Lazy-import so it never enters the
          // main bundle. @zxing/browser@0.2.0 does NOT ship @zxing/library
          // and does not export DecodeHintType as a value, so we use the
          // 1D-only reader (EAN/UPC/Code128/ITF) instead of passing a hints
          // Map — `isValidEan` downstream rejects any non-EAN/UPC 1D format,
          // so scoping to 1D is enough and avoids the QR/Datamatrix surface.
          const { BrowserMultiFormatOneDReader } = await import('@zxing/browser');
          const reader = new BrowserMultiFormatOneDReader();
          // decodeFromVideoElement(source, cb) → Promise<IScannerControls>
          // (controls expose .stop()). Verified against 0.2.0 typings.
          zxingControls = await reader.decodeFromVideoElement(videoRef.current!, (result) => {
            if (result) fire(result.getText());
          });
        }
      } catch {
        if (!stoppedRef.current) setStatus('error');
      }
    }

    void start();
    return () => {
      stoppedRef.current = true;
      stopCamera();
    };
  }, [onDetected]);

  if (status === 'error') {
    return (
      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground space-y-2">
        <p>{t('barcode.cameraError')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-md bg-black aspect-[4/3]">
        <video ref={videoRef} className="h-full w-full object-cover" />
        {/* Guide rectangle to help the user line up the barcode. */}
        <div className="pointer-events-none absolute inset-x-8 top-1/2 -translate-y-1/2 h-20 border-2 border-white/80 rounded" />
        {status === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground text-center">{t('barcode.aimHint')}</p>
    </div>
  );
}
```

- [ ] **Step 2: Smoke-check the ZXing API surface against the installed version**

Run: `pnpm typecheck`
Expected: PASS. If `decodeFromVideoElement` or the `@zxing/library` exports type-error,
the installed `@zxing/browser` version differs — check its `dist` typings
(`node_modules/@zxing/browser/esm/index.d.ts`) for the actual reader method
(older versions use `decodeFromVideoDevice(undefined, video, cb)` returning a
control with `.stop()`; adjust the call + the `zxingControls` assignment to match).

- [ ] **Step 3: Commit**

```bash
git add src/features/ingredients/components/BarcodeScanner.tsx
git commit -m "feat(ingredients): BarcodeScanner (native BarcodeDetector + ZXing fallback)"
```

---

## Task 5: Wire the barcode tab into `IngredientDialog`

**Files:**
- Modify: `src/features/ingredients/components/IngredientDialog.tsx`

The dialog already has: `const [tab, setTab] = useState<'off' | 'manual'>('off')`,
a `pickedOFF` state, a `setForm(next)` helper, and a disabled third `TabsTrigger`
(`value="imported"`, `disabled`, `title={t('tabs.importedSoon')}`). We widen the
union, enable the trigger, and add a `TabsContent`.

- [ ] **Step 1: Widen the tab union**

Change every `useState<'off' | 'manual'>('off')` and the `onValueChange`
cast `(v) => setTab(v as 'off' | 'manual')` to include `'barcode'`:

```tsx
const [tab, setTab] = useState<'off' | 'manual' | 'barcode'>('off');
// ...
<Tabs value={tab} onValueChange={(v) => setTab(v as 'off' | 'manual' | 'barcode')}>
```

- [ ] **Step 2: Replace the disabled tab trigger**

Replace the disabled `imported` trigger:

```tsx
<TabsTrigger value="imported" disabled title={t('tabs.importedSoon')}>
  {t('tabs.imported')}
</TabsTrigger>
```

with an enabled barcode trigger:

```tsx
<TabsTrigger value="barcode">{t('tabs.barcode')}</TabsTrigger>
```

- [ ] **Step 3: Add the barcode `TabsContent`**

Add after the `manual` `TabsContent`, still inside the `<Tabs>` for the
`!isEdit` branch. It composes the scanner + a manual EAN input, then funnels a
resolved barcode through the SAME prefill the OFF tab uses:

```tsx
<TabsContent value="barcode" className="space-y-4">
  <BarcodeTab
    onResolved={(r) => {
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
      setTab('manual'); // jump to the editable form with values prefilled
    }}
  />
</TabsContent>
```

(`setForm`, `setPickedOFF`, and the `IngredientFormState` field names above are
exactly the OFF `onPick` handler already in this file — copy that object
verbatim so the two paths stay identical.)

- [ ] **Step 4: Add the `BarcodeScanner` import + the `BarcodeTab` sub-component**

Add the import near the other component imports:

```tsx
import { BarcodeScanner } from './BarcodeScanner';
import { isValidEan, type OFFSearchResult } from '@/lib/openfoodfacts';
import { useBarcodeLookup } from '../hooks';
```

(Note: `getProductByBarcode` is reached only through `useBarcodeLookup` — do
NOT import it here directly, or eslint flags an unused import.)

Add this sub-component at the bottom of the file (same file, after
`OFFSearchPanel`):

```tsx
interface BarcodeTabProps {
  onResolved: (result: OFFSearchResult) => void;
}

function BarcodeTab({ onResolved }: BarcodeTabProps) {
  const { t } = useTranslation('ingredientes');
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState('');
  const [notFound, setNotFound] = useState(false);
  const lookup = useBarcodeLookup();

  async function resolve(code: string) {
    setNotFound(false);
    setScanning(false);
    const result = await lookup.mutateAsync(code).catch(() => null);
    if (result) onResolved(result);
    else setNotFound(true);
  }

  return (
    <div className="space-y-3">
      {scanning ? (
        <BarcodeScanner
          onDetected={(code) => {
            void resolve(code);
          }}
        />
      ) : (
        <Button type="button" variant="outline" className="w-full" onClick={() => setScanning(true)}>
          {t('barcode.startScan')}
        </Button>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor="barcode-manual">{t('barcode.manualLabel')}</Label>
          <Input
            id="barcode-manual"
            inputMode="numeric"
            placeholder="5000112637922"
            value={manual}
            onChange={(e) => setManual(e.target.value.replace(/\D/g, ''))}
          />
        </div>
        <Button
          type="button"
          disabled={!isValidEan(manual) || lookup.isPending}
          onClick={() => void resolve(manual)}
        >
          {lookup.isPending ? t('barcode.looking') : t('barcode.lookup')}
        </Button>
      </div>

      {notFound && <p className="text-sm text-muted-foreground">{t('barcode.notFound')}</p>}
    </div>
  );
}
```

Ensure `Label` is imported in the file (the manual tab already imports `Input`;
add `import { Label } from '@/components/ui/label';` if absent).

- [ ] **Step 5: Disable the dialog's submit guard for the barcode tab**

The dialog's submit button is currently disabled with
`(!isEdit && tab === 'off' && !pickedOFF)`. The barcode flow switches to the
`manual` tab on resolve, so no change is needed — but confirm the guard does not
also block `tab === 'barcode'` (it shouldn't, since the user is moved to
`manual`). No code change expected; verify by reading the `disabled={...}` prop.

- [ ] **Step 6: Typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: PASS; the `zxing` chunk appears in the build output (Task 7 names it).

- [ ] **Step 7: Commit**

```bash
git add src/features/ingredients/components/IngredientDialog.tsx
git commit -m "feat(ingredients): wire barcode scan tab into IngredientDialog"
```

---

## Task 6: i18n — rename keys + add `barcode.*` (ES + EN)

**Files:**
- Modify: `src/i18n/es/ingredientes.json`
- Modify: `src/i18n/en/ingredientes.json`

- [ ] **Step 1: ES — replace the `tabs` block and add `barcode`**

In `src/i18n/es/ingredientes.json`, replace:

```json
  "tabs": {
    "off": "Buscar (OpenFoodFacts)",
    "manual": "Manual",
    "imported": "Importado",
    "importedSoon": "Próximamente — escáner de código de barras"
  },
```

with:

```json
  "tabs": {
    "off": "Buscar (OpenFoodFacts)",
    "manual": "Manual",
    "barcode": "Código de barras"
  },
  "barcode": {
    "startScan": "Escanear con la cámara",
    "aimHint": "Apunta al código de barras dentro del recuadro.",
    "cameraError": "No se pudo acceder a la cámara. Escribe el código abajo.",
    "manualLabel": "Código de barras (EAN/UPC)",
    "lookup": "Buscar",
    "looking": "Buscando…",
    "notFound": "No está en OpenFoodFacts — pasa a Manual para introducirlo a mano."
  },
```

- [ ] **Step 2: EN — mirror it**

In `src/i18n/en/ingredientes.json`, replace the matching `tabs` block with:

```json
  "tabs": {
    "off": "Search (OpenFoodFacts)",
    "manual": "Manual",
    "barcode": "Barcode"
  },
  "barcode": {
    "startScan": "Scan with camera",
    "aimHint": "Aim at the barcode inside the box.",
    "cameraError": "Couldn't access the camera. Type the code below.",
    "manualLabel": "Barcode (EAN/UPC)",
    "lookup": "Look up",
    "looking": "Looking up…",
    "notFound": "Not in OpenFoodFacts — switch to Manual to enter it by hand."
  },
```

(Use the existing EN `tabs.off` / `tabs.manual` strings already in the file —
verify the exact wording and keep it; only the `imported`/`importedSoon` keys
are removed and `barcode` added.)

- [ ] **Step 3: Verify no other code references the removed keys**

Run: `git grep -n "tabs.imported\|importedSoon"`
Expected: zero matches after Task 5 (the dialog no longer references them). If
any remain, fix them.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/es/ingredientes.json src/i18n/en/ingredientes.json
git commit -m "feat(i18n): barcode tab strings (ES + EN); drop imported placeholder keys"
```

---

## Task 7: Code-split `@zxing/browser`

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Add the manualChunks entry**

In `vite.config.ts`, inside `build.rollupOptions.output.manualChunks`, add a
`zxing` entry alongside `recharts`:

```ts
        manualChunks: {
          recharts: ['recharts'],
          zxing: ['@zxing/browser'],
          supabase: ['@supabase/supabase-js'],
          // …rest unchanged…
        },
```

(`@zxing/browser@0.2.0` bundles its own decoder core — there is no separate
`@zxing/library` package to list.)

This keeps ZXing out of the first-paint bundle; it loads only when an iOS-Safari
user taps "Scan" (the `import()` in Task 4 already makes it lazy — the
manualChunks entry just names the chunk for clarity in the build output).

- [ ] **Step 2: Build, confirm the chunk**

Run: `pnpm build`
Expected: PASS; build output lists a `zxing-*.js` chunk separate from the main
bundle.

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "build: code-split @zxing/browser into its own chunk"
```

---

## Task 8: Tier-2 component test for the barcode tab

**Files:**
- Create: `src/features/ingredients/components/BarcodeScanner.test.tsx`

Mock `BarcodeScanner` is hard to camera-test in jsdom; instead test the
`BarcodeTab`'s manual-entry + lookup → prefill path by exporting `BarcodeTab` (or
testing through the dialog). Simplest: test the dialog with the camera stubbed.
We test the **manual EAN → resolve** path, which is the deterministic half.

- [ ] **Step 1: Export `BarcodeTab` for testing**

In `IngredientDialog.tsx`, change `function BarcodeTab` to
`export function BarcodeTab` so the test can mount it in isolation.

- [ ] **Step 2: Write the test**

Create `src/features/ingredients/components/BarcodeScanner.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@/i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';

// IngredientDialog transitively imports @/lib/supabase — stub it.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

// Stub the camera component so jsdom never touches getUserMedia.
vi.mock('./BarcodeScanner', () => ({
  BarcodeScanner: () => <div data-testid="scanner-stub" />,
}));

// Mock the lookup hook to a controllable mutateAsync.
const mutateAsync = vi.fn();
vi.mock('../hooks', async (orig) => {
  const actual = await orig<typeof import('../hooks')>();
  return { ...actual, useBarcodeLookup: () => ({ mutateAsync, isPending: false }) };
});

import { BarcodeTab } from './IngredientDialog';

function renderTab(onResolved = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <BarcodeTab onResolved={onResolved} />
    </QueryClientProvider>,
  );
  return { onResolved };
}

beforeEach(async () => {
  mutateAsync.mockReset();
  await i18n.changeLanguage('es');
});

describe('BarcodeTab (Tier-2)', () => {
  it('keeps lookup disabled for an invalid EAN', async () => {
    const user = userEvent.setup();
    renderTab();
    await user.type(screen.getByLabelText(i18n.t('ingredientes:barcode.manualLabel')), '12345');
    expect(
      screen.getByRole('button', { name: i18n.t('ingredientes:barcode.lookup') }),
    ).toBeDisabled();
  });

  it('resolves a valid EAN and calls onResolved with the OFF result', async () => {
    const user = userEvent.setup();
    const result = {
      code: '5000112637922', name: 'Coca-Cola', brand: 'Coca-Cola',
      thumbnailUrl: null, kcalPer100g: 42, proteinPer100g: 0,
      carbsPer100g: 10.6, fatPer100g: 0, fiberPer100g: 0,
    };
    mutateAsync.mockResolvedValue(result);
    const { onResolved } = renderTab();
    await user.type(
      screen.getByLabelText(i18n.t('ingredientes:barcode.manualLabel')),
      '5000112637922',
    );
    await user.click(screen.getByRole('button', { name: i18n.t('ingredientes:barcode.lookup') }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith('5000112637922'));
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith(result));
  });

  it('shows "not found" when lookup resolves null', async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue(null);
    renderTab();
    await user.type(
      screen.getByLabelText(i18n.t('ingredientes:barcode.manualLabel')),
      '5000112637922',
    );
    await user.click(screen.getByRole('button', { name: i18n.t('ingredientes:barcode.lookup') }));
    await waitFor(() =>
      expect(screen.getByText(i18n.t('ingredientes:barcode.notFound'))).toBeTruthy(),
    );
  });
});
```

- [ ] **Step 3: Run the test**

Run: `pnpm vitest run src/features/ingredients/components/BarcodeScanner.test.tsx`
Expected: PASS (3 cases). If the `useBarcodeLookup` partial-mock errors because
`../hooks` has side-effectful imports, fall back to mocking the whole module with
explicit stubs for the few hooks `BarcodeTab` + its render tree use
(`useBarcodeLookup`).

- [ ] **Step 4: Commit**

```bash
git add src/features/ingredients/components/BarcodeScanner.test.tsx src/features/ingredients/components/IngredientDialog.tsx
git commit -m "test(ingredients): Tier-2 barcode manual-lookup path"
```

---

## Task 9: Docs — R-20 + changelog + feature note

**Files:**
- Modify: `docs/roadmap.md`
- Modify: `docs/changelog.md`
- Modify: `docs/features.md`

- [ ] **Step 1: Roadmap R-20 entry**

Add the index line after R-19:

```markdown
- R-20 — Barcode scanning for ingredient import (camera + manual EAN → OFF lookup)
```

And the block after the R-19 block:

```markdown
## R-20 — Barcode scanning for ingredient import
- **decision:** (none — promotes the deferred "barcode-import" product idea in features.md)
- **blocked-by:** —
- **status:** done (2026-05-21) — camera scan (native BarcodeDetector
  fast-path + lazy @zxing/browser fallback) and manual EAN entry, both
  resolving through the new `getProductByBarcode` OFF v2 adapter into the
  existing IngredientDialog prefill flow. Client-only; no migration.
- **plan:** `docs/superpowers/plans/2026-05-21-barcode-scanning.md`
- **scope:** `getProductByBarcode` + `isValidEan` on `lib/openfoodfacts.ts`
  (Tier-1 tested); `BarcodeScanner` component (EAN-13/8/UPC-A/E only);
  `BarcodeTab` in IngredientDialog reusing the OFF `pickedOFF`→`setForm`
  path; ES+EN i18n; `@zxing/browser` code-split. Tier-2 test on the manual
  lookup path; real-camera integration deferred (manual device smoke per
  release).
```

- [ ] **Step 2: Changelog line**

Add a dated entry at the top of the dated section in `docs/changelog.md`:

```markdown
### 2026-05-21 — R-20 Barcode scanning

- Camera + manual-EAN barcode lookup in the New Ingredient dialog, resolving via the new OFF v2 `getProductByBarcode` adapter into the existing prefill flow. Native `BarcodeDetector` fast-path with a lazy `@zxing/browser` fallback (iOS Safari); EAN-13/8/UPC-A/E only. Client-only, no migration.
```

- [ ] **Step 3: features.md — flip the product idea to shipped**

Find the "barcode-import tab is a disabled placeholder (a future product idea)"
sentence in `docs/features.md` (Ingredients section) and update it to describe
the shipped behavior:

```markdown
The Create Ingredient modal has three tabs: an OpenFoodFacts text search, a
manual-entry form, and a **barcode** tab (camera scan via the native
BarcodeDetector with a ZXing fallback, plus a manual EAN/UPC field) that looks
the product up in OpenFoodFacts and prefills the manual form.
```

- [ ] **Step 4: Commit**

```bash
git add docs/roadmap.md docs/changelog.md docs/features.md
git commit -m "docs(R-20): roadmap + changelog + features note for barcode scanning"
```

---

## Validation (run before declaring done)

- [ ] `pnpm typecheck` — 0 errors.
- [ ] `pnpm lint` — 0 errors (pre-existing warnings OK).
- [ ] `pnpm test` — all green (new Tier-1 `openfoodfacts.test.ts` + Tier-2 `BarcodeScanner.test.tsx`).
- [ ] `pnpm build` — succeeds; a `zxing-*.js` chunk is emitted separately.
- [ ] Manual smoke (dev, real device — one Android Chrome + one iOS Safari):
      open New Ingredient → Barcode tab → "Scan", point at a real product
      barcode → form prefills with the OFF product → save. Then repeat with a
      manually typed EAN. Confirm a bogus EAN shows "not found" and the camera
      indicator turns off when the dialog closes.

## Ship flow

Per the new D-F7 flow: this is a feature branch `claude/barcode-scanning` →
PR into `develop` → CI → auto-merge → soak on the develop Vercel preview →
promote to `main` via a `release/*` PR. No staged migration, so there is no
Wave-3 prod-apply step.

## Notes / risks (carried from the investigation)

- **iOS Safari** has no `BarcodeDetector` (as of 2026) → always exercises the
  ZXing path there; `playsInline` + `muted` + `facingMode: { ideal: ... }` are
  mandatory (already in Task 4).
- **False positives:** decoder is scoped to EAN-13/8/UPC-A/E and every decode is
  re-validated by `isValidEan` before the network call.
- **OFF data gaps:** many EU products lack `energy-kcal_100g`; `getProductByBarcode`
  returns `null` for those, surfacing the "not found — switch to Manual" message
  rather than prefilling zeros.
- **Camera teardown:** the `BarcodeScanner` cleanup stops all `MediaStreamTrack`s
  on unmount so the OS camera indicator clears when the dialog closes.
