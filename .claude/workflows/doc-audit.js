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
