# Doc-rework design — Hudson's Fitness

**Date:** 2026-05-17
**Status:** approved (brainstorming complete) → next: writing-plans
**Author:** Gonzalo Salvador + Claude

## Context

The 34-item conventions review (phase a) is complete. All rulings, findings,
action items, and cross-references live in `conventions-audit.md` (gitignored
working scratchpad, 511 lines). The existing docs — `CLAUDE.md` (73L),
`HANDOFF.md` (229L), `hudsons-fitness-architecture.md` (1015L),
`funcionalidades-excel-gym.md` (203L, ES), `supabase/README.md` (80L) — overlap
and drift. This spec defines phase b: consolidate everything into a single,
AI-navigable `docs/` folder and delete the redundant/superseded sources.

Audience is **AI agents + the solo dev only** (no external onboarding). The dev
consumes docs *through* the agent, not by reading them directly.

## Decisions made during brainstorming

Three architectural forks, each chosen explicitly:

1. **One source of truth, lean router + thorough on-demand shards, rationale
   kept.** No parallel human wiki, no second/generated artifact. The only docs
   that cost tokens every session are the always-loaded ones (`CLAUDE.md`);
   deep shards cost zero until opened. Therefore: make `CLAUDE.md` a ruthlessly
   lean router; let sharded deep docs be as thorough as needed (full rationale
   preserved). Token savings come from **retrieval locality** (topic-sharded
   files + precise index), not prose compression. Compressing away the *why*
   was explicitly rejected — the rationale captured by the review is its
   highest-value output and prevents re-litigating settled questions.

2. **Separate immutable decision log + mutable roadmap, linked by ID.**
   `docs/decisions.md` = permanent record of each ruling + its Why (append-only,
   never shrinks). `docs/roadmap.md` = the live implementation backlog the
   review spawned (shrinks as sprints land). Bidirectional ID links.

3. **Granularity A — ~8 purpose-scoped files** (not coarse ~4, not fine ~12+).

## Target structure

### Always-loaded

