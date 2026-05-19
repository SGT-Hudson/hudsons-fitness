# Design — Development-branch (integration) ship flow

- **Date:** 2026-05-19
- **Status:** PROPOSED — awaiting user approval (user requested this be ready to accept on waking)
- **Author:** Claude (async; user asleep — every open decision is captured below as an assumption with a recommended default to accept or override, in lieu of interactive Q&A)
- **Topic:** Replace "PR auto-merges straight to `main`" with a two-tier `develop` → `main` flow

---

## 1. Problem (verified current state)

Facts confirmed against the live repo/infra on 2026-05-19, not memory:

- **Flow today:** a short-lived `claude/*` branch → PR (base `main`) → `.github/workflows/auto-merge.yml` arms GitHub native **squash** auto-merge on every non-draft PR without the `do-not-merge` label → the single required check `lint-build` (`ci.yml`: `pnpm install/lint/build/test`) goes green → GitHub merges to `main`. `delete_branch_on_merge=true`.
- **`main` branch protection:** required check `lint-build` only; `strict=false`; `required_pull_request_reviews=null` (no human review required); `enforce_admins=false`; no push restrictions.
- **CI triggers:** `pull_request` and `push` on **`main` only**.
- **Vercel:** project `hudsonfitness` (`prj_69QdEbnDr836rfFwd24J9ISFuXqv`, team `sgthudsons-projects`). Production branch is **`main`** (evidenced by the `hudsonfitness-git-main-…` domain and `latestDeployment.target: production`). Every other branch gets a Preview deployment.
- **Consequence:** `main` is simultaneously the integration target **and** the production release branch. Anything that turns `lint-build` green is auto-merged **and auto-deployed to production** (`hudsonfitness.vercel.app`) with **zero human gate**. The only brake is the *opt-out* `do-not-merge`/draft mechanism — unsafe-by-default for risky (esp. visual/UI) change.

**Goal:** decouple "integrate work continuously and hands-off" from "release to production". Keep day-to-day autonomy; add exactly one deliberate gate at the point that matters (production).

### Non-goals

- Not adding mandatory human code review to every change (kills the autonomy that was explicitly wanted).
- Not changing the test strategy, CI contents, or the `claude/*` feature-branch convention.
- Not a Vercel custom-domain/staging-DNS project (a stable `develop` preview URL is enough; a real `staging.` domain is out of scope, notable as future work).
- No repo-wide branch cleanup (the ~25 stale `origin/claude/rXX-*` branches) — noted, not actioned.

---

## 2. Approaches considered

**A. `develop` integration branch; `main` stays production; promotion is a reviewed `develop`→`main` step. — RECOMMENDED**
Feature PRs target `develop` and still auto-merge hands-off. `main` only advances via an explicit, user-approved promotion. Vercel production stays `main` (no infra churn); `develop`'s stable Vercel preview becomes a free staging environment.
*Why recommended:* it is exactly what was asked; minimal blast radius (production infra untouched); preserves hands-off autonomy for the 95% case; adds the gate precisely where production risk lives; gives a soak environment for free.

**B. Keep `main` as integration; add a `production`/`release` branch that Vercel deploys from.**
Same two-tier effect but inverts naming. Requires repointing Vercel's production branch and re-reasoning every "main = prod" assumption (public repo, README, domains). More disruptive, no upside over A. Rejected.

**C. No new branch; gate production with required PR review + a Vercel deployment-protection/environment gate.**
Lighter, but (1) the user explicitly asked for a development branch; (2) no integration/soak surface; (3) required review applies to *all* changes, destroying the hands-off property. Rejected.

Chosen: **A**.

---

## 3. Chosen design

### 3.1 Branch topology

| Branch | Role | Who writes it | Deploys to |
|---|---|---|---|
| `claude/*` | short-lived feature/work | me | Vercel Preview (per-branch) |
| **`develop`** | long-lived integration / staging trunk | only via auto-merged feature PRs | Vercel Preview (stable `…-git-develop-…` URL = de-facto staging) |
| `main` | production release branch | only via reviewed promotion PRs (or hotfix) | **Vercel Production** (`hudsonfitness.vercel.app`) — unchanged |
| `release/YYYY-MM-DD` | ephemeral promotion carrier | me, on promotion | (its PR; disposable) |
| `claude/hotfix-*` | urgent production fix | me, rare | Preview, then `main` |

### 3.2 Lifecycle

