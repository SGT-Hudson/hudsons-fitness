# OFF Contribute-Back — Design Spec (R-21)

> Status: **FOR REVIEW** (2026-05-21). Brainstormed from the R-21 sketch in
> `docs/roadmap.md`. On approval this becomes a `writing-plans` implementation
> plan. Builds on R-20 (barcode scanning) and R-01 (the library/PII model).

## 1. Goal & non-goals

**Goal:** grow Open Food Facts' (thin) Spanish coverage by giving back — when a
Hudson Fitness user creates or completes a **barcode-identified** product that
OFF lacks, push that objective product data to OFF so the next person who scans
it (here or in any OFF client) gets a match. This is the only coverage-growth
lever that fits the app's open-data model: commercial barcode DBs forbid
persisting their data (incompatible with our permanent public pool), whereas
OFF is ODbL (store + redistribute allowed, share-alike).

**In scope (two triggers, both barcode-only):**
1. **New product** — user scanned an EAN, OFF returned 404, user creates the
   ingredient → contribute the whole product.
2. **Completion** — user scanned an EAN, OFF had the product but with missing
   macros (the R-20 lenient path), user fills the blanks → contribute *only the
   fields OFF still has blank*.

**Non-goals (v1):**
- Contributing non-barcode foods (hand-typed "lentil stew" has no EAN — nowhere
  to go in OFF).
- Product-image upload (we don't capture a product photo yet).
- Per-user OFF accounts / OAuth linking.
- Correcting or overwriting values OFF already holds (we only fill blanks).

## 2. Architectural guardrails (inherited, non-negotiable)

- **PII firewall (R-01):** the per-user `user_ingredient_refs.note` is *never*
  in a contribution payload. Only objective product fields leave the app
  (barcode, name, brand, per-100g macros).
- **No secrets in the client (public repo):** the OFF account credentials live
  only in Supabase Vault and are used only by an edge function. The browser
  never sees them.
- **Metric-only:** OFF nutriments are per-100 g; we contribute only gram-based
  ingredients (see §6).

## 3. Prerequisite — retain the scanned barcode through the create path

Today the R-20 404 path drops the EAN: it shows a "not found" message, and if
the user fills the manual form the save goes through `createManualIngredient`,
which writes `source: 'manual'` with **no `external_id`**. Contribution needs
the EAN, so this must change:

- On a 404, **stash the scanned barcode in dialog state** and auto-switch to the
  manual tab (with the short banner, §4).
- Add an optional `barcode?: string` to `ManualIngredientInput`;
  `createManualIngredient` persists it as `external_id` (provenance stays
  `source: 'manual'` — `source` tracks where the *data* came from, `external_id`
  is the product identity).
- **Side-benefit:** the existing `unique(source, external_id)` constraint now
  dedupes repeat scans of the same unknown product (today's manual rows have
  `external_id = null` and never dedupe). Re-scanning recovers the existing row.

The **completion** trigger already retains the EAN — that path saves via
`importIngredientFromOFF` with `source: 'openfoodfacts', external_id = code`,
and the user's filled-in macros arrive as `overrides`.

## 4. Consent & UX

**Consent is a single profile-level preference, not a per-form control** (a
per-save checkbox would clutter a form for a setting that rarely changes).

- New column `profiles.contribute_to_off boolean not null default true`
  (synced + DB-canonical, consistent with how `profile.language` is handled;
  the right default for a "may my data leave the app" privacy toggle). This is
  the one schema change R-21 introduces — a small **staged** migration
  (Wave-3 discipline, like every other migration).
- **SettingsPage** gets a Privacy/Data card with a toggle bound to that column,
  **default on**, ES + EN labels.
- The client **gates on this flag**: when off, it simply skips the
  `off-contribute` call. (The flag is the single source of truth; no per-item
  consent state.)

**Contextual banners** on the barcode→manual transition (short — they explain
*why the user is typing*, nothing more). ES + EN, `ingredientes` namespace:
- **New (404):** EN "Not in Open Food Facts yet. Add its details so others can
  scan it later." / ES "Aún no está en Open Food Facts. Añade sus datos para que
  otros puedan escanearlo después."
- **Completion:** EN "Some values are missing. Fill them in to complete it." /
  ES "Faltan algunos datos. Complétalos para terminar la ficha."

An OFF attribution credit (consuming OFF data is ODbL-attribution-required)
goes in the create dialog footer / an About section.

## 5. Architecture & flow

- **Single app-owned OFF account.** Credentials in Supabase Vault (same pattern
  as the cron service-role key). All contributions appear under this one OFF
  identity.
- **New edge function `off-contribute`** (Deno + TS, mirrors the existing edge
  functions). It holds no logic the client can't see except the credentials and
  the OFF write call. Contract — client POSTs:
  ```
  { barcode: string, name: string, brand: string | null,
    kcalPer100g, proteinPer100g, carbsPer100g, fatPer100g, fiberPer100g,
    mode: 'new' | 'complete' }
  ```
- **Fire-and-forget, silent.** The client calls `off-contribute` *after* the
  local ingredient save succeeds, and does not await or surface the result. A
  contribution failure is a non-event — the user's ingredient is already saved;
  we never block, toast, or error on it. (The edge fn logs failures
  server-side for our own visibility.)
- **Client gating:** call `off-contribute` only when **all** hold: the profile
  flag is on, the row has a checksum-valid `external_id` (barcode), and the
  payload passes the eligibility gate (§6).

## 6. Quality gate (pure, tested) + completion semantics

A pure helper (`src/core/offContribute.ts` — pure/tested, per the core vs lib
split) decides eligibility — deterministic, Vitest-covered:

- Contribute only if **all**: `name` present **and** `kcalPer100g > 0` **and**
  the **Atwater check** passes (`4·protein + 4·carbs + 9·fat` within ±20% of
  `kcalPer100g`) **and** `unit_type === 'gram'` (per-100g; `unit`-based products
  like "per egg" don't map to OFF's per-100g model and are skipped).
- Below the bar → save the ingredient locally as normal, **skip the push
  silently**.

**Completion (`mode: 'complete'`) is fill-missing-only, enforced server-side.**
The edge function re-fetches the live OFF product and writes **only the
nutriment fields OFF currently has blank** — it never overwrites a value OFF
already holds. (Re-fetching server-side is authoritative; the client's view of
"what was blank" could be stale.) `mode: 'new'` writes all fields.

A per-day write cap on the single account guards against runaway/abuse;
exceeding it skips silently.

## 7. OFF write endpoint & data mapping

- **Endpoint:** v1 write API `POST https://world.openfoodfacts.org/cgi/product_jqm2.pl`.
  *Impl-time task:* confirm whether OFF now recommends the v3 write endpoint and
  switch if so.
- **Field mapping** (our per-100g → OFF write params), with
  `nutrition_data_per=100g`:
  - `code` ← barcode
  - `product_name` ← name; `brands` ← brand
  - `nutriment_energy-kcal` ← kcalPer100g
  - `nutriment_proteins` ← proteinPer100g
  - `nutriment_carbohydrates` ← carbsPer100g
  - `nutriment_fat` ← fatPer100g
  - `nutriment_fiber` ← fiberPer100g
- A small pure mapper (our shape → OFF param object) is Tier-1 tested.

## 8. Testing & rollout

- **Tier-1 Vitest** on the two pure pieces: the eligibility/Atwater gate (pass,
  fail-each-condition, gram-only) and the field mapper.
- The edge function's network write is **not** unit-tested (same stance as the
  other edge fns).
