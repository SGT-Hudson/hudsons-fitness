# Doc-Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate all project docs into a single AI-navigable `docs/` folder (lean `CLAUDE.md` router + 8 on-demand shards + immutable `decisions.md` / mutable `roadmap.md`), built from the completed 34-item conventions review, then delete the superseded source docs.

**Architecture:** Single source of truth. `CLAUDE.md` is an always-loaded ~1-screen router; eight `docs/*.md` shards are read on demand. `decisions.md` is an append-only log of the 34 rulings (IDs `D-A1…D-F6`) with their *Why*; `roadmap.md` is the mutable backlog (IDs `R-00…`) of un-built work, cross-linked by ID. Reference shards describe current reality and flag decided-but-unbuilt changes with `⚠ Changing — R-xx`.

**Tech Stack:** Markdown only. No code changes except `CLAUDE.md`, `README.md`, and a `supabase/README.md` stub. Git for commits. Memory files under `C:\Users\hudso\.claude\projects\C--Users-hudso-Desktop-Projectos-de-codigo-Hudson-Fitness\memory\`.

**Authoritative inputs (all in-repo, read them before starting):**
- `docs/superpowers/specs/2026-05-17-doc-rework-design.md` — the approved spec.
- `conventions-audit.md` — the 34 rulings + findings + action items + cross-refs (source for `decisions.md` and `roadmap.md`).
- `hudsons-fitness-architecture.md`, `HANDOFF.md`, `funcionalidades-excel-gym.md`, `supabase/README.md`, `CLAUDE.md`, `README.md` — migration sources.

**Global conventions for every shard:**
- First line: `# <Title>`. Second block: a `## Contents` bullet list of the file's own `##` headings (the in-file index).
- Cross-references by ID/anchor only: `D-F2`, `R-03`, `` `data-model.md#rls` `` — never "the section above".
- Decided-but-unbuilt changes get an inline blockquote at the relevant spot: `> ⚠ Changing — see R-xx (D-yy)`.
- Headings are stable (do not reword later; the router deep-links them).
- English only.

**Decision ID map (all 34 — use these exact IDs/titles in `decisions.md`):**

| ID | # | Title (ruling in one phrase) |
|---|---|---|
| D-A1 | 1 | Shared crowdsourced `ingredients` library — keep |
| D-A2 | 2 | `recipe_ingredients ON DELETE RESTRICT` — folded into ★ Library model |
| D-A3 | 3 | Soft recipe deletion — folded into ★ Library model |
| D-A4 | 4 | Ingredient duplicates tolerated — tech-debt, resolved by Phase-2 reaper |
| D-A5 | 5 | Past phases — grace-window (7d) + notes-editable-forever |
| D-A6 | 6 | `bone_kg` — remove entirely |
| D-A7 | 7 | `initial_weight_kg` read-only — confirmed (shipped, commit 999e58f) |
| D-A8 | 8 | `types/database.ts` — switch to generated |
| D-B1 | 9 | Protein — lean-mass, phase-aware code-constant table; canonical-fn refactor |
| D-B2 | 10 | Default protein 1.6 — REVERSED, superseded by D-B1 |
| D-B3 | 11 | Fat stored as fraction — confirm + centralize via shared helper |
| D-B4 | 12 | TDEE window — replace with adaptive Kalman model (own spec) |
| D-B5 | 13 | BMR Mifflin — keep as derived/never-stored display; drop 4 dead `tdee_estimates` cols |
| D-C1 | 14 | State mgmt — confirm + decision boundary + Zustand escape hatch |
| D-C2 | 15 | Forms — RHF + zod everywhere (migration) |
| D-C3 | 16 | Form types — implicitly reversed by D-C2 (`z.infer<>`) |
| D-C4 | 17 | Macros casing — snake_case DB end-to-end; camelCase for computed only |
| D-C5 | 18 | RPCs — confirm + hard threshold + SECURITY INVOKER invariant |
| D-D1 | 19 | Badge — reverse; adopt shadcn Badge component |
| D-D2 | 20 | Toasts fire from mutation-owning layer — confirm + tighten |
| D-D3 | 21 | High-frequency mutations toast on error only — confirm + 3-axis rule |
| D-D4 | 22 | Chart time-range pills — confirm as-is |
| D-D5 | 23 | Composition chart — full redesign (fat/lean stack + trends + %↔kg toggle) |
| D-D6 | 24 | Plan = default truth — confirm + single RPC + partial unique index + today-guard |
| D-E1 | 25 | i18n detection — wire `profile.language` authoritative |
| D-E2 | 26 | Stored content never auto-translated — keep; rationale documented |
| D-E3 | 27 | Metric-only / `profiles.units` — remove column |
| D-E4 | 28 | Language toggle — remove header switcher; Settings-only when authed |
| D-F1 | 29 | Lint/build gate + no test runner — add CI + tiered tests (spec-first) |
| D-F2 | 30 | Auto-merge — repo public + real branch protection + auto-merge (**done this session**) |
| D-F3 | 31 | Edge Deno+TS+`_shared/` — confirm + shared pure core + edge adapter |
| D-F4 | 32 | Cron UTC/DST — confirm single-TZ + record pre-specced multi-TZ path |
| D-F5 | 33 | Cron Vault auth — confirm + cron liveness alerting + ops runbook |
| D-F6 | 34 | Theme localStorage/FOUC — confirm + document the D-E1 contrast |

