# Full-Catalog Review of the 469 Never-Reviewed Exercises — design spec

**Status: DESIGN APPROVED (2026-06-06).** Ready for an implementation plan.
Short spec. **Folds under R-27 (Project B)** — no new R-id/D-id.

Follow-on to **Project B1** (`2026-06-04-catalog-ingestion-project-b1-design.md`)
and its post-import review (#160). B1 ingested 873 exercises; #160 reviewed the
**404 low-confidence (flagged)** rows and promoted 402 to `is_verified=true`.
This spec covers the **remaining 469 never-reviewed rows** so the whole catalog
is curated. Branches off `develop` (worktree `catalog-full-review`, off
`origin/develop` @ `8658003`).

---

## 1. Goal

Review every catalog row B1's linter never flagged, so the entire 873-exercise
pool is human-(judge-)reviewed. Promote correct primary tags to
`is_verified=true`; correct wrong ones. `is_verified` is **only a picker sort
signal** (verified-first ordering), not a visibility gate, and there are no prod
users yet — so this is completeness polish, not a critical fix.

## 2. Scope — 469 rows (verified 2026-06-06 against `origin/develop`)

`873 total − 404 flagged (keys of `ingest-report.csv`) = **469 never-reviewed`.

**By category:** strength 317, stretching 96, plyometrics 22, powerlifting 12,
cardio 11, olympic weightlifting 9, strongman 2.

**By coarse primary (top):** quadriceps 83, shoulders 59, biceps 53, hamstrings
42, lats 33, middle back 30, calves 28, triceps 25, chest 24, glutes 22, …

Every row has exactly one coarse primary (the dataset tags even
stretching/cardio with a target muscle → 0 empty primaries). **Stretching is
INCLUDED** (user-confirmed 2026-06-05) — it goes in the low-risk bulk pass.

## 3. Method — Option C (tiered, mirrors #160's workflow)

Two tiers, partitioned deterministically by running the **exact shipped mapper**
(`build-seed.ts`) over the 469 rows at build-input time:

### 3a. Deep pass — 144 elevated-risk rows (3 lenses + tiebreak)

`{chest, shoulders, triceps, abdominals}` coarse primaries (**115**) ∪
`{olympic weightlifting, plyometrics, strongman}` categories (**33**); 4 overlap
→ **144** union.

- **Why these:** the four ambiguous coarse codes disambiguate to a fine code by
  fixed-precedence name keyword (README §7) — an earlier keyword wins even when a
  later one is more correct ("lateral" tested before "rear"), so a
  *confident-but-wrong* fine tag ships **without tripping `ambiguous_default`**
  (it hit a branch, not the fallback). This is exactly the failure class #160
  found (wrong delt head, chest-vs-triceps, abs_upper-vs-abs_lower). The
  olympic/plyo/strongman rows are `full_body` candidates the mapper cannot emit.
- **3 diverse lenses** (per row, independent):
  (a) **prime-mover anatomist** — what muscle does the most concentric work;
  (b) **skeptic** hunting README's confident-but-wrong patterns (wrong delt
  head, chest↔triceps, obliques-hiding-as-abs, Olympic→full_body);
  (c) **heatmap volume-attribution** — what shading best serves the heatmap.
- **Tiebreak** agent only when the three disagree.

### 3b. Bulk-confirm pass — 325 low-risk rows (single pass)

The 1:1 coarse→fine maps (biceps→biceps, quads→quad codes, lats→…) + all
stretching. One confirm pass per batch — don't spend 3 agents confirming a curl
is biceps. Any row a bulk agent flags as wrong escalates to a deep-pass review.

## 4. Deliverable — same mechanism as #160

- **Corrections** → extend `scripts/exercise-catalog/primary-overrides.json`
  (`{external_id: [fine_code,…]}`), validated by `build-seed.ts` (fails on stale
  id / unknown code), then **regenerate** the seed migration
  (`20260604120200_b1_catalog_seed.sql`) so re-imports reproduce them.
- **Newly-confirmed-correct rows** → `is_verified=true` via a **new** review
  migration `2026060X120000_catalog_full_review.sql` (idempotent, guarded
  `source='free-exercise-db'`), mirroring `20260605120000_b1_catalog_review.sql`.
  Held/ambiguous rows stay `is_verified=false`.
- **pgTAP** `05_muscles.test.sql`: bump the verified-count assertion from **402**
  to the new total (402 + confirmed-correct from this pass); add 1–2 spot asserts
  for notable corrections, as #160 did.

## 5. Verification

- Build-input + mapper run reproducible from
  `scripts/exercise-catalog/exercises.json` (873) + the 404 flagged ids; no
  dependence on ephemeral `/tmp` scratch.
- `corepack pnpm lint` + `build` + `test` green (build-seed unit tests cover the
  override validation).
- **Local DB verify** (needs **Docker Desktop running** — was down 2026-06-05):
  `supabase --workdir <worktree> start` + `supabase test db` → migration applies,
  trigger accepts any new full_body/obliques/tibialis primaries, pgTAP green.
  CI `db-test` is the merge gate either way.
- PR → `develop`, auto-merge (squash) gated on CI incl. `db-test`.

## 6. Out of scope

- The 404 already-reviewed rows (#160) — not re-litigated.
- B2 (exercise detail UI: instructions + images).
- Picker filters beyond the existing group-level muscle filter.
- Multi-primary promotion of secondaries (B1 accepts single-primary import).

## 7. Decisions (resolved 2026-06-06)

1. **Bulk-pass confidence:** **per-batch single pass**, with per-row escalation
   to the deep pass on any flag (cheaper; sufficient for 1:1 maps + stretching).
2. **Deep-pass tiebreak threshold:** promote on **2-of-3** lens agreement; a true
   3-way split **holds** the row at `is_verified=false`.
3. **R-id / D-id:** **none new — folds under R-27 (Project B).** The review
   migration and overrides extend B1's existing artifacts; update the R-27
   roadmap entry and changelog at ship time rather than filing a new id.
