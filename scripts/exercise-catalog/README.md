# Exercise catalog seed (Project B1)

Ingests the public-domain **free-exercise-db** (`yuhonas/free-exercise-db`,
Unlicense) into our shared `exercises` pool. Dev-only build — NOT run in CI; the
committed artifacts (the generated seed migration, `es-names.json`, and
`ingest-report.csv`) are what gets reviewed and shipped.

**Dataset pin:** `exercises.json` is vendored from
`cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@b0eed061e1c832b3ed815fbaa4b45b3cdc14df49/dist/exercises.json`.
Images are served from the same SHA via jsDelivr; only relative paths are stored
(`exercises.images text[]`), and the full URL is built by the B2 helper:
`https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@b0eed061e1c832b3ed815fbaa4b45b3cdc14df49/exercises/<path>`.

1. Vendor the dataset at a pinned SHA into `exercises.json` (873 records). Record
   the SHA here, in `build-seed.ts` `PINNED_SHA`, and as the image-URL base.
2. Generate/maintain `es-names.json` — `{ "<dataset id>": "<name_es>" }`, same
   keys as the dataset. LLM-assisted, operator-reviewed. A record with no ES
   entry is **flagged** (`es_missing`) by the linter and falls back to the English
   name for `name_es` — it is NOT silently shipped; fill it and re-run.
3. Build: `pnpm exercises:build` — runs the pure mapper (§7), the low-confidence
   linter (§8), writes `ingest-report.csv`, and emits the idempotent seed
   migration `supabase/migrations/20260604120200_b1_catalog_seed.sql`.
4. Review `ingest-report.csv` (the low-confidence subset only — ambiguous
   defaults, big compounds, curl-without-biceps, empty primaries, missing ES).
   Fix inputs and re-run as needed. Spot-check ~10 generated rows, then commit
   `exercises.json`, `es-names.json`, `ingest-report.csv`, and the migration.

**Idempotency note.** The seed upserts on `external_id` via a PARTIAL unique
index (`idx_exercises_external_id … where external_id is not null`). The
generated `on conflict (external_id) where external_id is not null do update`
repeats that predicate so Postgres can infer the partial index — re-running the
seed updates in place (`INSERT 0 873`) and never duplicates. The upsert
deliberately does NOT touch `is_verified` / `source` / `created_by_user_id`, so
operator-promoted `is_verified=true` rows survive a re-import.

**Mapper accuracy caveat.** The four ambiguous coarse codes (chest/shoulders/
triceps/abdominals) disambiguate by name keyword in a fixed precedence order
(§7). A name that matches an earlier keyword wins even if a later one is more
correct (e.g. "lateral" is tested before "rear"), so a confident-but-wrong fine
tag can ship. These rows do NOT trip `ambiguous_default` (they hit a branch, not
the else-default) and so are not necessarily in `ingest-report.csv` — they ride
the general `is_verified=false` review flow instead. Accepted per §7/§8.

Mapper + linter logic is pure and unit-tested in `build-seed.test.ts` (Tier-1,
the only automated gate on `scripts/**`). `scripts/**` is not typechecked or
linted by the repo's `pnpm typecheck`/`pnpm lint`.