1. **Feature:** `claude/<topic>` → PR **base `develop`** → `auto-merge.yml` arms squash auto-merge → `lint-build` green → squash-merged into `develop`, feature branch auto-deleted. Hands-off, exactly like today, just into `develop`.
2. **Soak:** `develop` continuously deploys to its stable Vercel preview URL — that is where changes (including UI) are observed before production.
3. **Promotion (the one human gate):** on your say-so I cut `release/YYYY-MM-DD` from `develop`'s tip and open a **PR `release/* → main`**. This PR is **not** auto-armed (the auto-merge workflow only triggers on base `develop`), so it sits until **you explicitly merge it**. Merge style = **merge commit** (not squash) so `main`'s history stays a subset of `develop`'s and the branches never structurally diverge. Merging it deploys production.
4. **Hotfix:** `claude/hotfix-*` → PR **base `main`**, you approve+merge (also not auto-armed) → production. I then auto-open a back-merge PR `main → develop` so the fix isn't lost on the next promotion.

### 3.3 Why `release/*` instead of PR'ing `develop` directly into `main`

`delete_branch_on_merge=true` deletes a merged PR's **head** branch. A `develop → main` PR has head `develop` → merging it would **delete `develop`**. Using an ephemeral `release/*` branch as the PR head means only the disposable branch is deleted; `develop` is never a PR head and is never touched. (Alternative — a non-PR API merge — loses the review/checks surface; rejected.)

---

## 4. Decision register (async substitute for clarifying questions)

Each row has a **recommended default** that takes effect if you say "accept defaults". To change one, just name the row and your choice.

