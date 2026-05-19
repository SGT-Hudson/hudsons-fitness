# Development-branch Ship Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline; this is a one-session infra migration, not parallelizable) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move feature PRs to auto-merge into a new long-lived `develop` integration/staging branch; make `main` (Vercel production) advance only via a user-approved `release/*`→`main` promotion.

**Architecture:** One "prep PR" lands the workflow + docs changes onto `main` via the *current* flow (merged manually once, to dodge the bootstrap where it edits its own auto-merge workflow). Then admin-API steps create `develop`, set branch protections, flip the GitHub default branch, and retarget in-flight PRs. Verification proves the loop both ways before handoff. This is an ops/process migration: "tests" are verification commands with asserted output, not unit tests.

**Tech Stack:** GitHub Actions (`ci.yml`, `auto-merge.yml`), `gh` CLI + GitHub REST (branch protection, default branch), git, Vercel (read-only verification via MCP).

**Spec:** `docs/superpowers/specs/2026-05-19-development-branch-flow-design.md` (approved; all Decision Register defaults accepted).

---

## File structure (what changes)

| File | Change | Responsibility after |
|---|---|---|
| `.github/workflows/ci.yml` | modify trigger branches | run `lint-build` on PRs/pushes to `main` **and** `develop` |
| `.github/workflows/auto-merge.yml` | modify trigger base + header comment | arm auto-merge only on PRs into `develop` |
| `CLAUDE.md` | rewrite hard-invariant #4; bump Routing ID range | codify two-tier ship flow |
| `docs/operations.md` | rewrite "CI & merge workflow" + fix "Hosting & deploy" prod-branch note | accurate runbook (also fixes 2 now-stale claims) |
| `docs/decisions.md` | append `D-F7` | record the decision |
| `docs/changelog.md` | add Sprints bullet | shipped-history note |
| `docs/superpowers/specs/2026-05-19-development-branch-flow-design.md` | carry into prep PR | spec lands in `main` history |
| `docs/superpowers/plans/2026-05-19-development-branch-flow.md` | carry into prep PR | this plan lands in `main` history |

GitHub/infra (no files): create `develop`; `develop` + `main` branch protection; default branch → `develop`; retarget PR #41; close superseded PR #45.

---

## Phase 0 — Pre-flight (verification only, no mutations)

### Task 0: Confirm Vercel production branch is `main`

**Files:** none.

- [ ] **Step 1: Read the Vercel project**

Use MCP `mcp__claude_ai_Vercel__get_project` with `projectId=prj_69QdEbnDr836rfFwd24J9ISFuXqv`, `teamId=team_EDiBxgsadwU6GbSqodEH0G3Q`.
Expected: `domains` includes `hudsonfitness-git-main-sgthudsons-projects.vercel.app` and `latestDeployment.target` is `production`. This confirms production branch = `main`.

- [ ] **Step 2: Decision gate**

If the `git-main` domain is present → production branch is `main`; proceed. **No Vercel change is required by this migration** (we keep `main` as prod). If it is NOT present / ambiguous → **STOP and ask the user** to confirm Vercel → Project → Settings → Git → Production Branch = `main` before any Phase 2 step (the MCP tools are read-only for project settings).

---

## Phase 1 — Prep PR (rides current flow; merged manually once)

### Task 1: Create the prep branch

**Files:** none (branch op). Run from the existing worktree.

- [ ] **Step 1: Branch from latest origin/main**

```bash
cd "D:/dev/hudsons-fitness/.claude/worktrees/dev-branch-flow-spec"
git fetch -q origin
git checkout -B claude/dev-flow-cutover origin/main
```
Expected: `Switched to a new branch 'claude/dev-flow-cutover'`.

- [ ] **Step 2: Bring the spec + this plan onto the branch**

```bash
git checkout claude/dev-branch-flow-spec -- docs/superpowers/specs/2026-05-19-development-branch-flow-design.md docs/superpowers/plans/2026-05-19-development-branch-flow.md
git status --porcelain
```
Expected: both files staged/added (`A  docs/superpowers/...`).

### Task 2: Edit `ci.yml`

**Files:** Modify `.github/workflows/ci.yml`

- [ ] **Step 1: Apply edit**

Replace exactly:
```yaml
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
```
with:
```yaml
on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]
```

- [ ] **Step 2: Verify**

```bash
grep -n "branches:" .github/workflows/ci.yml
```
Expected: two lines, both `branches: [main, develop]`.

### Task 3: Edit `auto-merge.yml`

**Files:** Modify `.github/workflows/auto-merge.yml`

- [ ] **Step 1: Replace the header comment block**

