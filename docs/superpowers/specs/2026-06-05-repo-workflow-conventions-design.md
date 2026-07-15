# Repo workflow & conventions overhaul — design spec

**Status: DESIGN COMPLETE (2026-06-05), user-approved.** Ready for an implementation
plan (writing-plans). No code/config changed yet — this is the design hand-off.

## 1. Motivation

A review of the repo's process triggered a "this has gotten over-engineered" feeling.
The honest finding: it is **not over-engineered, it is under-automated**. The setup is
rational *scaffolding for AI-driven solo development* — but rules that depend on a
**stateless AI remembering and executing them each session drift**, and that drift is
what feels heavy.

Evidence from the current state:
- Living-doc **drift** — a whole session (#156) was spent reconciling 9 doc shards with
  shipped reality.
- The **main checkout sat on a stale feature branch** (`claude/r01-defer-reaper`),
  behind `develop` — every session risks starting desynced.
- **45 local branches** (33 `claude/*`); nothing prunes local (the prune workflow only
  touches the remote).
- **7 ghost worktrees** — created from *two* git environments (Windows `D:/…` and WSL
  `/mnt/d/…`) over the same repo, never torn down on merge.

### The governing principle

The "user" of most of this process is the **AI, across sessions**. So:
- docs/decisions/roadmap **are the AI's memory** (not bureaucracy),
- the hard invariants **are footgun guards** against mistakes the AI would otherwise make,
- branch/worktree isolation is what lets **parallel AI sessions** not collide.

The fix is therefore **not "remove process"** but: *automate what the harness can
enforce, keep in CLAUDE.md only what needs judgment, and add the missing session
lifecycle.*

## 2. Three homes for rules (the organizing model)

| Rule type | Home | Why |
|---|---|---|
| Harness-enforceable (fetch on start, cleanup, lint) | **`settings.json` hooks** | the harness runs it every time → cannot drift |
| Needs AI judgment (design/security/data invariants) | **`CLAUDE.md`** | guardrails the AI reads each session |
| Historical / reference | **`docs/` + memory** | not needed every session |

Today almost everything lives in column 2 (CLAUDE.md / docs), **including things that
should be automated** — that mismatch is the root of the "feels heavy" sensation.

## 3. Session lifecycle (NEW section in CLAUDE.md)

A short new CLAUDE.md section codifying how a session starts, isolates, and cleans up:

- **The main checkout (`/mnt/d/dev/hudsons-fitness`) is sacred: it stays on `develop`,**
  advanced only by `fetch` + fast-forward. It is **never** used for feature work.
  It is the always-trustworthy baseline for reading the real state.
- **All write-work happens in an ephemeral worktree created from `origin/develop`**,
  named for the task (e.g. `.claude/worktrees/<task>`), on a fresh `claude/<task>` branch.
- **Worktrees are created only from WSL** (never Windows `D:/` git) — mixing
  environments is what produced the ghosts.
- **Teardown on merge**: once the branch merges, `git worktree remove` it and delete the
  local branch.
- Read-only/brainstorm sessions need no worktree — just the SessionStart `fetch` (§4) and
  reading docs from the synced `develop`.

This single model fixes **both** the stale-main-tree problem and the parallel-session
collision problem.

## 4. Hooks (`settings.json`) — the automation layer

- **SessionStart hook**: `git fetch --prune` + `git worktree prune` (clears the ghost
  metadata) + a non-fatal warning if the main checkout is off `develop` or behind
  `origin/develop`. Must be fast and idempotent; safe to run inside worktrees too.
- **Worktree teardown is a *warning*, not an auto-delete.** Auto-removing a worktree
  whose branch is "merged" could discard uncommitted work. The hook (or a helper) may
  *list* worktrees whose branch is merged and suggest removal; the human/AI confirms.
- Keep existing hooks/CI untouched.

Decision: prefer hooks over CLAUDE.md prose for anything the harness can do, because
hook-enforced rules cannot drift.

## 5. Hard-invariant changes (CLAUDE.md)

Reviewed all 7 with the filter *"a true invariant is load-bearing (breach/corruption),
binary (never), and AI-violable (a footgun) — anything else is a convention."*

**Keep verbatim (they earn their keep; #5/#6 have prevented real bugs):**
- **#1** Metric-only — data-format guarantee.
- **#2** DB canonical; RLS the sole security boundary (public repo) — the single most
  important guard.
- **#5** BMR / target-weight derived, never stored — the dead `bmr_kcal` columns (R-08)
  prove this footgun is real.
- **#6** Convert units/fractions only at the form boundary — the fat-fraction ×100 bug
  (R-06) proves it.

**Trim:**
- **#3** (>1-table = INVOKER RPC + pinned `search_path`): keep the *rule*; **move the
  enumeration of the two sanctioned `SECURITY DEFINER` exceptions out to
  `data-model.md`**, leaving the invariant to reference it. (The pgTAP `00_schema` suite
  already encodes the DEFINER-set invariant.)

**Recategorize (biggest de-bloat):**
- **#4** (ship flow) is a *process*, not an invariant. **Shrink it to the bright line:**
  *"Never push directly to `main`/`develop`; `develop` advances by squash-auto-merge of a
  CI-green PR; `main` advances only by a user-approved `release/*` PR; CI must be green
  before any merge."* **Move the full flow narrative to `operations.md`** (where it is
  already routed).

**Reframe:**
- **#7** (never document un-built as built) — right goal, impossible as a continuous vow
  for a stateless AI. Replace with the **reconcile-at-release process** (§6): docs are not
  promised to be continuously perfect; they are *reconciled to shipped code at each
  release*, with the doc-audit as the engine.

**Add (new invariant):**
- **Never commit secrets.** Public repo → a committed key is catastrophic and
  irreversible (it persists in history). Client config is public-tier `.env.local`;
  server secrets live in Supabase Vault. (Today this is only implicit in #2.)

**Explicitly NOT promoted:** ES+EN completeness stays a **convention** in
`conventions.md` (strengthen the wording there: "both locales complete; no English-only
fallback strings"), not a hard invariant.

## 6. Doc accuracy: reconcile-at-release + a reusable doc-audit

Replaces the unenforceable invariant #7 with a real mechanism:

- **The release flow gains an explicit "reconcile docs" step** (documented in
  `operations.md`): before opening a `release/*` → `main` PR, run the doc-audit and fix
  any drift it surfaces.
- **The doc-audit is saved as a reusable repo workflow** at `.claude/workflows/doc-audit.js`
  (the multi-agent audit used in #156, generalized: one auditor per `docs/` shard +
  `CLAUDE.md`, each cross-checking claims against the real code + `git log`, returning
  structured discrepancies). `.claude/workflows/` is committable (only
  `.claude/settings.local.json` and `.claude/worktrees/` are gitignored).
- It runs **on demand at the release reconcile step**, and **optionally on a schedule**
  (a weekly scheduled agent that reports drift). It is **NOT a CI gate** — an LLM
  semantic audit is neither cheap nor deterministic enough to block merges.

## 7. Trim documentation ceremony

- **Decision log:** only write a `D-xx` entry when there is a **real decision/tradeoff**.
  Stop logging "non-decisions" (entries that just confirm the status quo with no change).
  Existing entries stay (they are append-only history); this is a going-forward rule
  added to `decisions.md`'s preamble.
- **Scale spec/plan to change size** — a concrete threshold, documented in CLAUDE.md /
  conventions:
  - **No spec/plan** (just a `claude/*` PR): single-file or single-component changes,
    copy/i18n tweaks, dependency bumps, pure-doc edits, isolated bug fixes.
  - **Spec required** (and a plan if multi-step): schema/RLS/RPC changes, a new feature
    or page, cross-cutting refactors, anything that touches a hard invariant or the
    data model.
  - **Borderline → AI's judgment, erring toward a short spec.** A "spec" for a small
    change can be a few sentences.
- **Shards are NOT consolidated** (out of scope — the 8 shards work and are routed).

## 8. One-time cleanup (part of implementation)

- Remove the 7 ghost worktrees (`git worktree prune` + `git worktree remove` the `D:/`
  ones).
- Delete local branches already merged to `develop`/`main` (the ~33 dead `claude/*`).
- **Do NOT touch the parallel Project B session's worktree/branch**
  (`claude/project-b-catalog-spec` / `.claude/worktrees/project-b-catalog`) — it is
  active. Verify "merged" status before deleting anything.

## 9. Out of scope (explicitly not doing)

- Simplifying the branch flow (collapsing `develop`/`release` toward trunk) — the flow is
  not the problem and `develop`'s Vercel preview soak surface has value.
- Consolidating the 8 doc shards.
- Promoting ES+EN completeness to a hard invariant.
- Touching the security/data invariants (#1/#2/#5/#6) or the existing CI workflows.

## 10. Risks & notes

- **Parallel-session coordination:** the cleanup step must not delete the live Project B
  worktree/branch.
- **SessionStart hook cost:** `git fetch` runs every session (incl. inside worktrees);
  keep it fast, prune-only, and non-fatal on network failure (offline must not block a
  session).
- **Sacred-main enforcement is convention + a warning**, not a hard lock — the hook warns
  but does not prevent a stray checkout; acceptable for a solo dev.
- **The doc-audit is advisory**, not blocking — drift can still ship if the reconcile
  step is skipped, but it is now cheap to catch.

## Implementation note

The terminal step of brainstorming is to invoke writing-plans. The plan will sequence:
(1) the one-time cleanup, (2) the `settings.json` hooks, (3) the CLAUDE.md edits
(session-lifecycle section + invariant changes + spec/plan threshold), (4) moving the
#3 exceptions / #4 narrative into `data-model.md` / `operations.md`, (5) the
`decisions.md` preamble rule, (6) saving `.claude/workflows/doc-audit.js` + the
release reconcile step. All on the `claude/repo-workflow-conventions` branch → `develop`.
