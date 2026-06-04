# Repo workflow & conventions overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move harness-enforceable rules out of CLAUDE.md into automation (a SessionStart hook), trim/recategorize the hard invariants, codify the session lifecycle, replace the unenforceable doc-accuracy vow with a reusable doc-audit workflow + release reconcile step, and clean up the ghost worktrees and dead branches.

**Architecture:** Three homes for rules — `settings.json` hooks for what the harness can enforce (cannot drift), `CLAUDE.md` for what needs AI judgment, `docs/` + memory for reference. No app code changes; all edits are to docs, `.claude/` config, and one-time git housekeeping. Source of truth for every decision here is the approved spec `docs/superpowers/specs/2026-06-05-repo-workflow-conventions-design.md`.

**Tech Stack:** Markdown docs, Claude Code `settings.json` hooks (`SessionStart`), a bash hook script, a JS Workflow script (the doc-audit), and `git worktree`/`git branch` housekeeping.

**Where to work:** the existing worktree `.claude/worktrees/repo-workflow-conventions` on branch `claude/repo-workflow-conventions` (the spec already lives there). All commits land on that branch → PR into `develop`.

**Ordering rationale:** the shard edits (Tasks 1–4) land first so the trimmed CLAUDE.md (Task 5) can reference them without dangling pointers. Hooks (Task 6) and the doc-audit workflow (Task 7) are independent. The one-time git cleanup (Task 8) is last and is the only destructive step.

