# Whole-foods seed (F-1)

Uses the USDA FoodData Central REST API (SR Legacy data). Get a free key at
https://api.data.gov/signup and export it as `FDC_API_KEY`.

1. Curate `foods.json` — one entry per food: a `query` (FDC search term, generic
   *raw/dry* form, e.g. "rice white long-grain raw"), `name_es`, `name_en`,
   `category`. Leave `fdc_id` unset.
2. Resolve ids: `pnpm whole-foods:resolve` — fills `fdc_id` + `fdc_description`
   from the FDC search endpoint (skips entries already resolved). **Review the
   `fdc_description` values** — fix the `query` and re-run for any bad match.
3. Build the seed: `pnpm whole-foods:build` — fetches per-100 g nutrients for the
   pinned ids and writes the migration. Fails loudly if any entry lacks an
   `fdc_id` or any food lacks energy.
4. Spot-check ~10 generated rows against the FDC web entries, then commit
   `foods.json` + the migration.