**Decision → roadmap map (which decisions have un-built work → R-id to assign).** Build these `R-` entries in `roadmap.md`; everything else is doc-only (no R-entry):

| R-id | Source decision(s) | Pending work | blocked-by |
|---|---|---|---|
| R-00 | D-A8, D-A6, D-E3, D-D6, D-F1 | Baseline current schema into `supabase/migrations/` (only 1 migration file exists; schema built via dashboard/MCP) | — |
| R-01 | D-A2, D-A3, D-A4 | ★ Library Contribution & Lifecycle Model — Phase 1 migration (pool/reference tables, backfill, RLS rewrite, anon id, delete-account rework); Phase 2 reaper | R-00 |
| R-02 | D-A5 | Phase grace-window (7d) + notes-editable-forever in `ObjetivosPage` | — |
| R-03 | D-A6 | Drop `profiles.bone_kg`; purge `estimateBoneKg`, onboarding/settings inputs, `isProfileOnboarded` gate, i18n | R-00 |
| R-04 | D-A8 | Switch to generated `types/database.ts`; document regen command | R-00 |
| R-05 | D-B1, D-B2 | Protein refactor: canonical-fn owns rule, phase-aware lean-mass table, fallback const, visible basis in UI | — |
| R-06 | D-B3 | `fractionToPct`/`pctToFraction` helper; refactor 3 inline sites; verify/add DB CHECK | — |
| R-07 | D-B4 | TDEE adaptive-Kalman model — **own design spec first**, then schema + rewrite `recalculate-tdee` | — |
| R-08 | D-B5 | Drop 4 dead `tdee_estimates` cols; wire `mifflinStJeor` as derived "Estimated BMR" display | R-00 |
| R-09 | D-C2, D-C3 | RHF + zod migration across ~6–8 forms; co-located schemas; carries D-F1 Tier-2 tests | — |
| R-10 | D-D1 | Add `src/components/ui/badge.tsx`; refactor 4 inline sites; update docs | — |
| R-11 | D-D5 | Composition-chart redesign: fat/lean 100% stack + muscle/water trend charts + local %↔kg toggle | — |
| R-12 | D-D6 | `materialize_plan_for_date` RPC + partial unique index + `date<=today` guard; delete client/edge mirrors | R-00 |
| R-13 | D-E1 | `AuthProvider` profile→i18n sync effect | — |
| R-14 | D-E3 | Drop `profiles.units`; purge from types | R-00 |
| R-15 | D-E4 | Remove `LanguageSwitcher` from `AppLayout`; keep pre-auth only | — |
| R-16 | D-F1 | CI exists (done); add Vitest Tier-1 (spec-first) + Tier-2 (with R-09) + Tier-3 (after R-00) | partial: R-00 (Tier-3) |
| R-17 | D-F3 | Extract shared pure camelCase macro/date core; edge snake adapter; Deno dep-pin | R-16 (Tier-1 first) |
| R-18 | D-F5 | Cron liveness alerting (stale `daily_nutrition_history`/`tdee_estimates` → notify) | — |

