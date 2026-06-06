# Exercise catalog seed (Project B1)

Ingests the public-domain **free-exercise-db** (`yuhonas/free-exercise-db`,
Unlicense) into our shared `exercises` pool. Dev-only build — NOT run in CI; the
committed artifacts (the generated seed migration, `es-names.json`,
`primary-overrides.json`, and `ingest-report.csv`) are what gets reviewed and shipped.

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
   `exercises.json`, `es-names.json`, `primary-overrides.json`, `ingest-report.csv`,
   and the migration.

**Post-import muscle-tag review.** The catalog has been fully judge-reviewed in
two passes. Pass 1 (#160) reviewed the 404 low-confidence rows the linter flagged
(256 confirmed correct, 146 corrected, 2 held ambiguous). Pass 2 (full-catalog)
then reviewed the 469 never-flagged rows (428 confirmed, 39 corrected, 2 held) —
so the whole 873-row pool is now reviewed. The combined 185 corrections live in
`primary-overrides.json` — `{ "<external_id>": ["<fine_code>",
…] }` that **replaces** the mapper's `primary_muscles` for that row (secondary
codes are always mapper-derived). `build-seed.ts` validates every override id
against the dataset and every code against the fine taxonomy, fails the build on a
stale entry, and records the applied override in the report's `override` column.
This is the home for tags the coarse→fine mapper **cannot** emit at all —
`obliques` (twists, side bends, windmills), `full_body` (Olympic lifts, cleans,
snatches), `tibialis` — plus the mapper's keyword-ordering misses. Because the
seed migration was already merged + applied, the live promotion of the 869
reviewed-correct rows to `is_verified=true` **and** the corrections to envs that
already ran the old seed ship in separate review migrations
(`20260605120000_b1_catalog_review.sql` for pass 1,
`20260606120000_catalog_full_review.sql` for pass 2); the override map keeps a
fresh `db reset` in sync.

**Idempotency note.** The seed upserts on `external_id` via a PARTIAL unique
index (`idx_exercises_external_id … where external_id is not null`). The
generated `on conflict (external_id) where external_id is not null do update`
repeats that predicate so Postgres can infer the partial index — re-running the
seed updates in place (`INSERT 0 873`) and never duplicates. The upsert
deliberately does NOT touch `is_verified` / `source` / `created_by_user_id`, so
operator-promoted `is_verified=true` rows survive a re-import. (It DOES re-derive
`primary_muscles` from the mapper + `primary-overrides.json`, so corrections
survive a re-import only because they live in the override map.)

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