**Note on verification:** none of these changes touch `src/`, `.github/`, or `supabase/`, so `pnpm lint` (lints only `src/**/*.{ts,tsx}`), `pnpm build` (tsc + vite over `src`), and `pnpm test` (Vitest over `src`) are unaffected by the doc/config edits. Per-task verification is therefore content/validity checks; a single full `pnpm lint && pnpm build && pnpm test` smoke runs once at the end (Task 9) as CI parity before the PR.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `docs/data-model.md` | Modify | Canonical enumeration of the two `SECURITY DEFINER` exceptions (so CLAUDE.md #3 can point here) |
| `docs/operations.md` | Modify | Add the required "release doc-reconcile" step to the CI & merge workflow |
| `docs/conventions.md` | Modify | Strengthen ES+EN completeness wording (both locales complete; no English-only fallback) |
| `docs/decisions.md` | Modify | Add the going-forward "log only real decisions" rule to the preamble |
| `CLAUDE.md` | Modify | Trim #3/#4, replace #7 with "never commit secrets", add the Session lifecycle section + spec/plan threshold |
| `.claude/hooks/session-start.sh` | Create | SessionStart automation: fetch+prune, worktree prune, off-`develop` warning |
| `.claude/settings.json` | Create/track | Wire the SessionStart hook; preserve existing `agent-browser` permissions |
| `.claude/workflows/doc-audit.js` | Create | Reusable multi-agent doc-audit workflow (one auditor per shard + CLAUDE.md) |
| (git housekeeping) | — | Prune 7 ghost worktrees + remove merged WSL worktrees + delete dead `claude/*` branches |

---

## Task 1: Canonicalize the two `SECURITY DEFINER` exceptions in `data-model.md`

CLAUDE.md #3 will be trimmed (Task 5) to *point here* instead of enumerating the exceptions inline. So `data-model.md` must name **both** exceptions. Today it names only `apply_template_to_week_admin` (lines 519 and 521); `reconcile_account_delete` is described elsewhere but not in this RPC section.

**Files:**
- Modify: `docs/data-model.md:519` and `docs/data-model.md:521`

- [ ] **Step 1: Replace the single-exception sentence (line 519)**

Find:

```
One cron-only exception: `apply_template_to_week_admin` is `SECURITY DEFINER` (Sprint 9), used by scheduled jobs that act across users with the service role.
```

Replace with:

```
Two sanctioned `SECURITY DEFINER` exceptions — the only ones in the schema: (1) the cron-only `apply_template_to_week_admin` (Sprint 9), used by scheduled jobs that act across users with the service role; (2) `reconcile_account_delete` (R-01), account-delete reconciliation called only by the service role / edge — granted to no app-facing role.
```

- [ ] **Step 2: Update the D-C5 invariant restatement (line 521) to name both exceptions**

Find:

```
`SECURITY DEFINER` is forbidden without explicit security review and a non-`public` schema home; the cron-only `apply_template_to_week_admin` is the documented exception.
```

Replace with:

```
`SECURITY DEFINER` is forbidden without explicit security review and a non-`public` schema home; the two documented exceptions are `apply_template_to_week_admin` (cron) and `reconcile_account_delete` (service-role/edge account-delete reconciliation).
```

- [ ] **Step 3: Verify both exceptions now appear in the RPC section**

Run:

```bash
cd .claude/worktrees/repo-workflow-conventions 2>/dev/null || true
grep -nc "reconcile_account_delete" docs/data-model.md
grep -n "Two sanctioned" docs/data-model.md
```

Expected: the count is ≥ 1 and the "Two sanctioned" line prints — confirming `data-model.md` is now the canonical home for the exception enumeration.

- [ ] **Step 4: Commit**

```bash
git add docs/data-model.md
git commit -m "docs(data-model): canonicalize both SECURITY DEFINER exceptions in the RPC section"
```

---

## Task 2: Add the release doc-reconcile step to `operations.md`

Implements spec §6: the release flow gains an explicit, required "reconcile docs" step before opening a `release/*`→`main` PR, pointing at the doc-audit workflow (created in Task 7).

**Files:**
- Modify: `docs/operations.md` — insert one bullet in the `## CI & merge workflow` list, immediately before the `**Hotfix:**` bullet (the find/replace anchor below is exact; do not rely on line numbers)

- [ ] **Step 1: Insert the reconcile bullet**

Find (the `Hotfix` bullet that currently follows `main = production`):

```
- **Hotfix:** `claude/hotfix-*` → PR into `main` (human-merged) → then an
  auto-opened back-merge PR `main`→`develop` so the fix survives the next
  promotion.
```

Replace with (the new bullet prepended before it):

```
- **Release doc-reconcile (required):** before opening a `release/*`→`main` PR,
  run the doc-audit (`.claude/workflows/doc-audit.js`) and fix any drift it
  surfaces, so `main`'s living docs match the code being promoted. The audit is
  advisory (LLM-semantic, not a CI gate) — skipping it lets drift ship, but it is
  cheap to run; it may also run on a schedule for early warning. This replaces
  the old "never document un-built as built" vow with a reconcile-at-release
  mechanism.
- **Hotfix:** `claude/hotfix-*` → PR into `main` (human-merged) → then an
  auto-opened back-merge PR `main`→`develop` so the fix survives the next
  promotion.
```

- [ ] **Step 2: Verify the bullet landed in the CI & merge workflow section**

Run:

```bash
grep -n "Release doc-reconcile" docs/operations.md
```

Expected: one match, inside the `## CI & merge workflow` section (line number between the `## CI & merge workflow` heading at 39 and the `## Hosting & deploy` heading).

- [ ] **Step 3: Commit**

```bash
git add docs/operations.md
git commit -m "docs(operations): add required release doc-reconcile step (doc-audit workflow)"
```

---

## Task 3: Strengthen ES+EN completeness wording in `conventions.md`

Implements spec §5 "Explicitly NOT promoted": ES+EN completeness stays a **convention** (not a hard invariant), but the wording is strengthened. The `## i18n & locale` section (lines 51–56) currently states the resolution chain but never says "both locales must be complete."

**Files:**
- Modify: `docs/conventions.md` — add one bullet to `## i18n & locale`, immediately after the existing bilingual bullet (line 53)

- [ ] **Step 1: Insert the completeness bullet**

Find:

```
- Bilingual ES/EN; for authenticated users `profile.language` is authoritative and is applied post-auth (the `ProfileLanguageSync` component, `src/features/i18n/`, mounted under `AuthProvider`); pre-auth and fallback chain is `localStorage → navigator → es` (D-E1).
```

Replace with (append the new bullet after it):

```
- Bilingual ES/EN; for authenticated users `profile.language` is authoritative and is applied post-auth (the `ProfileLanguageSync` component, `src/features/i18n/`, mounted under `AuthProvider`); pre-auth and fallback chain is `localStorage → navigator → es` (D-E1).
- Both locales stay complete and in sync: every user-facing key exists in **both** `src/i18n/es/*` and `src/i18n/en/*` with a real translation — no English-only fallback strings in the ES bundle (and vice-versa). New copy adds the key to both bundles in the same change (D-E1).
```

- [ ] **Step 2: Verify**

Run:

```bash
grep -n "no English-only fallback" docs/conventions.md
```

Expected: one match under the `## i18n & locale` section.

- [ ] **Step 3: Commit**

```bash
git add docs/conventions.md
git commit -m "docs(conventions): require both locales complete; no English-only fallback strings"
```

---

## Task 4: Add the going-forward decision-logging rule to `decisions.md`

Implements spec §7: stop logging "non-decisions." This is a going-forward rule added to the preamble; existing entries are immutable history and stay.

**Files:**
- Modify: `docs/decisions.md:1-6` (the preamble paragraph)

- [ ] **Step 1: Append the rule to the preamble**

Find:

```
Immutable log of the 34-item conventions review (2026-05-17). Append-only.
IDs are permanent and never renumbered or reused. When a decision's
implementation is pending, it links its roadmap item: `roadmap: R-xx`.
The `R-xx` items are defined in `roadmap.md`.
```

Replace with:

```
Immutable log of the 34-item conventions review (2026-05-17). Append-only.
IDs are permanent and never renumbered or reused. When a decision's
implementation is pending, it links its roadmap item: `roadmap: R-xx`.
The `R-xx` items are defined in `roadmap.md`.

**Going-forward logging rule:** add a new `D-xx` entry only for a real decision
with a tradeoff — a choice between alternatives, a reversal, or a load-bearing
constraint. Do not log "non-decisions" that merely restate the status quo with
no change. Existing entries are immutable history and stay as written.
```

- [ ] **Step 2: Verify**

Run:

```bash
grep -n "Going-forward logging rule" docs/decisions.md
```

Expected: one match in the first ~12 lines (the preamble).

- [ ] **Step 3: Commit**

```bash
git add docs/decisions.md
git commit -m "docs(decisions): log only real decisions going forward (preamble rule)"
```

---

## Task 5: Trim & recategorize CLAUDE.md (invariants + Session lifecycle + spec/plan threshold)

The core of the overhaul. Four edits: (5a) trim #3 to point at `data-model.md`; (5b) shrink #4 to the bright line, pointing at `operations.md`; (5c) replace the old doc-accuracy #7 with the new "never commit secrets" invariant; (5d) insert a `## Session lifecycle` section (incl. the spec/plan threshold) after `## Working preferences`.

> **Intent note for the executor (from spec §5):** doc-accuracy-as-a-continuous-vow fails the invariant filter (*load-bearing, binary, AI-violable*) — it is replaced by the reconcile-at-release mechanism (Task 2) and the `⚠ Changing — see R-xx` marker that already lives in `conventions.md`. "Never commit secrets" passes the filter and takes the #7 slot, keeping exactly 7 invariants.

**Files:**
- Modify: `CLAUDE.md` (Hard invariants #3, #4, #7; new section after Working preferences)

- [ ] **Step 1 (5a): Trim hard invariant #3**

Find:

```
3. Any >1-table atomic mutation is an RPC (`SECURITY INVOKER` + `set search_path = public`); the cron-only `apply_template_to_week_admin` is one documented `SECURITY DEFINER` exception, and `reconcile_account_delete` (account-delete reconciliation; service-role/edge-only, granted only to `service_role` — no app-facing role) is the second.
```

Replace with:

```
3. Any >1-table atomic mutation is an RPC (`SECURITY INVOKER` + `set search_path = public`). `SECURITY DEFINER` is forbidden without security review; the two sanctioned exceptions are enumerated in `data-model.md`.
```

- [ ] **Step 2 (5b): Shrink hard invariant #4 to the bright line**

Find:

```
4. **Ship flow.** `pnpm lint` + `pnpm build` + `pnpm test` (CI-enforced) must pass before merge. Short-lived `claude/*` branch → PR into **`develop`** → CI → auto-merge (squash). `develop` is integration+staging (its Vercel preview is the soak surface). Production = `main`, advanced only by a user-approved `release/*`→`main` PR (merge commit); hotfixes `claude/hotfix-*`→`main` then auto back-merge to `develop`. Never push directly to `main`/`develop`.
```

Replace with:

```
4. **Ship flow (bright line).** Never push directly to `main`/`develop`. `develop` advances only by squash-auto-merge of a CI-green `claude/*` PR; `main` only by a user-approved `release/*` PR. CI (`pnpm lint` + `pnpm build` + `pnpm test`) must be green before any merge. Full flow in `operations.md`.
```

- [ ] **Step 3 (5c): Replace hard invariant #7 (doc-accuracy → never commit secrets)**

Find:

```
7. Never document an un-built design as if it exists — mark it `> ⚠ Changing — see R-xx`.
```

Replace with:

```
7. Never commit secrets. Public repo → a committed key persists in history and is irreversible. Client config is public-tier `.env.local`; server secrets live in Supabase Vault.
```

- [ ] **Step 4 (5d): Insert the Session lifecycle section after Working preferences**

Find (the last Working-preferences item followed by the Routing heading):

```
4. Don't paste diffs / before→after file content into chat — state concisely what changed and why.

## Routing
```

Replace with:

```
4. Don't paste diffs / before→after file content into chat — state concisely what changed and why.

## Session lifecycle
- The main checkout (`/mnt/d/dev/hudsons-fitness`) is **sacred**: it stays on `develop`, advanced only by `fetch` + fast-forward — never used for feature work. It is the trustworthy baseline for reading real state.
- All write-work happens in an **ephemeral worktree** created **from WSL** off `origin/develop`, named for the task (`.claude/worktrees/<task>`) on a fresh `claude/<task>` branch. Never create worktrees from Windows `D:/` git (mixing environments produced the ghost worktrees).
- **Teardown on merge:** once the branch merges, `git worktree remove` it and delete the local branch.
- Read-only/brainstorm sessions need no worktree — the SessionStart hook keeps `develop` synced; read docs from there.
- Doc accuracy is reconciled to shipped code **at release** via the doc-audit (`operations.md`), not continuously; mark known-divergent docs `> ⚠ Changing — see R-xx` in the meantime.
- **Scale spec/plan to change size:** no spec for single-file/component changes, copy/i18n tweaks, dependency bumps, pure-doc edits, isolated bug fixes; a spec (and a plan if multi-step) for schema/RLS/RPC changes, a new feature/page, cross-cutting refactors, or anything touching a hard invariant or the data model. Borderline → err toward a short spec (a few sentences is fine).

## Routing
```

- [ ] **Step 5: Verify all four edits and that exactly 7 invariants remain**

Run:

```bash
grep -n "enumerated in \`data-model.md\`" CLAUDE.md
grep -n "Ship flow (bright line)" CLAUDE.md
grep -n "Never commit secrets" CLAUDE.md
grep -n "## Session lifecycle" CLAUDE.md
# Count ONLY the invariants section (section-scoped — a bare `^[1-7]\.` grep also
# catches the 4 numbered Working-preferences items and would print 11, not 7):
awk '/^## Hard invariants/{f=1;next} /^## Working preferences/{f=0} f && /^[0-9]+\. /' CLAUDE.md | wc -l
```

Expected: the first four greps each print one match; the section-scoped invariant count prints `7`, and item 7 is "Never commit secrets". Also confirm the old strings are gone:

```bash
grep -c "Never document an un-built design" CLAUDE.md   # expect 0
grep -c "is one documented \`SECURITY DEFINER\` exception" CLAUDE.md   # expect 0
```

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(CLAUDE): trim #3/#4, swap #7 for no-secrets, add session lifecycle + spec/plan threshold"
```

---

## Task 6: SessionStart hook — fetch/prune + off-`develop` warning

Implements spec §4. Create a committed hook script and wire it from a committed `.claude/settings.json` (both are committable — `.gitignore` ignores only `.claude/settings.local.json` and `.claude/worktrees/`). The hook must be fast, idempotent, non-fatal offline, and safe to run from inside any worktree.

**Files:**
- Create: `.claude/hooks/session-start.sh`
- Create/track: `.claude/settings.json`

- [ ] **Step 1: Write the hook script**

Create `.claude/hooks/session-start.sh` with exactly:

```bash
#!/usr/bin/env bash
# SessionStart hook: keep the repo synced and warn if the sacred main checkout drifted.
# Fast, idempotent, non-fatal offline. Safe to run from any worktree (it always
# targets the main checkout, not the current working dir). stdout is surfaced to
# the session as additional context.
set -u

MAIN="/mnt/d/dev/hudsons-fitness"

# Best-effort fetch + prune — never block a session on a network failure.
git -C "$MAIN" fetch --prune --quiet origin 2>/dev/null || true
# Clear stale worktree metadata (the Windows D:/ ghosts).
git -C "$MAIN" worktree prune 2>/dev/null || true

# Warn (non-fatal) if the main checkout is off develop or behind origin/develop.
branch=$(git -C "$MAIN" symbolic-ref --quiet --short HEAD 2>/dev/null || echo "")
if [ "$branch" != "develop" ]; then
  echo "⚠ main checkout is on '$branch', not 'develop' (the sacred baseline). Feature work belongs in a worktree."
else
  local_sha=$(git -C "$MAIN" rev-parse develop 2>/dev/null || echo "")
  remote_sha=$(git -C "$MAIN" rev-parse origin/develop 2>/dev/null || echo "")
  if [ -n "$remote_sha" ] && [ "$local_sha" != "$remote_sha" ]; then
    echo "⚠ main checkout's develop is behind origin/develop — fast-forward it: git -C $MAIN merge --ff-only origin/develop"
  fi
fi

exit 0
```

- [ ] **Step 2: Make it executable and smoke-test it**

Run:

```bash
chmod +x .claude/hooks/session-start.sh
bash .claude/hooks/session-start.sh; echo "exit=$?"
```

Expected: `exit=0`. It prints nothing, or a `⚠` warning line (whichever matches the current main-checkout state) — either way it must exit 0 and not hang.

- [ ] **Step 3: Write `.claude/settings.json` wiring the hook (preserving existing permissions)**

Create `.claude/settings.json` with exactly:

```json
{
  "permissions": {
    "allow": [
      "Bash(agent-browser:*)",
      "Bash(npx agent-browser:*)"
    ]
  },
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh\"",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

> The `agent-browser` permissions are carried over from the previously-untracked `.claude/settings.json` so nothing regresses when this file becomes tracked. The `"timeout": 30` (seconds) caps the hook so a hung `git fetch` on a slow network cannot stall session start — the fetch is `|| true`, so a timeout-killed fetch is non-fatal.

- [ ] **Step 4: Validate the JSON**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8')); console.log('valid json')"
```

Expected: `valid json`.

- [ ] **Step 5: Commit**

```bash
git add .claude/hooks/session-start.sh .claude/settings.json
git commit -m "chore(harness): SessionStart hook — fetch/prune + off-develop warning"
```

> **Landing note (one-time, do at PR-merge — not a commit step):** the main checkout currently has an *untracked* `.claude/settings.json`. After this branch merges, `git pull` in `/mnt/d/dev/hudsons-fitness` will refuse to overwrite it ("untracked working tree files would be overwritten"). Resolution: in the main checkout, `rm .claude/settings.json` (its only content — the two `agent-browser` permissions — is preserved in the tracked version) then `git pull`. Record this in the PR description.

---

## Task 7: The reusable doc-audit workflow (`.claude/workflows/doc-audit.js`)

Implements spec §6: generalize the #156 reconcile into a saved, on-demand multi-agent audit — one auditor per `docs/` shard + `CLAUDE.md`, each cross-checking concrete claims against the real code + `git log`, returning structured discrepancies, then a synthesis pass into one prioritized drift report.

**Files:**
- Create: `.claude/workflows/doc-audit.js`

- [ ] **Step 1: Write the workflow script**

Create `.claude/workflows/doc-audit.js` with exactly:

```js
export const meta = {
  name: 'doc-audit',
  description: 'Audit each living-doc shard + CLAUDE.md against the real code and git history; report drift',
  whenToUse: 'On demand at the release doc-reconcile step (before a release/* PR), or on a schedule for early drift warning.',
  phases: [
    { title: 'Audit', detail: 'one auditor per shard, cross-checking claims vs code + git log' },
    { title: 'Synthesize', detail: 'merge discrepancies into one prioritized report' },
  ],
}

// Each target is one living doc + what to cross-check it against.
const TARGETS = [
  { file: 'CLAUDE.md', focus: 'commands, the 7 hard invariants, working preferences, session lifecycle, routing — all still true?' },
  { file: 'docs/architecture.md', focus: 'system shape, state model, boundaries, i18n, theme vs src/app, src/features, src/lib' },
  { file: 'docs/data-model.md', focus: 'tables, columns, RLS policies, RPCs, library model vs supabase/migrations + src/types/database.ts' },
  { file: 'docs/conventions.md', focus: 'code rules (forms, macros, toasts, UI, i18n, theme) vs src/' },
  { file: 'docs/operations.md', focus: 'CI, deploy, Supabase, cron, runbook vs .github/workflows + supabase/' },
  { file: 'docs/features.md', focus: 'what the app does / flows vs src/features + src/pages' },
  { file: 'docs/decisions.md', focus: 'decision log — flag any D-xx entry contradicted by current code' },
  { file: 'docs/roadmap.md', focus: 'un-built/backlog items (R-xx) that are actually shipped already' },
  { file: 'docs/changelog.md', focus: 'shipped history vs git tags + merged PRs (git log/git tag)' },
]

const DISCREPANCY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['file', 'discrepancies'],
  properties: {
    file: { type: 'string' },
    discrepancies: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['claim', 'reality', 'evidence', 'severity'],
        properties: {
          claim: { type: 'string', description: 'what the doc asserts' },
          reality: { type: 'string', description: 'what the code/git actually shows' },
          evidence: { type: 'string', description: 'file:line, migration, workflow, or git ref proving it' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
  },
}

phase('Audit')
const audits = await parallel(TARGETS.map(t => () =>
  agent(
    `You are auditing the living doc \`${t.file}\` in this repo for DRIFT from the real code.\n` +
    `Focus: ${t.focus}\n\n` +
    `Steps: (1) read \`${t.file}\` fully. (2) Verify its concrete, checkable claims against the actual source — grep src/, ` +
    `read the relevant files in supabase/migrations/ and .github/workflows/, and use \`git log\`/\`git tag\` where the doc ` +
    `references shipped history. (3) Report ONLY real, evidence-backed discrepancies: a claim the code contradicts, or a ` +
    `"not yet built / pending" item that is in fact already shipped. Do NOT report style nits, wording preferences, or ` +
    `anything you could not verify against a concrete source. If the doc is accurate, return an empty discrepancies array.`,
    { label: `audit:${t.file}`, phase: 'Audit', schema: DISCREPANCY_SCHEMA }
  )
))

phase('Synthesize')
const found = audits.filter(Boolean)
const flat = found.flatMap(a => (a.discrepancies || []).map(d => ({ ...d, file: a.file })))

if (flat.length === 0) {
  log(`Doc-audit: no drift found across ${found.length} targets.`)
  return { drift: false, targets: found.length, discrepancies: [] }
}

const report = await agent(
  `Synthesize this list of living-doc discrepancies into a single prioritized drift report in markdown. ` +
  `Group by file; within each file order high→low severity. For every discrepancy give: the claim, the reality, ` +
  `the evidence (file:line / migration / git ref), and a one-line suggested fix. End with a short summary count by severity.\n\n` +
  `Discrepancies (JSON):\n${JSON.stringify(flat, null, 2)}`,
  { label: 'synthesize-report', phase: 'Synthesize' }
)

log(`Doc-audit: ${flat.length} discrepancy(ies) across ${found.length} targets.`)
return { drift: true, targets: found.length, count: flat.length, discrepancies: flat, report }
```

- [ ] **Step 2: Validate the script parses as an ES module (without executing it)**

The script uses top-level `return` and top-level `await` — legal in the Workflow runtime (it evaluates the body inside an async function wrapper), but a **bare** ES module rejects top-level `return` with `SyntaxError: Illegal return statement`. So do NOT `node --check` the file as a plain `.mjs`. Instead mirror the runtime's wrapper (neutralize `export` and nest the body in an async function), then syntax-check — this parses without executing (undefined runtime globals are fine; `--check` only parses):

```bash
{ echo 'async function __wf(){'; sed 's/^export const meta/const meta/' .claude/workflows/doc-audit.js; echo '}'; } > /tmp/doc-audit-check.mjs
node --check /tmp/doc-audit-check.mjs && echo "syntax ok" && rm -f /tmp/doc-audit-check.mjs
```

Expected: `syntax ok` (no parse errors). Do not run the file directly — `node doc-audit.js` would fail on the undefined runtime globals (and on the top-level `return`), which is expected.

- [ ] **Step 3: Commit**

```bash
git add .claude/workflows/doc-audit.js
git commit -m "chore(harness): reusable doc-audit workflow (per-shard auditors + synthesis)"
```

---

## Task 8: One-time git housekeeping (the only destructive step)

Implements spec §8. Three sub-steps, each with a verify-before-destroy guard.

**Protection is computed dynamically, not hardcoded:** the protected set is *every branch currently checked out in any worktree* (after Step 1's prune) plus `develop`/`main`. This auto-protects the current branch `claude/repo-workflow-conventions`, the main checkout's `claude/r01-defer-reaper`, and — importantly — the **live Project B session**, whose worktree `.claude/worktrees/project-b-catalog` is actually on branch **`claude/project-b1-catalog-ingestion`** (the branch advanced/renamed since the spec was written, which named the now-stale `claude/project-b-catalog-spec`). Deriving protection from the live worktree set means the guarantee holds regardless of renames, instead of depending on a hardcoded name. A loose, non-checked-out `claude/project-b-catalog-spec` branch may also exist; if it is squash-merged-and-pruned it is a legitimate cleanup target, but if Project B is still using it, it will be checked out and thus protected.

**Files:** none — git state only. Run all commands from the worktree `.claude/worktrees/repo-workflow-conventions` (worktree/branch operations are repo-global).

- [ ] **Step 1: Prune the 7 ghost (Windows `D:/`) worktrees**

These are already marked `prunable` (their directories no longer exist from WSL's view). Preview, then prune:

```bash
git worktree list
git worktree prune -v
git worktree list
```

Expected: after prune, the seven `D:/dev/hudsons-fitness/.claude/worktrees/*` entries are gone; the remaining entries are the main checkout plus the WSL worktrees (`exercise-catalog-expansion`, `fine-muscle-taxonomy`, `project-b-catalog`, `repo-workflow-conventions`).

- [ ] **Step 2: Remove merged & clean WSL worktrees (verify first; never force)**

Project A is released; its two leftover WSL worktrees are `exercise-catalog-expansion` (branch **`worktree-exercise-catalog-expansion`** — note the `worktree-` prefix, not `claude/…`) and `fine-muscle-taxonomy` (branch `claude/fine-muscle-taxonomy`). For each, remove it only if its working tree is clean AND its branch is integrated — where "integrated" means an ancestor of `origin/develop`/`origin/main` **or** its upstream shows `[gone]` (remote pruned by the merge automation, which deletes only merged branches; this is how squash-merged work is detected since a squash is not an ancestor). **Never** pass `--force`: `git worktree remove` refuses a dirty worktree, and that refusal is the safety net.

```bash
git fetch origin --prune --quiet 2>/dev/null || true
for wt in exercise-catalog-expansion fine-muscle-taxonomy; do
  path=".claude/worktrees/$wt"
  # Branch checked out in THIS worktree (porcelain), stopping at the next block so a
  # detached worktree never borrows the following block's branch:
  br=$(git worktree list --porcelain | awk -v p="$path" '
    $1=="worktree" && index($2,p){f=1; next}
    f && $1=="branch"{sub("refs/heads/","",$2); print $2; exit}
    f && $1=="worktree"{exit}')
  echo "--- $wt (branch: ${br:-<detached>})"
  [ -z "$br" ] && { echo "KEPT $wt (no branch resolved)"; continue; }
  gone=$(git for-each-ref --format='%(upstream:track)' "refs/heads/$br" 2>/dev/null)
  if git merge-base --is-ancestor "$br" origin/develop 2>/dev/null \
     || git merge-base --is-ancestor "$br" origin/main 2>/dev/null \
     || [ "$gone" = "[gone]" ]; then
    git worktree remove "$path" && echo "removed $wt" \
      || echo "KEPT $wt (working tree dirty — never --force; remove manually only after confirming the work is integrated)"
  else
    echo "KEPT $wt ($br is not an ancestor of develop/main and its upstream is not gone — expected if Project A merged via squash; remove manually only after confirming the work shipped)"
  fi
done
git worktree list
```

Expected: a worktree is removed only when clean AND integrated (ancestor-merged or `[gone]` upstream). Because Project A shipped via squash/release, these branches may not be ancestors and may not show `[gone]` — in that case both are reported `KEPT` and left intact, which is correct and safe (not a malfunction). The two protected worktrees (`project-b-catalog`, `repo-workflow-conventions`) are never loop targets.

- [ ] **Step 3: Delete dead local branches (squash-merged + ancestor-merged; dynamic protection)**

This repo squash-merges to `develop`, so most dead branches are **not** ancestors of `develop` — `git branch --merged` + `git branch -d` would miss them (it catches only ~12 of ~44). The reliable signal for a squash-merged branch is an upstream marked `[gone]`: the remote branch was deleted by `prune-merged-branches.yml`, which deletes **only merged** branches. So the candidate set is `(ancestor-merged into origin/develop) ∪ (upstream == [gone])`, minus the dynamically-protected set. Preview to a file, eyeball it, then delete:

```bash
# Protected = every branch checked out in ANY worktree (computed now, AFTER Step 1's
# prune freed the ghost branches) + develop + main. No hardcoded names → rename-safe.
{ git worktree list --porcelain | awk '$1=="branch"{sub("refs/heads/","",$2); print $2}'; echo develop; echo main; } | sort -u > /tmp/hf-protected.txt
echo "protected:"; cat /tmp/hf-protected.txt

# Candidates = (gone-upstream) ∪ (ancestor-merged), minus protected. grep -vxF -f does
# exact full-line exclusion.
{ git for-each-ref --format='%(refname:short) %(upstream:track)' refs/heads | awk '$2=="[gone]"{print $1}'
  git branch --merged origin/develop --format='%(refname:short)'
} | sort -u | grep -vxF -f /tmp/hf-protected.txt > /tmp/hf-delete.txt
echo "will delete ($(wc -l < /tmp/hf-delete.txt) branches):"; cat /tmp/hf-delete.txt

# SAFETY GATE — the live Project B branch must NOT appear (must print 0). If it prints
# anything other than 0, STOP and investigate before deleting.
echo "project-b1 in delete list (must be 0): $(grep -c '^claude/project-b1-catalog-ingestion$' /tmp/hf-delete.txt)"
```

After confirming `/tmp/hf-delete.txt` looks right and the safety gate printed `0`, delete:

```bash
# `-D` (not `-d`) is required: squash-merged branches are not ancestors, so `-d` refuses
# them. `-D` is safe HERE because every candidate is either ancestor-merged or
# gone-upstream (= merged then remote-pruned by automation). Nothing checked out is in
# the list (it was excluded by the protected set), so no worktree is disturbed.
xargs -r -n1 git branch -D < /tmp/hf-delete.txt
echo "remaining local branches:"; git branch | wc -l
rm -f /tmp/hf-protected.txt /tmp/hf-delete.txt
```

Expected: ~30+ dead branches deleted; the protected/checked-out branches and `develop`/`main` remain; the local-branch count drops from ~46 to a handful. The safety gate printed `0`. (Anything genuinely unmerged with a still-present upstream is neither `[gone]` nor an ancestor, so it is never a candidate.)

- [ ] **Step 4: No commit**

This task changes git plumbing/state only — there is nothing to commit. Proceed to Task 9.

---

## Task 9: Final CI-parity smoke + branch finish

A single full run of the CI gate to prove the doc/config changes did not somehow break the app, plus a clean-tree check (per the "verify full suite after subagents" lesson).

**Files:** none.

- [ ] **Step 1: Run the full gate**

Run (from the worktree root):

```bash
corepack pnpm lint && corepack pnpm build && corepack pnpm test
```

Expected: all three green. (They should be trivially unaffected — no `src/`, `.github/`, or `supabase/` files changed — but CI will run them, so confirm locally first. Note: the full Vitest run is ~11–15 min.)

- [ ] **Step 2: Confirm a clean working tree and review the commit set**

Run:

```bash
git status --porcelain    # expect empty
git log --oneline develop..HEAD
```

Expected: empty status; the log shows the Task 1–7 commits (Task 8 added none).

- [ ] **Step 3: Finish the branch**

Invoke the `superpowers:finishing-a-development-branch` skill to open the PR `claude/repo-workflow-conventions` → `develop`. In the PR description, include the one-time landing note from Task 6 (remove the untracked `.claude/settings.json` in the main checkout before pulling).

---

## Self-Review

**Spec coverage:**
- §2 three homes for rules → realized structurally across Tasks 5 (CLAUDE.md), 6 (hooks), 1–4 (docs). ✅
- §3 session lifecycle (sacred main, WSL worktrees, teardown, read-only no-worktree) → Task 5 Step 4. ✅
- §4 hooks (fetch --prune, worktree prune, off-develop warning, non-fatal) → Task 6. ✅
- §5 invariant changes: trim #3 (Task 1 + Task 5a), recategorize #4 (Task 5b), reframe #7 + add secrets (Task 5c), ES+EN stays convention (Task 3), no touching #1/#2/#5/#6 (untouched). ✅
- §6 reconcile-at-release + doc-audit workflow → Tasks 2 + 7. ✅
- §7 trim doc ceremony: decision-log rule (Task 4) + spec/plan threshold (Task 5 Step 4). ✅
- §8 one-time cleanup, protecting Project B → Task 8. ✅
- §9 out of scope (branch flow, shard consolidation, ES+EN promotion) → not done. ✅

**Placeholder scan:** every edit gives exact find/replace text or full file content; every verify step gives a concrete command + expected output. No TBD/TODO.

**Type/name consistency:** the hook script path `.claude/hooks/session-start.sh` matches the `settings.json` command; the doc-audit path `.claude/workflows/doc-audit.js` matches Task 2's `operations.md` reference and Task 5's `operations.md` pointer; `MAIN="/mnt/d/dev/hudsons-fitness"` matches the Session-lifecycle "sacred main checkout" path.

**Known judgment call (flagged for the user):** Task 5c drops doc-accuracy from the hard-invariants list entirely (replaced by the reconcile mechanism) rather than keeping a reworded #7. This follows the spec's §5 reframe and keeps the list at 7 by promoting "never commit secrets." If you'd prefer to *keep* a doc-accuracy line AND add secrets (8 invariants), say so before execution.

## Post-verification (2026-06-05)

This plan was checked by a 4-reviewer adversarial workflow (spec-coverage, hook-schema, doc-audit-API, git-cleanup-safety) plus a deterministic verbatim check that every find/replace anchor exists exactly once in its target file. Fixes applied as a result:
- **Task 8 protection made dynamic** — the live Project B worktree is on `claude/project-b1-catalog-ingestion` (not the spec's stale `claude/project-b-catalog-spec`); protection now derives from the live worktree set so it is rename-proof, and a safety-gate assert guards the live branch.
- **Task 8 branch deletion now catches squash-merges** — `--merged`/`-d` only found ~12 of ~44 dead branches; detection now also uses `[gone]` upstreams (remote-pruned-after-merge) and `-D`, validated non-destructively to delete ~30 dead branches while preserving every checked-out branch.
- **Task 8 Step 2 expectations corrected** — squash-merged worktrees are not ancestors, so the guard correctly reports `KEPT`; the awk branch-extraction was hardened against detached worktrees, and the `worktree-…`-prefixed branch name is documented.
- **Task 7 Step 2 syntax check fixed** — `node --check` on a bare `.mjs` rejects the script's legal top-level `return`; the check now mirrors the runtime's async-function wrapper (validated to print `syntax ok` on the real script).
- **Task 6 hook hardened** — added `"timeout": 30` so a hung `git fetch` cannot stall session start.
- **Task 2 line-number reference dropped** in favor of the exact find anchor.

Reviewers raised no high-severity issues and confirmed: the hook `settings.json` shape and `$CLAUDE_PROJECT_DIR`/`bash` invocation are correct; the doc-audit workflow uses the runtime API correctly; and no protected branch/worktree can be deleted by Task 8.