> Note: D-F2 has no `R-` entry — it was fully executed this session (repo public, CI workflow, branch protection requiring `lint-build`, auto-merge enabled, main reconciled, prod deployed). Record it in `decisions.md` as `status: done (2026-05-17)`. D-A7 likewise shipped (no R-entry).

---

## Task 1: Scaffold `docs/` and build the immutable `decisions.md`

**Files:**
- Create: `docs/decisions.md`

- [ ] **Step 1: Read the source**

Read `conventions-audit.md` in full. Each item there is `### A1. (#1) …` with **Status**, **Original wording**, **Finding**, **Ruling**, **Action items**, **Cross-refs**.

- [ ] **Step 2: Write `docs/decisions.md` skeleton**

```markdown
# Decisions

Immutable log of the 34-item conventions review (2026-05-17). Append-only.
IDs are permanent and never renumbered or reused. When a decision's
implementation is pending, it links its roadmap item: `roadmap: R-xx`.

## Contents
- D-A1 … D-F6 (grouped A data-model · B math · C state/forms · D UI · E i18n · F ops)
```

- [ ] **Step 3: Write all 34 entries**

For every row in the Decision ID map, write one entry, in ID order, with this exact shape:

```markdown
## D-A6 — `bone_kg` removed entirely

**Ruling:** <the Ruling text from conventions-audit.md A6, condensed to the decision itself>

**Why:** <the Finding + rationale from conventions-audit.md A6 — preserve the reasoning; this is the highest-value content, do not compress it away>

**Status:** decided · roadmap: R-03
```

Rules for the fields:
- `**Ruling:**` = what was decided (1–4 sentences).
- `**Why:**` = the finding/rationale (the "looked like X, is actually Y", the precedent, the tradeoff). Keep it.
- `**Status:**` = `decided` plus `· roadmap: R-xx` if it appears in the Decision→roadmap map; `· done (2026-05-17)` for D-F2 and D-A7; `· REVERSED by D-B1` for D-B2; `· implicit via D-C2` for D-C3.
- For D-A2/D-A3/D-A4: note "folded into the ★ Library Contribution & Lifecycle Model — see `data-model.md#library-model` and R-01".

- [ ] **Step 4: Verify**

Confirm 34 `## D-` headings exist (`grep -c '^## D-' docs/decisions.md` → 34). Confirm every `roadmap: R-xx` referenced is in the Decision→roadmap map.

- [ ] **Step 5: Commit**

```bash
git add docs/decisions.md
git commit -m "docs: add immutable decisions log (34 rulings)"
```

---

## Task 2: Build the mutable `roadmap.md` and backfill links

**Files:**
- Create: `docs/roadmap.md`
- Modify: `docs/decisions.md` (only if any `roadmap: R-xx` line is missing/wrong)

- [ ] **Step 1: Write `docs/roadmap.md`**

```markdown
# Roadmap

Mutable backlog of work the conventions review spawned. Items shrink as they
land. Each links its originating decision(s). `R-00` is the cross-cutting
blocker. When an item is `done`: strike + date it, and remove the matching
`⚠ Changing — R-xx` callout from the reference shard (never edit the decision).

## Contents
- R-00 … R-18

## R-00 — Baseline current schema into migrations
- **decision:** D-A8, D-A6, D-E3, D-D6, D-F1
- **blocked-by:** —
- **status:** todo
- **scope:** Only `supabase/migrations/20260514120000_sprint9_cron_and_jobs.sql`
  exists; the rest of the schema was built via dashboard/MCP. Export the live
  schema into a baseline migration so the DB is reproducible. Unblocks
  generated types (R-04), the A6/E3/D6 migrations (R-03/R-12/R-14), and F1
  Tier-3 DB/RLS tests.
```