Replace:
```
# Arms GitHub native auto-merge on every PR targeting main, so a PR
# merges itself (squash) the moment the required `lint-build` check
# (ci.yml) goes green — no manual click.
```
with:
```
# Arms GitHub native auto-merge on every PR targeting develop, so a PR
# merges itself (squash) the moment the required `lint-build` check
# (ci.yml) goes green — no manual click. PRs into main (release
# promotions, hotfixes) are intentionally NOT armed and need a human merge.
```

- [ ] **Step 2: Replace the trigger base**

Replace `    branches: [main]` with `    branches: [develop]` (the line under `  pull_request:` in `auto-merge.yml` only).

- [ ] **Step 3: Verify**

```bash
grep -n "branches: \[develop\]\|targeting develop\|NOT armed" .github/workflows/auto-merge.yml
```
Expected: the new comment lines + `branches: [develop]` present; no remaining `branches: [main]` in this file (`grep -c "branches: \[main\]" .github/workflows/auto-merge.yml` → `0`).

### Task 4: Rewrite CLAUDE.md invariant #4 + Routing ID range

**Files:** Modify `CLAUDE.md`

- [ ] **Step 1: Replace invariant #4**

Replace the line:
```
4. `pnpm lint` + `pnpm build` + `pnpm test` (CI-enforced) must pass before merge; work on a short-lived branch → PR → CI → auto-merge to `main`.
```
with:
```
4. **Ship flow.** `pnpm lint` + `pnpm build` + `pnpm test` (CI-enforced) must pass before merge. Short-lived `claude/*` branch → PR into **`develop`** → CI → auto-merge (squash). `develop` is integration+staging (its Vercel preview is the soak surface). Production = `main`, advanced only by a user-approved `release/*`→`main` PR (merge commit); hotfixes `claude/hotfix-*`→`main` then auto back-merge to `develop`. Never push directly to `main`/`develop`.
```

- [ ] **Step 2: Bump the decisions ID range in Routing**

Replace `- Why a decision was made → \`docs/decisions.md\` (IDs \`D-A1…D-F6\`)` with `- Why a decision was made → \`docs/decisions.md\` (IDs \`D-A1…D-F7\`)`.

- [ ] **Step 3: Verify**

```bash
grep -n "Ship flow\|D-A1…D-F7" CLAUDE.md
```
Expected: both present.

### Task 5: Rewrite operations.md "CI & merge workflow" + fix Hosting note

**Files:** Modify `docs/operations.md`

- [ ] **Step 1: Replace the whole "## CI & merge workflow" section**

Replace from the line `## CI & merge workflow` through the line immediately before `## Hosting & deploy` with:

```markdown
## CI & merge workflow

Two-tier flow (D-F7). CI and the merge gate are real and enforced (D-F1, D-F2, D-F7).

- **Workflow:** `.github/workflows/ci.yml` runs on pnpm 10 / Node 20 on PRs
  and pushes to `main` and `develop`, executing `pnpm lint` + `pnpm build` +
  `pnpm test` (real Vitest Tier-1 step — R-16).
- **`develop` = integration + staging.** Short-lived `claude/*` branch → PR
  into `develop` → `lint-build` green → `.github/workflows/auto-merge.yml`
  arms GitHub-native squash auto-merge → merged hands-off; branch
  auto-deleted. Opt out per PR with a draft or the `do-not-merge` label.
  `develop`'s Vercel preview is the soak surface.
- **`main` = production.** `main` advances only via a user-approved
  `release/YYYY-MM-DD`→`main` PR (merge commit, never squash, so histories
  stay convergent). These PRs are intentionally NOT auto-armed. Promotion is
  on-demand ("promote"), not scheduled.
- **Hotfix:** `claude/hotfix-*` → PR into `main` (human-merged) → then an
  auto-opened back-merge PR `main`→`develop` so the fix survives the next
  promotion.
- **Branch protection on `develop`:** required status check `lint-build`;
  `strict` false; force-push/deletion blocked; 0 required reviews.
- **Branch protection on `main`:** required status check `lint-build`;
  `strict` false; a PR is required before merging (0 required reviews —
  solo); force-push/deletion blocked; `enforce_admins` false (the solo
  admin retains an emergency direct-push escape hatch).
- **Public repo:** `github.com/SGT-Hudson/hudsons-fitness` is public, so RLS
  is the sole security boundary — there is no server-side application tier in
  front of the database (D-F2; RLS policy shapes in `data-model.md`
  Row-Level Security).
- **Discipline:** keep branches short-lived and single-purpose; never push
  directly to `main`/`develop`.

```

- [ ] **Step 2: Fix the Hosting & deploy production-branch bullet**

Replace:
```
- **Production branch** `main`, deploy-on-merge; production alias
  `hudsonfitness.vercel.app`.
```
with:
```
- **Production branch** `main` (Vercel Production deploy-on-merge); alias
  `hudsonfitness.vercel.app`. `develop` and feature branches get Preview
  deploys; the `develop` preview is the staging soak surface (D-F7).
```

- [ ] **Step 3: Verify**

```bash
grep -n "Two-tier flow (D-F7)\|develop preview is the staging soak" docs/operations.md
```
Expected: both present. `grep -n "strict (branch must be up to date" docs/operations.md` → no output (stale claim removed).

### Task 6: Append decision D-F7

**Files:** Modify `docs/decisions.md` (append at end of file)

- [ ] **Step 1: Append**

```markdown

## D-F7 — Ship flow: develop integration branch + reviewed promotion

**Ruling:** Replace direct auto-merge-to-`main` with a two-tier flow. Feature `claude/*` PRs auto-merge (squash) into a long-lived `develop` branch (integration + staging via its Vercel preview). `main` stays the Vercel production branch and advances only via a user-approved `release/YYYY-MM-DD`→`main` PR (merge commit, not squash, so `main` stays a convergent subset of `develop`; such PRs are not auto-armed). Hotfixes go `claude/hotfix-*`→`main` then auto back-merge to `develop`. GitHub default branch becomes `develop`; `auto-merge.yml` triggers on base `develop`; `ci.yml` runs on both. Promotion is on-demand, not scheduled.

**Why:** Under D-F2 `main` was simultaneously the integration target and the Vercel production branch with no required human review, so any green PR auto-deployed to production — the only brake an opt-out label. Decoupling integration from release adds exactly one deliberate gate at the point production risk lives, while preserving the hands-off autonomy for day-to-day feature work (auto-merge simply retargets to `develop`) and yielding a free staging soak surface (the `develop` Vercel preview). Promotion uses an ephemeral `release/*` branch as the PR head because `delete_branch_on_merge=true` would otherwise delete `develop` (it is never a PR head). Supersedes the D-F2 single-branch convention.

**Status:** decided · done (2026-05-19)
```

- [ ] **Step 2: Verify**

```bash
grep -n "## D-F7 —" docs/decisions.md
```
Expected: one match.

### Task 7: Add changelog note

**Files:** Modify `docs/changelog.md`

- [ ] **Step 1: Add a Sprints bullet**

Under `## Sprints`, append as the last bullet of that list:
```
- **Process — develop-branch ship flow** — two-tier `develop`→`main` flow; feature PRs auto-merge to `develop`, production via reviewed promotion (D-F7).
```

- [ ] **Step 2: Verify**

```bash
grep -n "develop-branch ship flow" docs/changelog.md
```
Expected: one match.

### Task 8: Commit, push, open prep PR

**Files:** none.

- [ ] **Step 1: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/auto-merge.yml CLAUDE.md docs/operations.md docs/decisions.md docs/changelog.md docs/superpowers/specs/2026-05-19-development-branch-flow-design.md docs/superpowers/plans/2026-05-19-development-branch-flow.md
git -c commit.gpgsign=false commit -q -m "ci: two-tier develop-branch ship flow (D-F7)"
```

- [ ] **Step 2: Push**

```bash
git push -q -u origin claude/dev-flow-cutover
```

- [ ] **Step 3: Open PR (base main, NOT draft, NO do-not-merge — it must run CI; it will not auto-arm because the new workflow triggers on develop)**

```bash
gh pr create --base main --head claude/dev-flow-cutover \
  --title "ci: two-tier develop-branch ship flow (D-F7)" \
  --body "Implements the approved spec docs/superpowers/specs/2026-05-19-development-branch-flow-design.md. Workflow + docs only; admin topology steps (create develop, protections, default-branch flip) follow after this merges. Merged manually once (bootstrap: it edits its own auto-merge workflow)."
```
Expected: prints the PR URL. Record the number as `$PREP`.

- [ ] **Step 4: Wait for CI green, then MANUAL merge (merge commit)**

```bash
gh pr checks $PREP --watch
gh pr view $PREP --json autoMergeRequest --jq '.autoMergeRequest'   # expect: null (proves not auto-armed)
gh pr merge $PREP --merge
```
Expected: `lint-build` passes; auto-merge is `null`; PR merges with a merge commit.

---

## Phase 2 — Topology (admin API; gated on Phase 0 + Phase 1)

### Task 9: Create `develop` from updated `main`

**Files:** none.

- [ ] **Step 1: Create the branch at main's tip**

```bash
git fetch -q origin
git push origin origin/main:refs/heads/develop
gh api repos/SGT-Hudson/hudsons-fitness/branches/develop --jq '.name + " @ " + .commit.sha'
```
Expected: `develop @ <sha>` where `<sha>` equals `git rev-parse origin/main`.

### Task 10: Protect `develop`

**Files:** Create `/tmp/develop-protection.json` (transient, outside repo).

- [ ] **Step 1: Write the protection body**

Create `/tmp/develop-protection.json`:
```json
{"required_status_checks":{"strict":false,"contexts":["lint-build"]},"enforce_admins":false,"required_pull_request_reviews":null,"restrictions":null,"allow_force_pushes":false,"allow_deletions":false}
```

- [ ] **Step 2: Apply**

```bash
gh api --method PUT -H "Accept: application/vnd.github+json" \
  repos/SGT-Hudson/hudsons-fitness/branches/develop/protection \
  --input /tmp/develop-protection.json
```

- [ ] **Step 3: Verify**

```bash
gh api repos/SGT-Hudson/hudsons-fitness/branches/develop/protection \
  --jq '{checks:.required_status_checks.contexts, strict:.required_status_checks.strict, reviews:.required_pull_request_reviews}'
```
Expected: `{"checks":["lint-build"],"strict":false,"reviews":null}`.

### Task 11: Harden `main`

**Files:** Create `/tmp/main-protection.json` (transient).

- [ ] **Step 1: Write the protection body** (require a PR before merging via a 0-approval review object; keep `lint-build`)

Create `/tmp/main-protection.json`:
```json
{"required_status_checks":{"strict":false,"contexts":["lint-build"]},"enforce_admins":false,"required_pull_request_reviews":{"required_approving_review_count":0,"dismiss_stale_reviews":false,"require_code_owner_reviews":false},"restrictions":null,"allow_force_pushes":false,"allow_deletions":false}
```

- [ ] **Step 2: Apply**

```bash
gh api --method PUT -H "Accept: application/vnd.github+json" \
  repos/SGT-Hudson/hudsons-fitness/branches/main/protection \
  --input /tmp/main-protection.json
```

- [ ] **Step 3: Verify**

```bash
gh api repos/SGT-Hudson/hudsons-fitness/branches/main/protection \
  --jq '{checks:.required_status_checks.contexts, pr_required:(.required_pull_request_reviews != null)}'
```
Expected: `{"checks":["lint-build"],"pr_required":true}`.

### Task 12: Flip GitHub default branch to `develop`

**Files:** none.

- [ ] **Step 1: Set + verify**

```bash
gh api --method PATCH repos/SGT-Hudson/hudsons-fitness -f default_branch=develop --jq '.default_branch'
```
Expected: `develop`.

### Task 13: Retarget in-flight PRs

**Files:** none.

- [ ] **Step 1: Retarget #41 to `develop`; leave #33 (do-not-merge) as-is**

```bash
gh pr edit 41 --base develop
gh pr view 41 --json baseRefName --jq .baseRefName
```
Expected: `develop`.

- [ ] **Step 2: Close the now-superseded spec PR #45 (its content landed via the prep PR)**

```bash
gh pr close 45 --comment "Superseded — spec + plan landed in main via the D-F7 prep PR."
```

---

## Phase 3 — Verification (prove the loop both ways)

### Task 14: Feature→develop auto-merge smoke test

**Files:** Create then delete `docs/superpowers/.flow-smoke-2026-05-19.md`.

- [ ] **Step 1: Branch from develop, add a throwaway file**

```bash
git fetch -q origin
git checkout -B claude/dev-flow-smoke origin/develop
printf '# flow smoke %s\n' "$(date -u +%FT%TZ)" > docs/superpowers/.flow-smoke-2026-05-19.md
git add docs/superpowers/.flow-smoke-2026-05-19.md
git -c commit.gpgsign=false commit -q -m "test: develop auto-merge smoke"
git push -q -u origin claude/dev-flow-smoke
```

- [ ] **Step 2: Open PR into develop and confirm it auto-arms + merges**

```bash
gh pr create --base develop --head claude/dev-flow-smoke --title "test: develop auto-merge smoke" --body "Throwaway; proves D-F7 feature→develop auto-merge."
SMOKE=$(gh pr view claude/dev-flow-smoke --json number --jq .number)
sleep 15
gh pr view $SMOKE --json autoMergeRequest --jq '.autoMergeRequest.mergeMethod'   # expect: SQUASH
gh pr checks $SMOKE --watch
sleep 10
gh pr view $SMOKE --json state --jq .state    # expect: MERGED
```
Expected: auto-merge armed `SQUASH`; ends `MERGED`; remote branch auto-deleted (`git ls-remote --heads origin claude/dev-flow-smoke` → empty).

- [ ] **Step 3: Revert the throwaway via the same loop**

```bash
git fetch -q origin
git checkout -B claude/dev-flow-smoke-cleanup origin/develop
git rm -q docs/superpowers/.flow-smoke-2026-05-19.md
git -c commit.gpgsign=false commit -q -m "test: remove develop auto-merge smoke file"
git push -q -u origin claude/dev-flow-smoke-cleanup
gh pr create --base develop --head claude/dev-flow-smoke-cleanup --title "test: remove smoke file" --body "Cleanup."
gh pr checks "$(gh pr view claude/dev-flow-smoke-cleanup --json number --jq .number)" --watch
```
Expected: merges; `git ls-remote --heads origin | grep flow-smoke` → empty after both merge.

### Task 15: Confirm develop staging preview exists

**Files:** none.

- [ ] **Step 1: Check Vercel deployments for `develop`**

Use MCP `mcp__claude_ai_Vercel__list_deployments` (load via ToolSearch `select:mcp__claude_ai_Vercel__list_deployments`) for the project/team, or check the domain `hudsonfitness-git-develop-sgthudsons-projects.vercel.app` responds.
Expected: a Preview deployment for branch `develop` exists (created when `develop` was pushed in Task 9 / updated by Task 14).

### Task 16: Promotion dry-run (leave for user)

**Files:** none.

- [ ] **Step 1: Create the release branch + PR into main**

```bash
git fetch -q origin
git push origin origin/develop:refs/heads/release/2026-05-19
gh pr create --base main --head release/2026-05-19 \
  --title "release: promote develop → main (2026-05-19)" \
  --body "First promotion under D-F7. Merge commit (not squash). Merging this deploys production. Awaiting user approval — NOT auto-armed by design."
REL=$(gh pr view release/2026-05-19 --json number --jq .number)
```

- [ ] **Step 2: Prove it is NOT auto-armed**

```bash
sleep 15
gh pr view $REL --json autoMergeRequest --jq '.autoMergeRequest'
```
Expected: `null` (the auto-merge workflow only triggers on base `develop`). Leave this PR **open** for the user to merge when they want the first production release.

---

## Phase 4 — Handoff report

### Task 17: Report

- [ ] **Step 1: Summarize to the user**

State: new flow live; what changed (branches, protections, default branch, workflows, docs); the open release PR `#$REL` awaiting their merge to do the first production deploy; how to promote in future ("say *promote*" → I cut `release/<date>` and open the PR; you merge it); hotfix path; and the migration rollback (revert the prep PR's workflow/doc changes, restore `main` as default branch with single `lint-build` protection and no PR requirement, delete `develop`).

---

## Self-review

**Spec coverage:** §6 Phase 0 → Task 0. Phase 1 (prep PR incl. ci.yml, auto-merge.yml, CLAUDE.md, operations.md, decisions.md, changelog.md, manual merge) → Tasks 1–8. Phase 2 (create develop, develop+main protection, default branch, retarget #41) → Tasks 9–13. Phase 3 (feature→develop smoke, develop preview, promotion dry-run, main-PR-not-armed) → Tasks 14–16. Phase 4 handoff → Task 17. Decision Register: D1 `develop` (Task 9), D2 default branch (Task 12), D3/D4 promotion on-demand/user-merged (Task 16 leaves PR open), D5 squash features (auto-merge.yml unchanged method; Task 14 asserts SQUASH), D6 merge-commit releases (Task 8 `--merge`, Task 16 body), D7 main protection (Task 11), D8 develop protection (Task 10), D9 Vercel main (Task 0), D10 do-not-merge optional (operations.md text Task 5), D11 retarget #41/keep #33 + close #45 (Task 13), D12 docs (Tasks 4–7), D13 stale branches out of scope (not actioned — intended). All covered.

**Placeholder scan:** no TBD/TODO; all edit content is literal; `$PREP`/`$SMOKE`/`$REL` are runtime-captured PR numbers (legitimately not knowable until creation), not content placeholders.

**Type/name consistency:** branch names (`claude/dev-flow-cutover`, `develop`, `release/2026-05-19`, `claude/dev-flow-smoke`), the required check name (`lint-build`), and project/team IDs are identical across every task and match the spec and verified infra.