- **`CLAUDE.md`** — router only. Fixed sections, in order:
  1. Identity (1 line).
  2. Commands (install/dev/lint/build/typecheck/preview).
  3. **Hard Invariants** — numbered never-violate list distilled from the
     rulings: metric-only; DB is canonical & RLS is the sole security boundary
     (repo is public); any >1-table atomic mutation is an RPC
     (`SECURITY INVOKER` + `set search_path=public`); `pnpm lint` + `pnpm build`
     (CI-enforced) before merge; BMR and target-weight are derived, never
     stored; convert units/fractions only at the form boundary via shared
     helpers; never document an un-built design as if it exists.
  4. **Routing table** — `task involves X → read docs/Y`.
  5. Pointer to `docs/decisions.md` (why) + `docs/roadmap.md` (what's next).
  - Rule: if it is not needed *every* session, it does not belong in
    `CLAUDE.md`. Target ~1 screen.

### On-demand shards (`docs/`)

| File | Purpose |
|---|---|
| `architecture.md` | System shape: React 18 + Vite + TS SPA → Supabase; `features/<name>` (api.ts/hooks.ts/components); state model (TanStack Query for server state; React Context only for cross-cutting Auth+Theme; local `useState`/route-params else; **no query-string UI state**; Zustand is the pre-blessed per-slice escape hatch); client↔edge boundary = DB/RPC; the shared pure macro/date core; i18n model; theme model. |
| `data-model.md` | The 15 tables, RLS policy shapes, the 4 user RPCs + the `apply_template_to_week_admin` exception, the `body_measurements_smoothed` view, extensions (`pg_trgm`, `btree_gist`), the ★ Library Contribution & Lifecycle Model (target shape for `ingredients`/`recipes`), type caveats (hand-written→generated direction; CHECK enums surface as `string`). Describes **current** schema with `⚠ Changing — R-xx` callouts where rulings change it. |
| `features.md` | Feature catalog + key flows: meal-plan templates ↔ active week, materialization (plan = default truth), phases + grace window, TDEE, body composition. Plus a **Background** section: the product origin distilled (in EN) from `funcionalidades-excel-gym.md` — the Excel the app replaces and why each feature exists. |
| `conventions.md` | The **decided code rules** in post-review form (rules only; *why* → `decisions.md` by ID). Includes: forms = RHF + zod (`@hookform/resolvers`, schemas co-located per feature, `z.infer<>`); snake_case for DB-sourced rows end-to-end, camelCase only for computed types like `Macros`; toasts fire from the mutation-owning layer, success only for user-triggered low-frequency actions; shadcn Badge component; RPC threshold + security invariant; fat stored as fraction, convert via shared helper; BMR derived never stored; i18n detection order with `profile.language` authoritative for authed users; language toggle authed = Settings only; metric-only; theme localStorage-only (key `hf-theme`, coupled to the `index.html` pre-paint script). |
| `operations.md` | Runbook: commands; the now-real CI (`.github/workflows/ci.yml`) + branch protection (`lint-build` required, strict) + GitHub auto-merge; repo is **public**; Vercel production branch = `main` (deploy-on-merge); Supabase project `upvraruehzurbetzrxov` (EU Frankfurt); edge-function layout + deploy; Vault `cron_service_role_key` one-time setup + rotation procedure + cron liveness check; the schema-not-in-migrations situation and the baseline prerequisite. Absorbs `supabase/README.md`. |
| `decisions.md` | **Immutable** log. One entry per ruling, anchored `## D-A6 — <title>`: the ruling, the **Why** (finding/rationale), and `roadmap: R-xx` when implementation is pending. Append-only; IDs never renumbered/reused. |
| `roadmap.md` | **Mutable** backlog. Items `R-00 … R-nn`, each with: scope/action items, `decision:` back-link(s) to D-ID(s), `blocked-by:`, and `status: todo|in-progress|done`. `R-00` = "baseline current schema into migrations" (blocks A8 generated types, F1 Tier-3 DB tests, and the A6/E3/D6 migrations). On `done`: strike + date the item, remove the matching `⚠ Changing` callout from the reference shard; the decision entry is never modified. |
| `changelog.md` | Ex-`HANDOFF.md`: sprint history + PR table, append-only forward. The "resume prompt"/"next sprint" running-state sections are dropped (obsolete: CI/auto-merge real; pending work now in `roadmap.md`). |

Top-level **`README.md`** — trimmed to: what the app is (1–2 lines), quick
start (install/dev/`.env.local` with public-tier values), and "Documentation →
see `docs/`". Stays as the public repo front door. **`supabase/README.md`** —
replaced by a 3-line stub pointing to `docs/operations.md`.

## Content mapping (source → destination)

**Guiding principle:** docs describe **current reality**. Decided-but-unbuilt
changes live in `decisions.md` (why) + `roadmap.md` (what's left); reference
shards mark the spot with `⚠ Changing — R-xx`. Never document an un-built
design as if it exists.

- `hudsons-fitness-architecture.md` → schema/RLS/RPCs/views/extensions to
  `data-model.md`; current computed logic (macros/protein/TDEE/Mifflin/target
  weight) to `features.md` + `architecture.md`; edge/cron flows to `features.md`
  + `operations.md`; §1008–1011 "open questions" triaged into
  `roadmap.md`/`decisions.md` (several already resolved by the review). Then
  **deleted**.
- `HANDOFF.md` → sprint history + PR table to `changelog.md`; running-state
  sections dropped. Then **deleted**.
- `funcionalidades-excel-gym.md` → product origin distilled **into EN** in
  `features.md` Background; suggested data model (§6) superseded by
  `data-model.md` (not carried); future ideas (§5) → `roadmap.md` "Product
  ideas (uncommitted)" or dropped if stale. Then **deleted**.
- `supabase/README.md` → folded into `operations.md`; replaced by a stub.
- `README.md` → trimmed in place.
- `CLAUDE.md` → rewritten as the router; prose absorbed into shards.
- `conventions-audit.md` → the **input** for `decisions.md` (ruling+Why) and
  `roadmap.md` (action items). **Deleted last**, after those two are written
  and the absorption-verification pass passes.

## AI-navigation conventions

1. Immutable decision IDs `D-A1 … D-F6` (reuse the audit's existing A1..F6
   codes so existing cross-refs survive). 34 entries.
2. Roadmap IDs `R-00 … R-nn` with `decision:` and `blocked-by:` fields;
   pending decisions carry `roadmap: R-xx`.
3. All cross-references by ID or anchor, never prose ("see D-F2",
   "see `data-model.md#library-model`") — never "the section above".
4. Every shard opens with a fixed-heading set and a top-of-file Contents list
   (the in-file index) so the router can deep-link stable anchors.
5. Status markers: `⚠ Changing — R-xx` inline callout in reference shards;
   roadmap `status: todo|in-progress|done`.
6. `CLAUDE.md` router contract as specified above.

## Execution sequence (input to writing-plans)

1. Create `docs/` + the 8 shards from their mapped sources, **applying
   post-review rulings** (conventions reflect decided state, not pre-review).
2. Build `decisions.md` from the 34 audit rulings (ID · ruling · Why · roadmap
   link).
3. Build `roadmap.md` from the audit action items (R-IDs, decision back-links,
   `R-00` schema-baseline blocker, status=todo).
4. Rewrite `CLAUDE.md` to the router contract; trim `README.md`; stub
   `supabase/README.md`.
5. **Absorption-verification pass**: a checklist confirming every non-obsolete
   fact in the 5 source docs is present in a shard — before any deletion.
6. Delete `hudsons-fitness-architecture.md`, `HANDOFF.md`,
   `funcionalidades-excel-gym.md`; delete `conventions-audit.md` **last**.
7. Commit. Update memory (`conventions_review_in_progress`,
   `recent_sprint_state`) so they point at `docs/decisions.md` +
   `docs/roadmap.md` as the new committed source of truth, replacing the
   deleted gitignored audit file.

## Success criteria

- A future cold session can, from `CLAUDE.md` alone, route to the correct
  shard for any task without reading the whole corpus.
- Every one of the 34 rulings is recoverable by ID with its Why intact.
- Every spawned implementation sprint is in `roadmap.md` with a decision
  back-link and the `R-00` blocker dependency where applicable.
- No source-doc unique fact is lost (absorption-verification pass).
- No shard documents an un-built design as current; all such spots carry a
  `⚠ Changing — R-xx` callout.
- `pnpm lint` + `pnpm build` still pass (docs-only change; sanity check).

## Out of scope

- Executing any roadmap item (the implementation sprints themselves).
- The `R-00` schema-baseline migration work.
- Any code change beyond docs + `CLAUDE.md` + `README.md` + the
  `supabase/README.md` stub.
- A generated/second AI artifact, a human wiki, or GitHub-issues migration of
  the backlog (all explicitly rejected during brainstorming).