Then one block per remaining `R-` row in the Decision→roadmap map, same shape (`decision:`, `blocked-by:`, `status: todo`, `scope:` transcribed from that decision's **Action items** in `conventions-audit.md` — transcribe the concrete action items, do not summarize them away).

- [ ] **Step 2: Backfill**

For each `R-` item, ensure the originating decision(s) in `docs/decisions.md` carry the matching `roadmap: R-xx` in their `**Status:**` line. Fix any that are missing.

- [ ] **Step 3: Verify**

`grep -c '^## R-' docs/roadmap.md` → 19 (R-00..R-18). Every `decision:` value exists as a `## D-` in `decisions.md`; every `blocked-by:` value is a real `R-` id or `—`.

- [ ] **Step 4: Commit**

```bash
git add docs/roadmap.md docs/decisions.md
git commit -m "docs: add mutable roadmap; link decisions↔roadmap by ID"
```

---

## Task 3: Build `docs/data-model.md`

**Files:**
- Create: `docs/data-model.md`
- Source: `hudsons-fitness-architecture.md` (schema DDL ~§212+, RLS ~§460, RPCs, view, extensions, §1008–1011 open questions), `conventions-audit.md` (A1, A2, A3, A4, A8, B5, C5, D6, E3, A6).

- [ ] **Step 1: Write the file with this exact heading skeleton**

```markdown
# Data Model

## Contents
- Overview
- Tables (15)
- Row-Level Security
- RPCs
- Views
- Extensions
- Library Contribution & Lifecycle Model
- Type definitions & caveats
```

- [ ] **Step 2: Fill each section from the mapped sources**

- **Tables (15):** transcribe each table's columns/constraints from the architecture DDL. At `meal_logs`, `tdee_estimates`, `profiles` add `> ⚠ Changing — see R-12/R-08/R-03/R-14 (D-D6/D-B5/D-A6/D-E3)` at the exact column(s) affected.
- **Row-Level Security:** the standard `auth.uid() = user_id` pattern; the `ingredients` open-SELECT/INSERT, creator-only UPDATE/DELETE, `null = system seed` shape; the reversibility escape hatch (D-A1). Add: "Repo is public — RLS is the sole security boundary (see `operations.md`, D-F2)."
- **RPCs:** the 4 user RPCs + the `apply_template_to_week_admin` SECURITY DEFINER cron exception. State the invariant: any >1-table atomic mutation is an RPC, `SECURITY INVOKER` + `set search_path=public` (D-C5). `> ⚠ Changing — see R-12 (D-D6)` (materialization becomes an RPC).
- **Views:** `body_measurements_smoothed` (+ `weight_kg_5day_avg`).
- **Extensions:** `pg_trgm`, `btree_gist` in `extensions` schema.
- **Library Contribution & Lifecycle Model:** transcribe the ★ model from `conventions-audit.md` top section verbatim-in-substance (pool+reference, no hard-delete, anon ownership transfer, Phase-2 reaper). Anchor `## Library Contribution & Lifecycle Model` (so `#library-model` resolves — add an explicit `<a id="library-model"></a>` if the slug differs). `> ⚠ Changing — see R-01 (D-A2/D-A3/D-A4)`.
- **Type definitions & caveats:** hand-written today → generated direction (D-A8, R-04); CHECK enums (`kcal_mode`, `fiber_mode`) surface as `string` — verify against `pg_constraint`. `> ⚠ Changing — see R-04`.

- [ ] **Step 3: Verify**

No invented columns. Every `⚠ Changing` callout names a real R-id. `grep -n 'library-model' docs/data-model.md` resolves to the model section.

- [ ] **Step 4: Commit**

```bash
git add docs/data-model.md
git commit -m "docs: add data-model shard"
```

---

## Task 4: Build `docs/architecture.md`

**Files:**
- Create: `docs/architecture.md`
- Source: `CLAUDE.md` (Architecture section), `hudsons-fitness-architecture.md` (non-schema system/compute parts), `conventions-audit.md` (C1, C4, C5, D6, E1, F3, F6, B1, B4).

- [ ] **Step 1: Heading skeleton**

```markdown
# Architecture

## Contents
- Stack & hosting
- Frontend layout
- State model
- Client↔edge boundary
- Computed logic (current)
- i18n model
- Theme model
```

- [ ] **Step 2: Fill**

- **Stack & hosting:** React 18 + Vite + TS SPA → Supabase (PostgREST+Auth+Realtime); project `upvraruehzurbetzrxov` EU Frankfurt; Vercel SPA, prod branch `main` (→ `operations.md`).
- **Frontend layout:** `src/` tree, `features/<name>` (api.ts/hooks.ts/components), path alias `@/*`.
- **State model (D-C1):** TanStack Query for server state; React Context only for cross-cutting Auth + Theme (sparingly); local `useState`/route-params otherwise; **no query-string UI state**; Zustand is the pre-blessed per-slice escape hatch. State the decision boundary verbatim from D-C1's ruling.
- **Client↔edge boundary (D-C5, D-D6, D-F3):** stateful cross-runtime logic goes through DB/RPC; pure cross-runtime logic goes through the shared pure core. `> ⚠ Changing — see R-17 (D-F3)` and `R-12 (D-D6)`.
- **Computed logic (current):** describe *current* macros/protein/TDEE/Mifflin/target-weight behavior (from architecture spec). `> ⚠ Changing — see R-05 (D-B1)`, `R-07 (D-B4)`, `R-08 (D-B5)` at the protein/TDEE/BMR spots.
- **i18n model (D-E1):** current detection order; note `profile.language` is *not yet* authoritative. `> ⚠ Changing — see R-13 (D-E1)`.
- **Theme model (D-F6):** localStorage `hf-theme`, coupled to the `index.html` pre-paint script; deliberately not profile-backed (contrast with D-E1 — explain why).

- [ ] **Step 3: Verify & Commit**

No un-built design stated as current (each future change has a `⚠` callout).

```bash
git add docs/architecture.md
git commit -m "docs: add architecture shard"
```

---

## Task 5: Build `docs/features.md` (incl. EN Background)

**Files:**
- Create: `docs/features.md`
- Source: `hudsons-fitness-architecture.md` (flows §6.x, materialization §685, edge/cron flows), `funcionalidades-excel-gym.md` (ES — distill the product origin into EN), `conventions-audit.md` (A5, D5, D6, B4).

- [ ] **Step 1: Heading skeleton**

```markdown
# Features

## Contents
- Background (origin)
- Body composition & measurements
- Macros & phases
- Meal plans (templates ↔ active week)
- Diario & materialization
- TDEE
- Product ideas (uncommitted)
```

- [ ] **Step 2: Fill**

- **Background (origin):** distill `funcionalidades-excel-gym.md` into **English** — the Excel the app replaces, the sheets (Metricas/Resultados/Ingredientes), and *why* each app feature exists. Do not carry the §6 suggested data model (superseded by `data-model.md`).
- **Body composition & measurements:** current composition chart behavior. `> ⚠ Changing — see R-11 (D-D5)`.
- **Macros & phases:** phase model; current freeze behavior. `> ⚠ Changing — see R-02 (D-A5)`, `R-05 (D-B1)`.
- **Meal plans:** templates ↔ active week, divergence, rollover.
- **Diario & materialization:** plan = default truth, `from_plan`, dedup by `plan_week_slot_id`. `> ⚠ Changing — see R-12 (D-D6)`.
- **TDEE:** current two-endpoint behavior. `> ⚠ Changing — see R-07 (D-B4)`.
- **Product ideas (uncommitted):** still-relevant items from `funcionalidades-excel-gym.md` §5, clearly marked uncommitted; drop stale ones.

- [ ] **Step 3: Verify & Commit**

Background section is English. No ES text remains.

```bash
git add docs/features.md
git commit -m "docs: add features shard with EN-distilled origin"
```

---

## Task 6: Build `docs/conventions.md`

**Files:**
- Create: `docs/conventions.md`
- Source: `conventions-audit.md` (the **decided rule** wording of every confirmed/changed convention), `CLAUDE.md` (Conventions section, post-review corrected).

- [ ] **Step 1: Heading skeleton**

```markdown
# Conventions

Decided code rules in their post-review form. Rules only — the *why* lives in
`decisions.md` (cited by ID). Where a rule's new form is not yet implemented,
it is marked `⚠ Changing — R-xx`.

## Contents
- Forms
- Types & macros
- Data mutations
- UI
- i18n & locale
- Theme
```

- [ ] **Step 2: Fill (each rule cites its D-id; mark unimplemented ones)**

- **Forms:** RHF + zod, `@hookform/resolvers`, schemas co-located per feature, `z.infer<>` (D-C2/D-C3). `> ⚠ Changing — see R-09`.
- **Types & macros:** snake_case for DB-sourced rows end-to-end; camelCase only for computed types like `Macros` (D-C4). BMR/target-weight derived, never stored (D-B5). `> ⚠ Changing — R-08` at the BMR line.
- **Data mutations:** >1-table atomic mutation ⇒ RPC, `SECURITY INVOKER` + `set search_path=public`; admin-RPC exception (D-C5). Fat stored as fraction, convert only via shared helper at the form boundary (D-B3, `⚠ R-06`).
- **UI:** shadcn Badge (D-D1, `⚠ R-10`); toasts fire from the mutation-owning layer, success only for user-triggered low-frequency actions, `useDeleteWeekSlot` exception (D-D2/D-D3); chart time-range pills 30/90/1y/all default 90d, per-chart local state (D-D4).
- **i18n & locale:** detection order with `profile.language` authoritative for authed users (D-E1, `⚠ R-13`); stored content never auto-translated (D-E2); metric-only (D-E3, `⚠ R-14`); language toggle authed = Settings only (D-E4, `⚠ R-15`).
- **Theme:** localStorage-only `hf-theme`; key string coupled to the `index.html` pre-paint script — change one ⇒ change the other (D-F6).

- [ ] **Step 3: Verify & Commit**

Every rule cites a `D-` id. Every `⚠ Changing` names a real `R-` id.

```bash
git add docs/conventions.md
git commit -m "docs: add conventions shard (post-review rules)"
```

---

## Task 7: Build `docs/operations.md` (absorb `supabase/README.md`)

**Files:**
- Create: `docs/operations.md`
- Source: `CLAUDE.md` (Commands), `supabase/README.md` (full), `conventions-audit.md` (F1, F2, F3, F4, F5), the F2/F5 work executed 2026-05-17.

- [ ] **Step 1: Heading skeleton**

```markdown
# Operations

## Contents
- Commands
- CI & merge workflow
- Hosting & deploy
- Supabase project
- Edge functions
- Cron
- Schema-in-migrations status
```

- [ ] **Step 2: Fill**

- **Commands:** `pnpm install/dev/typecheck/lint/build/preview`; Node 20+/pnpm 10+; `.env.local` keys.
- **CI & merge workflow:** `.github/workflows/ci.yml` (pnpm10/node20, `lint`+`build`); `main` branch protection (`lint-build` required, strict, force-push/deletion blocked); GitHub auto-merge enabled (`gh pr merge --auto`); repo is **public** → RLS is the sole security boundary (D-F2). Working model: short-lived branch → PR → CI → auto-merge; don't let a long-lived branch drift far ahead.
- **Hosting & deploy:** Vercel project `hudsonfitness` (`prj_69QdEbnDr836rfFwd24J9ISFuXqv`, team `team_EDiBxgsadwU6GbSqodEH0G3Q`), production branch `main`, deploy-on-merge.
- **Supabase project:** `upvraruehzurbetzrxov` (EU Frankfurt).
- **Edge functions:** layout (`_shared/`, 4 functions), Deno+TS, deploy command, the one-time Vault `cron_service_role_key` setup + the rotation procedure (`vault.update_secret`). `> ⚠ Changing — see R-17 (D-F3)` at the `_shared` macro/date duplication note.
- **Cron:** the 3 UTC schedules; *why DST drift is harmless* (in-function `Europe/Madrid` date logic, not trigger-derived); the single-TZ assumption + pointer to the pre-specced multi-TZ path in `decisions.md` D-F4; the cron liveness gap (`⚠ Changing — R-18`, D-F5).
- **Schema-in-migrations status:** only 1 migration file; schema built via dashboard/MCP; `> ⚠ Changing — see R-00` (blocks generated types + DB tests).

- [ ] **Step 3: Verify & Commit**

```bash
git add docs/operations.md
git commit -m "docs: add operations shard (absorbs supabase/README)"
```

---

## Task 8: Build `docs/changelog.md` from `HANDOFF.md`

**Files:**
- Create: `docs/changelog.md`
- Source: `HANDOFF.md` (sprint history + PR table only).

- [ ] **Step 1: Write**

```markdown
# Changelog

Append-only record of shipped work. (Pending work lives in `roadmap.md`.)

## Contents
- Sprints
- PR table
```

- [ ] **Step 2: Fill**

Transcribe the sprint history and the PR table from `HANDOFF.md`. **Drop** the "resume prompt" / "next sprint" / running-state sections (obsolete). Append a `## 2026-05-17` entry: "Conventions review (34 items) completed; D-F2 executed — repo public, CI + branch protection + auto-merge live, `main` reconciled (PR #17), production redeployed; doc-rework."

- [ ] **Step 3: Verify & Commit**

No "resume prompt"/running-state content carried over.

```bash
git add docs/changelog.md
git commit -m "docs: add changelog shard from HANDOFF history"
```

---

## Task 9: Rewrite `CLAUDE.md` router; trim `README.md`; stub `supabase/README.md`

**Files:**
- Modify (rewrite): `CLAUDE.md`
- Modify (trim): `README.md`
- Modify (replace with stub): `supabase/README.md`

- [ ] **Step 1: Rewrite `CLAUDE.md` to exactly this contract**

```markdown
# CLAUDE.md

Hudson's Fitness — bilingual (ES/EN) PWA: body composition, macros, recipes, weekly meal plans, dietary phases. React 18 + Vite + TS SPA → Supabase. Solo dev.

## Commands
(install / dev / typecheck / lint / build / preview; Node 20+, pnpm 10+; `.env.local` = `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`)

## Hard invariants (never violate)
1. Metric-only (kg/cm/g).
2. DB is canonical; RLS is the sole security boundary (repo is public).
3. Any >1-table atomic mutation is an RPC (`SECURITY INVOKER` + `set search_path=public`).
4. `pnpm lint` + `pnpm build` (CI-enforced) must pass before merge.
5. BMR and target-weight are derived — never stored.
6. Convert units/fractions only at the form boundary via shared helpers.
7. Never document an un-built design as if it exists (mark `⚠ Changing — R-xx`).

## Routing
- Schema / RLS / RPCs / ★ Library model → `docs/data-model.md`
- System shape / state / boundaries / i18n / theme → `docs/architecture.md`
- What the app does / flows / origin → `docs/features.md`
- Code rules (forms, macros, toasts, UI…) → `docs/conventions.md`
- CI / deploy / Supabase / cron / runbook → `docs/operations.md`
- Why a decision was made → `docs/decisions.md` (IDs `D-A1…D-F6`)
- What's still un-built → `docs/roadmap.md` (IDs `R-00…`)
- Shipped history → `docs/changelog.md`

Rule: if it isn't needed every session, it does not belong in this file.
```

- [ ] **Step 2: Trim `README.md`**

Keep: 1–2 line description, quick start (install/dev, `.env.local` with the public-tier values currently in the README), and "Documentation → see `CLAUDE.md` and `docs/`". Remove anything now living in `docs/`.

- [ ] **Step 3: Replace `supabase/README.md` with a stub**

```markdown
# Supabase

Edge functions + cron. Operational docs moved to `../docs/operations.md`.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md supabase/README.md
git commit -m "docs: CLAUDE.md→router; trim README; stub supabase/README"
```

---

## Task 10: Absorption-verification pass

**Files:** none created; may edit any `docs/*.md` to close gaps.

- [ ] **Step 1: Build the checklist**

For each of the five migrated sources — `hudsons-fitness-architecture.md`, `HANDOFF.md`, `funcionalidades-excel-gym.md`, `supabase/README.md`, old `CLAUDE.md` prose — list every distinct fact/section.

- [ ] **Step 2: Map each fact to a shard**

For each fact, point to the shard+heading that now contains it, OR mark it deliberately dropped (must match a spec "dropped/superseded" rule: HANDOFF resume-prompt, funcionalidades §6 data model, etc.).

- [ ] **Step 3: Close gaps**

Any fact neither present nor deliberately-dropped → add it to the right shard now. Re-verify.

- [ ] **Step 4: Commit (only if gaps were closed)**

```bash
git add docs/
git commit -m "docs: close absorption-verification gaps"
```

---

## Task 11: Delete superseded sources

**Files:**
- Delete: `hudsons-fitness-architecture.md`, `HANDOFF.md`, `funcionalidades-excel-gym.md`
- Delete LAST: `conventions-audit.md`

- [ ] **Step 1: Confirm Task 10 passed** (no open gaps).

- [ ] **Step 2: Delete the three superseded docs**

```bash
git rm hudsons-fitness-architecture.md HANDOFF.md funcionalidades-excel-gym.md
```

- [ ] **Step 3: Delete the audit scratchpad (it is gitignored — remove the working file)**

```bash
rm conventions-audit.md
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: remove superseded source docs (absorbed into docs/)"
```

---

## Task 12: Update memory; final sanity check

**Files:**
- Modify: `C:\Users\hudso\.claude\projects\C--Users-hudso-Desktop-Projectos-de-codigo-Hudson-Fitness\memory\conventions_review_in_progress.md`
- Modify: `…\memory\recent_sprint_state.md`
- Modify: `…\memory\MEMORY.md` (index line only if wording changed)

- [ ] **Step 1: Repoint memory**

In `conventions_review_in_progress.md` and `recent_sprint_state.md`: replace every "source of truth = `conventions-audit.md`" with "`docs/decisions.md` (D-IDs) + `docs/roadmap.md` (R-IDs), committed". State the doc-rework is complete and `conventions-audit.md` is deleted. Update the `MEMORY.md` one-line hook if its wording referenced the audit file.

- [ ] **Step 2: Sanity check (docs-only change)**

Run `pnpm lint` and `pnpm build` (via `corepack pnpm` if `pnpm` is not on PATH; or `node_modules/.bin/eslint .` + `node_modules/.bin/tsc -b`). Expected: still pass (no code touched).

- [ ] **Step 3: Final commit**

```bash
git add CLAUDE.md docs/
git commit -m "docs: doc-rework complete — docs/ is the single source of truth"
```

(Memory files live outside the repo — they are saved by editing, not committed.)

---

## Self-review notes (filled by plan author)

- **Spec coverage:** structure (Tasks 3–9), content mapping (Tasks 3–9 + 10), AI-nav conventions (global section + Tasks 1–2 IDs), execution sequence (Tasks 1–12), success criteria (Task 10 absorption, Task 12 sanity). All spec sections have tasks.
- **Placeholder scan:** the `R-`/`D-` ids and the two mapping tables are concrete (enumerated above), not placeholders; per-shard heading skeletons are given verbatim; "transcribe from conventions-audit.md X" points at a concrete in-repo source, not "figure it out".
- **Ordering:** `decisions.md`/`roadmap.md` (Tasks 1–2) built before `conventions-audit.md` deletion (Task 11); reference shards reference R-ids that exist by Task 2; `CLAUDE.md` router (Task 9) after shards exist; audit deleted last (Task 11 Step 3).
- **ID consistency:** the Decision ID map and Decision→roadmap map are the single canonical reference used by all tasks.