| # | Decision | Recommended default | Alternatives / note |
|---|---|---|---|
| D1 | Integration branch name | `develop` | `dev`, `integration` |
| D2 | GitHub **default branch** | switch to **`develop`** (so new PRs/`gh pr create` target it automatically; prevents accidental PRs to `main`) | keep `main` default (then I must pass `--base develop` every time — more error-prone) |
| D3 | Promotion trigger | **on-demand**, when you say "promote" (or a `/promote`-style ask) | time-scheduled auto-promotion — *rejected by default*: silently re-introduces unreviewed production |
| D4 | Promotion approval | **you** merge the `release/*`→`main` PR (I never auto-merge it) | allow me to merge after a stated soak window — looser |
| D5 | Feature-PR merge style into `develop` | **squash** (unchanged from today) | merge-commit |
| D6 | Release-PR merge style into `main` | **merge commit** (keeps histories convergent) | squash (then needs a back-merge every promotion) |
| D7 | `main` protection hardening | require PR before merge; keep `lint-build` required; **disallow direct pushes**; no required human review (solo) | add required review on `main` only |
| D8 | `develop` protection | required check `lint-build`; `strict=false`; no required review (auto-merge needs a *pending required check* to arm against) | stricter |
| D9 | Vercel production branch | **stays `main`** — verify/lock before cutover | — |
| D10 | UI-PR `do-not-merge` guard (from the earlier browser-testing thread) | **drop the hard requirement** — `develop`-as-staging structurally solves "UI auto-ships to prod"; keep the opt-out label available but optional | keep mandatory UI gate anyway |
| D11 | In-flight PRs (#33 `do-not-merge` spec; #41 R-16) | retarget #41’s base to `develop`; leave #33 as-is (still `do-not-merge`) | close/recreate |
| D12 | CLAUDE.md / docs | I rewrite hard-invariant #4, `docs/operations.md`, and add a new `D-Fx` decision (exact ID chosen at execution after reading `docs/decisions.md` — not fabricated here) | defer doc updates |
| D13 | Stale `origin/claude/rXX-*` branches | out of scope (note only) | bulk-prune later |

---

## 5. Concrete changes

**Repo files (one prep PR, see §6 Phase 1):**

- `.github/workflows/ci.yml` — triggers become:
  ```yaml
  on:
    pull_request:
      branches: [main, develop]
    push:
      branches: [main, develop]
  ```
- `.github/workflows/auto-merge.yml` — `on.pull_request.branches: [develop]` (was `[main]`); job logic and draft/`do-not-merge` opt-out unchanged. Net effect: feature PRs into `develop` auto-merge; PRs into `main` (promotions, hotfixes) are intentionally **not** armed.
- `CLAUDE.md` — replace hard-invariant #4 with the two-tier rule (proposed text):
  > **4. Ship flow.** Work on a short-lived `claude/*` branch → PR into **`develop`** → CI (`lint-build`) → auto-merge (squash). `develop` is integration+staging (its Vercel preview is the soak surface). Production = `main`, advanced **only** by a user-approved `release/*`→`main` PR (merge commit). Hotfixes: `claude/hotfix-*`→`main`, then auto back-merge to `develop`. Never push directly to `main` or `develop`.
- `docs/operations.md` — document the flow, promotion runbook, hotfix runbook, rollback. `docs/decisions.md` — new decision entry. `docs/changelog.md` — note the process change.

**GitHub/infra (admin API + one user dashboard check; §6 Phase 2):**

- Create `develop` from the post-prep `main`.
- `develop` branch protection: required status check `lint-build`, `strict=false`, no required reviews.
- `main` branch protection: add "require a pull request before merging"; keep `lint-build`; keep `strict=false`; disallow direct pushes; (no required reviewers — solo).
- Set GitHub **default branch → `develop`** (D2).
- **Vercel:** confirm Production Branch is `main` and `develop` will produce Preview deploys. The available Vercel MCP tools are read-only for project settings, so if a change is ever needed this is a **one-click user action** in the Vercel dashboard (Project → Settings → Git → Production Branch = `main`). Default expectation: no change needed (already `main`), but it **must be verified before flipping the GitHub default branch** — this is the single highest-risk dependency (see §7).

---

## 6. Cutover sequence (exact, ordered — this is the execution checklist)

> Bootstrap caveat handled: the prep PR changes `auto-merge.yml` itself, so it cannot rely on the new auto-merge. It is merged with **one explicit manual `gh pr merge`** — the only manual merge in the whole migration.

**Phase 0 — Pre-flight (user-verifiable, no mutations)**
1. Confirm Vercel Production Branch = `main` (dashboard or `get_project` domain check). HARD GATE for Phase 2.4.

**Phase 1 — Prep PR (rides the *current* main flow, merged manually once)**
2. Branch `claude/dev-flow-cutover` from `origin/main`; apply the §5 repo-file changes; commit (conventional, no AI attribution per working-pref #3).
3. Open PR base `main`; **manually** `gh pr merge --merge` it after `lint-build` is green (it won't auto-arm, by design).

**Phase 2 — Topology (admin API; no code)**
4. **(Gate on step 1.)** `git branch develop origin/main && git push origin develop`.
5. Add `develop` branch protection (D8).
6. Harden `main` branch protection (D7).
7. Set GitHub default branch → `develop` (D2).
8. Retarget open PR #41 base → `develop`; leave #33 untouched (D11).

**Phase 3 — Verification (prove it end-to-end before declaring done)**
9. Open a trivial throwaway PR into `develop` (e.g. a comment-only change); confirm it auto-merges squash on green, branch auto-deletes. Then revert via the same path.
10. Confirm `develop` has a working Vercel preview URL; confirm a `main`-targeted PR is **not** auto-armed.
11. Promotion dry-run: cut `release/2026-05-19` from `develop`, open PR → `main`, confirm it is **not** auto-armed and is awaiting manual merge. (Leave it open for the user, or merge if they pre-approved the dry-run — default: leave open.)

**Phase 4 — Handoff**
12. Report: new flow live, what changed, how to promote ("say *promote*"), how hotfixes work, rollback steps.

**Rollback of the migration itself:** revert the prep PR's workflow changes, restore `main` default branch + original protection (single required check `lint-build`, no PR requirement), keep or delete `develop`. ~3 reversible steps; no data risk.

---

## 7. Risks & mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Vercel still treats default branch as production → flipping default to `develop` ships `develop` to prod | **High** | Phase 0 hard gate: verify/lock Production Branch=`main` *before* Phase 2.7. Vercel stores prod branch explicitly; changing GitHub default does not retroactively change it — but we verify, not assume. |
| `delete_branch_on_merge` deletes `develop` | High | `develop` is never a PR head; promotions use ephemeral `release/*`. (§3.3) |
| Bootstrap: prep PR can't use the workflow it edits | Medium | One explicit manual merge of the prep PR (§6 Phase 1). |
| `develop`/`main` history divergence | Medium | Release PRs use **merge commit** (D6); hotfixes auto back-merge to `develop`. |
| auto-merge can't arm (no required check on `develop`) | Medium | `develop` protection requires `lint-build` (D8) so there is always a pending gate to arm against. |
| In-flight PRs targeting old base | Low | Retarget #41; #33 stays `do-not-merge` (D11). |
| Workflow-file-on-branch semantics (`pull_request` uses head-branch workflow) | Low | Acceptable for same-repo PRs; verified in Phase 3. |

---

## 8. Acceptance

To approve: reply **"accept defaults, execute"** (runs §6 with every §4 default), or list the decision rows you want changed first. Execution is gated on this approval — nothing in §6 runs until you say so. Phase 0 step 1 (Vercel production-branch confirm) may need your one click; I will pause there if it can't be confirmed read-only.

The terminal step after you approve is to turn §6 into a tracked implementation plan (writing-plans), then execute.