- **Manual smoke against OFF's staging server** (`world.openfoodfacts.net`)
  before pointing the edge fn at production — verify a new product appears and a
  completion fills only blanks.
- **Migration** (`profiles.contribute_to_off`) is staged, applied at the Wave-3
  checkpoint per the standard discipline.

## 9. Files touched (decomposition preview for the plan)

- `supabase/migrations/<ts>_r21_profiles_contribute_to_off.sql` — staged column.
- `src/types/database.ts` — add the column (interim hand-edit).
- `src/features/ingredients/api.ts` — `barcode?` on `ManualIngredientInput`;
  thread `external_id` in `createManualIngredient`.
- `src/features/ingredients/components/IngredientDialog.tsx` — on 404, stash the
  barcode + auto-switch to manual + show the new banner; remove the (never-built)
  per-form checkbox idea.
- `src/core/offContribute.ts` (+ test) — eligibility gate + OFF payload mapper.
- `src/lib/offContribute.ts` (client) — call the edge fn (gated, fire-and-forget).
- `supabase/functions/off-contribute/index.ts` — the Vault-credentialed writer;
  `mode: 'complete'` re-fetch + fill-missing-only.
- `src/pages/SettingsPage.tsx` + `src/features/profile/*` — the toggle.
- `src/i18n/{es,en}/ingredientes.json` + `settings.json` — banners + toggle label.
- `docs/operations.md` — Wave-3 list + the OFF-account/Vault setup runbook;
  `docs/changelog.md`, `docs/roadmap.md` (flip R-21 from sketch).

## 10. Open items (resolve at implementation time)

1. v1 vs v3 OFF write endpoint (confirm current OFF recommendation).
2. OFF contributor account creation + the exact auth params `product_jqm2.pl`
   expects (user/password vs an app token); store in Vault.
3. The per-day write cap value.
4. Whether OFF's write requires a specific `User-Agent` (OFF asks API clients to
   identify themselves) — set a "HudsonFitness/<version>" UA on the edge fn.
