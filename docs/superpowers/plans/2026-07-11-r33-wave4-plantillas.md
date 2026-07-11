# R-33 Wave 4 — Plantillas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a template a phase, then rebuild the Plantillas library around it
(phase-tinted cards with a week minigrid, phase filter chips) and rebuild the
two flows that create and apply templates.

**Architecture:** PR-A adds the one sanctioned schema exception of R-33 — a
nullable `phase_type` on `meal_plan_templates`, written by the two RPCs that
create templates — then rebuilds the library page and the save/apply dialogs on
top of it. Everything visual reuses what waves 0-3 already built (`PageShell`,
`PhaseChip`, `ResponsiveDialog`, `WeekStrip`, the tone core). PR-B rebuilds the
template editor, including the mobile layout it has never had.

**Tech Stack:** React 18 + TS, Tailwind v4 `@theme` tokens, shadcn/ui,
react-i18next (`planning` namespace), TanStack Query, Supabase (Postgres +
pgTAP), Vitest + Testing Library.

## Global Constraints

- **Metric only** (kg/cm/g).
- **The schema change is scoped and specified** — see
  `docs/superpowers/specs/2026-07-11-r33-wave4-template-phase.md`. One nullable
  column, two RPC signatures. **No RLS change.** Both RPCs stay `SECURITY
  INVOKER` with an explicit `search_path` (hard invariant 3). Nothing else in
  the schema moves.
- **`phase_type` is nullable and stays nullable.** An untagged template renders
  **neutrally** — never guess a phase for it, never fall back to the user's
  active phase.
- **Regenerating `src/types/database.ts` overwrites the whole file** — it is
  generated, so hand-edits elsewhere in it are lost. Regenerate it, do not
  hand-patch it.
- **Tier-3 (pgTAP) is a required CI job.** A schema/RPC change without pgTAP
  coverage does not merge.
- **Every new string in ES *and* EN** (`src/i18n/{es,en}/planning.json`).
- **Zero hardcoded colours** — only `@theme` tokens (`phase-*`, `tone-*`,
  `accent-*`, `text-dim`, `muted`, `border`, `card`). Numbers carry `tnum`.
  Icon-only controls carry an accessible name.
- `pnpm lint` + `pnpm build` + `pnpm test` green before any push.
- **No AI/Claude attribution anywhere** — plain conventional commits.
- **Do not open the PR until every gate has passed, the visual pass included.**
  A repo workflow auto-merges a `claude/*` PR the moment CI turns green.

## Source authority

- Canvas library + editor + apply: `/mnt/d/dev/claude-design-hudson-fitness/src/planificador-plantillas.jsx`
  (`PlantillasLib`, `TemplateCardPhase`, `TplDotGridColor`, `PhasePicker`,
  `PlantillaEditor`, `VerPlantilla`, `WeekStrip`, `AplicarConfirmModal`).
- Canvas save-as-template modal: `.../src/planificador-template-modal.jsx`
  (`GuardarPlantillaV1`, `MiniWeek`, `TemplateCardPhase`).
- Canvas mobile: `.../src/plantillas-mobile.jsx`.
- R-33 spec §6 wave 4; the schema amendment spec named above.

## Decisions locked before implementation

| Decision | Why |
|---|---|
| **Templates get a nullable `phase_type`** | Gonzalo's call. Without it, phase-tinted cards, phase filter chips and the save modal's phase picker all collapse. See the spec. |
| **The "Auto" badge is dropped** | `is_auto_generated` is never set to `true` anywhere — the badge advertises a mechanism that does not exist. The column stays; the UI and its i18n keys go. |
| **No separate read-only "Ver plantilla" page** | The canvas has one because its editor is a separate screen; ours is `/templates/:id` and is directly editable. Adding a read view would be net-new. Stripped. |
| **`useDailyTarget()` still drives the editor's macro targets** | It reflects the user's *current* phase. A template's own `phase_type` is a label, not a target source — a cut template's grid is still scored against what the user is doing today. Do not rewire the targets to the template's phase. |
| **The template editor gets a mobile layout for the first time** (PR-B) | It is the only grid in the app with no `md:` split — today mobile users get a horizontally-scrolled desktop grid. Spec §6 asks for the 7-day selector strip. |

## File structure (PR-A)

| File | Responsibility |
|---|---|
| `supabase/migrations/<ts>_r33_template_phase.sql` *(new)* | The column + both RPCs, recreated. |
| `supabase/tests/04_rpc.test.sql` *(modify)* | pgTAP: constraint, round-trip on both RPCs, RLS still holds. |
| `src/types/database.ts` *(regenerate)* | Generated — do not hand-edit. |
| `src/features/templates/api.ts` *(modify)* | `phase_type` in the list/detail selects and in `SaveTemplatePayload`; pass it to the RPC. |
| `src/features/planner/api.ts` *(modify)* | `saveWeekAsTemplate(weekId, name, phaseType)`. |
| `src/features/planner/hooks.ts` *(modify)* | Thread the phase through `useSaveWeekAsTemplate`. |
| `src/components/ui/PhasePicker.tsx` *(new)* | 3-up phase selector (cut/bulk/maintenance) + a "sin fase" option. Shared with wave 8 (Objetivos). |
| `src/features/templates/components/TemplateCard.tsx` *(new)* | Phase-tinted card: phase strip, name, 7×4 dot minigrid, meals/day + slot count, updated_at, edit/delete. |
| `src/features/templates/components/TemplateDotGrid.tsx` *(new)* | The 7×4 minigrid: a dot per (day × meal), filled where a slot exists. Pure. |
| `src/pages/PlantillasPage.tsx` *(rewrite)* | Phase filter chips + the new card grid + the new-template tile. |
| `src/features/planning/components/SaveAsTemplateDialog.tsx` *(rewrite)* | `ResponsiveDialog` + name + `PhasePicker` + a live preview card. |
| `src/features/planning/components/ApplyTemplateDialog.tsx` *(rewrite)* | `ResponsiveDialog` + template list (phase-tinted) + the apply-confirm `WeekStrip` showing exactly which days get filled. |
| `src/i18n/{es,en}/planning.json` *(modify)* | New keys; delete the `list.autoBadge*` keys. |

`WeekStrip` (`src/features/planning/components/WeekStrip.tsx`, wave 3) is reused
by the apply-confirm. It currently takes `{days, target, phase, selected,
onSelect}` — the apply-confirm needs a **non-interactive, fill-state** variant.
Extend it additively (a `variant`/`fill` prop), do not fork it; the planner's
usage must not change.

---

## Task 1: Schema + RPCs + pgTAP

**Files:**
- Create: `supabase/migrations/<timestamp>_r33_template_phase.sql`
- Modify: `supabase/tests/04_rpc.test.sql`
- Regenerate: `src/types/database.ts`

**Interfaces produced:** `meal_plan_templates.phase_type text null`;
`save_template(p_template_id, p_name, p_same_schedule_all_days,
p_default_meal_times, p_slots, p_day_times, p_phase_type)`;
`save_week_as_template(p_week_id, p_name, p_phase_type)`.

- [ ] **Step 1: Write the migration**

Name it with a fresh timestamp AFTER the newest existing migration (`ls supabase/migrations/ | tail -1`).

```sql
-- R-33 wave 4 — a template carries the phase it was written for.
-- Spec: docs/superpowers/specs/2026-07-11-r33-wave4-template-phase.md
-- Nullable by design: every pre-existing template has no honest phase, and
-- "serves any phase" stays a legitimate permanent state. No FK to `phases` —
-- this is a label, not a reference to one dated phase.

alter table public.meal_plan_templates
  add column if not exists phase_type text
    check (phase_type is null or phase_type in ('cut', 'maintenance', 'bulk'));

-- Both RPCs change signature. A trailing defaulted parameter would create an
-- OVERLOAD and leave the old body callable, so drop first.
drop function if exists public.save_template(uuid, text, boolean, text[], jsonb, jsonb);

create function public.save_template(
  p_template_id uuid, p_name text, p_same_schedule_all_days boolean,
  p_default_meal_times text[], p_slots jsonb,
  p_day_times jsonb default '[]'::jsonb,
  p_phase_type text default null
)
returns uuid
language plpgsql
security invoker
set search_path to ''
as $$
declare
  v_user_id uuid;
  v_template_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if p_template_id is null then
    insert into public.meal_plan_templates
      (user_id, name, same_schedule_all_days, default_meal_times, phase_type)
    values
      (v_user_id, p_name, p_same_schedule_all_days, p_default_meal_times::time[], p_phase_type)
    returning id into v_template_id;
  else
    update public.meal_plan_templates
      set name = p_name,
          same_schedule_all_days = p_same_schedule_all_days,
          default_meal_times = p_default_meal_times::time[],
          phase_type = p_phase_type,
          updated_at = now()
      where id = p_template_id and user_id = v_user_id
      returning id into v_template_id;
    if v_template_id is null then
      raise exception 'template not found or not owned by user';
    end if;
    delete from public.meal_plan_template_slots where template_id = v_template_id;
    delete from public.meal_plan_template_day_times where template_id = v_template_id;
  end if;

  insert into public.meal_plan_template_slots
    (template_id, day_of_week, meal_index, recipe_id, servings, display_order)
  select v_template_id,
         (item->>'day_of_week')::int,
         (item->>'meal_index')::int,
         (item->>'recipe_id')::uuid,
         (item->>'servings')::numeric,
         coalesce((item->>'display_order')::int, 0)
  from jsonb_array_elements(p_slots) as item;

  if jsonb_array_length(p_day_times) > 0 then
    insert into public.meal_plan_template_day_times
      (template_id, day_of_week, meal_times)
    select v_template_id,
           (item->>'day_of_week')::int,
           (
             select array_agg(t::time)
             from jsonb_array_elements_text(item->'meal_times') t
           )
    from jsonb_array_elements(p_day_times) as item;
  end if;

  return v_template_id;
end;
$$;

grant execute on function public.save_template(uuid, text, boolean, text[], jsonb, jsonb, text) to authenticated;
```

Then the same treatment for `save_week_as_template`: read its current body in
`supabase/migrations/20260508080000_r00_baseline_schema.sql` (around line 604),
`drop function if exists public.save_week_as_template(uuid, text);`, and
recreate it **verbatim** except for a new trailing `p_phase_type text default
null` parameter and `phase_type` added to its `insert into
public.meal_plan_templates (...)` column list and values. Keep everything else
byte-for-byte — including `is_auto_generated = false`, the Monday-derived
`default_meal_times` fallback, and its `security invoker` + `search_path`
settings. Re-grant execute to `authenticated` with the new signature.

- [ ] **Step 2: Write the pgTAP tests**

Append a section to `supabase/tests/04_rpc.test.sql`, following the file's
existing style (JWT claims via `set_config`, `set local role authenticated`,
`lives_ok`/`throws_ok`/`is`). Cover:

```sql
-- ════════════════════════════════════════════════════════════════════════════
-- R-33 wave 4 — template phase_type
-- ════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;

-- the check constraint accepts the three phases and null, and rejects anything else
select lives_ok(
  $q$ select save_template(null, 'T cut', true, array['08:00','14:00'], '[]'::jsonb, '[]'::jsonb, 'cut') $q$,
  'save_template tags a template with a phase');

select lives_ok(
  $q$ select save_template(null, 'T none', true, array['08:00'], '[]'::jsonb, '[]'::jsonb, null) $q$,
  'save_template accepts a template with no phase');

select throws_ok(
  $q$ select save_template(null, 'T bogus', true, array['08:00'], '[]'::jsonb, '[]'::jsonb, 'bulking') $q$,
  '23514',
  null,
  'the check constraint rejects a phase that is not cut/maintenance/bulk');

select is(
  (select phase_type from meal_plan_templates where name = 'T cut'),
  'cut',
  'the phase round-trips on create');

-- update: re-tag, then clear back to null
select lives_ok(
  $q$ select save_template(
        (select id from meal_plan_templates where name = 'T cut'),
        'T cut', true, array['08:00','14:00'], '[]'::jsonb, '[]'::jsonb, 'bulk') $q$,
  'save_template re-tags an existing template');

select is(
  (select phase_type from meal_plan_templates where name = 'T cut'),
  'bulk',
  'the phase round-trips on update');

select lives_ok(
  $q$ select save_template(
        (select id from meal_plan_templates where name = 'T cut'),
        'T cut', true, array['08:00','14:00'], '[]'::jsonb, '[]'::jsonb, null) $q$,
  'save_template clears a phase back to null');

select is(
  (select phase_type from meal_plan_templates where name = 'T cut'),
  null,
  'a cleared phase really is null, not the old value');
```

Then a `save_week_as_template` case: build a `meal_plan_weeks` row with a slot
for user A (the file's earlier sections show the pattern for seeding a week),
call `save_week_as_template(week_id, 'From week', 'cut')`, and assert the new
template's `phase_type` is `'cut'`. Finish with an RLS check: as user B,
`select count(*) from meal_plan_templates where name = 'T cut'` must be 0.

Run the whole Tier-3 suite locally. From a develop-based worktree:
`supabase start` then the repo's db-test command (see `docs/operations.md` — it
is the same command CI's `db-test` job runs). Report the real output.

- [ ] **Step 3: Regenerate the types**

Regenerate `src/types/database.ts` from the local DB (the command is in
`docs/operations.md`). **Do not hand-edit the file** — it is generated wholesale.
Confirm afterwards that `meal_plan_templates.Row` carries `phase_type: string |
null` and that both RPC `Args` carry `p_phase_type`.

- [ ] **Step 4: Verify and commit**

Run: `pnpm typecheck` (it will fail where the app still calls the old RPC
signatures — that is Task 2's job; if it does fail, note exactly where and
proceed, do not paper over it by editing generated types).

```bash
git add supabase/migrations supabase/tests/04_rpc.test.sql src/types/database.ts
git commit -m "feat(db): tag a meal-plan template with the phase it was written for"
```

---

## Task 2: Data layer — thread the phase through

**Files:**
- Modify: `src/features/templates/api.ts`, `src/features/templates/hooks.ts`
- Modify: `src/features/planner/api.ts`, `src/features/planner/hooks.ts`
- Modify: `src/pages/PlantillaEditorPage.tsx` (call-site only — keep it compiling; PR-B restyles it)
- Modify: `src/pages/PlanificadorPage.tsx` (call-site only)

**Interfaces produced:**
```ts
// templates/api.ts
export type TemplatePhase = 'cut' | 'maintenance' | 'bulk';
export interface TemplateListItem { /* …existing… */ phase_type: TemplatePhase | null }
export interface TemplateDetail   { /* …existing… */ phase_type: TemplatePhase | null }
export interface SaveTemplatePayload { /* …existing… */ phaseType: TemplatePhase | null }
// planner/api.ts
export async function saveWeekAsTemplate(weekId: string, name: string, phaseType: TemplatePhase | null): Promise<string>
```

- [ ] **Step 1: Extend the selects and the payloads**

`listTemplates`'s select gains `phase_type`; `fetchTemplate`'s select gains
`phase_type`. **This is a `.select()` change — the R-32 standing rule applies:**
the mocked tests will not catch a typo in a select string, so after wiring it,
verify against the real DB (the local Supabase stack, or the app in the browser
against the QA user) that a template's `phase_type` really arrives. Say in your
report how you verified it.

`saveTemplate` passes `p_phase_type: payload.phaseType`. `saveWeekAsTemplate`
takes and passes the phase.

- [ ] **Step 2: Keep the call sites compiling**

`PlantillaEditorPage` and `PlanificadorPage` must still build. Pass `null` for
the phase for now with a one-line comment pointing at the task that fills it in
(Task 5 gives the editor a phase picker; Task 6 gives the save dialog one).
Do not build any UI here.

- [ ] **Step 3: Verify and commit**

Run: `pnpm typecheck && pnpm lint && pnpm vitest run src/features/templates/ src/features/planner/ src/pages/`

```bash
git add src/features/templates src/features/planner src/pages/PlantillaEditorPage.tsx src/pages/PlanificadorPage.tsx
git commit -m "feat(templates): carry the template phase through the data layer"
```

---

## Task 3: PhasePicker + TemplateDotGrid (the two pure pieces)

**Files:**
- Create: `src/components/ui/PhasePicker.tsx` + test
- Create: `src/features/templates/components/TemplateDotGrid.tsx` + test

**Interfaces produced:**
```ts
// PhasePicker — 3 phases + an explicit "no phase" choice. Shared with wave 8.
PhasePicker({ value, onChange, className }: {
  value: TemplatePhase | null;
  onChange: (phase: TemplatePhase | null) => void;
  className?: string;
})
// TemplateDotGrid — the canvas's 7×4 minigrid: a dot per (day, meal).
TemplateDotGrid({ mealCount, filled, phase, className }: {
  mealCount: number;                    // rows (the template's meal times)
  filled: boolean[][];                  // [dayOfWeek 0..6][mealIndex] → has a slot
  phase?: TemplatePhase | null;         // tints the filled dots; null = neutral
  className?: string;
})
```

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/ui/PhasePicker.test.tsx
import i18n from '@/i18n';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhasePicker } from './PhasePicker';

beforeAll(() => {
  void i18n.changeLanguage('es');
});

describe('PhasePicker', () => {
  it('offers the three phases and an explicit no-phase option', () => {
    render(<PhasePicker value={null} onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: /corte/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /volumen/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /mantenimiento/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /sin fase/i })).toBeInTheDocument();
  });

  it('marks the current value as checked', () => {
    render(<PhasePicker value="cut" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: /corte/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /sin fase/i })).not.toBeChecked();
  });

  it('emits the picked phase', async () => {
    const onChange = vi.fn();
    render(<PhasePicker value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: /volumen/i }));
    expect(onChange).toHaveBeenCalledWith('bulk');
  });

  it('emits null when the no-phase option is picked', async () => {
    const onChange = vi.fn();
    render(<PhasePicker value="cut" onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: /sin fase/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
```

```tsx
// src/features/templates/components/TemplateDotGrid.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TemplateDotGrid } from './TemplateDotGrid';

// 7 days × 2 meals; Monday breakfast and Sunday dinner filled.
const filled = Array.from({ length: 7 }, () => [false, false]);
filled[0][0] = true;
filled[6][1] = true;

describe('TemplateDotGrid', () => {
  it('renders one dot per day and meal', () => {
    const { container } = render(<TemplateDotGrid mealCount={2} filled={filled} />);
    expect(container.querySelectorAll('[data-dot]').length).toBe(14);
  });

  it('marks exactly the filled cells', () => {
    const { container } = render(<TemplateDotGrid mealCount={2} filled={filled} />);
    expect(container.querySelectorAll('[data-dot="on"]').length).toBe(2);
    expect(container.querySelector('[data-dot="on"][data-day="0"][data-meal="0"]')).not.toBeNull();
    expect(container.querySelector('[data-dot="on"][data-day="6"][data-meal="1"]')).not.toBeNull();
  });

  it('tints the filled dots by phase, and stays neutral without one', () => {
    const { container: cut } = render(<TemplateDotGrid mealCount={2} filled={filled} phase="cut" />);
    expect(cut.querySelector('[data-dot="on"]')?.className).toContain('bg-phase-cut');

    const { container: none } = render(<TemplateDotGrid mealCount={2} filled={filled} />);
    expect(none.querySelector('[data-dot="on"]')?.className).not.toContain('bg-phase-cut');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/components/ui/PhasePicker.test.tsx src/features/templates/components/TemplateDotGrid.test.tsx`
Expected: FAIL — unresolved imports.

- [ ] **Step 3: Add the i18n keys**

`src/i18n/es/planning.json`, a new top-level `phase` object (the three phase
LABELS already exist in the `objetivos` namespace at `phases.type.*` — reuse
those; only the no-phase option and the picker's own copy are new here):

```json
"phase": {
  "none": "Sin fase",
  "noneHint": "Sirve para cualquier fase",
  "pick": "Fase de la plantilla"
}
```

EN:

```json
"phase": {
  "none": "No phase",
  "noneHint": "Works for any phase",
  "pick": "Template phase"
}
```

- [ ] **Step 4: Implement**

`PhasePicker`: a `role="radiogroup"` (labelled `phase.pick`) of four
`role="radio"` buttons — cut / bulk / maintenance (labels from the `objetivos`
namespace, `phases.type.*`; tint each with its `phase-*-soft` / `-ink` / `-line`
tokens, exactly as `PhaseChip` does) plus "Sin fase" (neutral: `bg-muted`,
`border-border`). Selected state via `aria-checked` and a token-based ring. Do
NOT re-derive the phase→token mapping — import it from `PhaseChip` if it exports
one, otherwise mirror it and note the duplication in your report.

`TemplateDotGrid`: a `grid grid-cols-7` of `mealCount` rows. Each dot: a small
rounded square, `data-dot="on"|"off"`, `data-day`, `data-meal`. Filled dots take
`bg-phase-<phase>` when a phase is given, else `bg-muted-foreground/50`. Empty
dots take `bg-muted`. Purely presentational — no data access.

- [ ] **Step 5: Run tests, then commit**

Run: `pnpm vitest run src/components/ui/ src/features/templates/ && pnpm lint && pnpm typecheck`

```bash
git add src/components/ui/PhasePicker.tsx src/components/ui/PhasePicker.test.tsx src/features/templates/components/TemplateDotGrid.tsx src/features/templates/components/TemplateDotGrid.test.tsx src/i18n/es/planning.json src/i18n/en/planning.json
git commit -m "feat(templates): phase picker and the week dot-grid"
```

---

## Task 4: TemplateCard + the Plantillas library page

**Files:**
- Create: `src/features/templates/components/TemplateCard.tsx` + test
- Rewrite: `src/pages/PlantillasPage.tsx`
- Create: `src/pages/PlantillasPage.test.tsx`
- Modify: `src/i18n/{es,en}/planning.json` (delete `list.autoBadge` + `list.autoBadgeTooltip`)

**Interfaces:**
- Consumes: `TemplateDotGrid`, `PhaseChip`, `TemplateListItem` (now with `phase_type`), `useTemplates`, `useDeleteTemplate`.
- Produces: `TemplateCard({ template, filled, onDelete })`.

**The card (canvas `TemplateCardPhase`):** a phase-coloured top strip (neutral
when untagged), the name, a `PhaseChip` (omitted entirely when untagged — do not
render a "sin fase" chip on the card; the neutral strip already says it), the
`TemplateDotGrid`, and a footer with meals/day + slot count + `updated_at`, plus
edit and delete affordances. **The "Auto" badge is gone** — remove it and its two
i18n keys from both locales.

**The page:** phase filter chips (Todas / Corte / Volumen / Mantenimiento — and
the filter must also be able to show only untagged ones? NO: keep it to the four
chips; "Todas" covers untagged. Untagged templates appear only under "Todas"),
the responsive card grid, and the dashed "nueva plantilla" tile. Keep the
existing empty state and loading skeletons.

**Where `filled` comes from:** `listTemplates`'s select already pulls
`meal_plan_template_slots(id)` for the count. The dot grid needs
`(day_of_week, meal_index)` per slot — so the select must grow to
`meal_plan_template_slots(id, day_of_week, meal_index)`. **That is a `.select()`
change** — R-32 standing rule: verify it against the real DB, not just the
mocked tests, and say how in your report.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/features/templates/components/TemplateCard.test.tsx
import i18n from '@/i18n';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TemplateCard } from './TemplateCard';

const base = {
  id: 't1',
  name: 'Semana base',
  phase_type: 'cut' as const,
  default_meal_times: ['08:00', '14:00'],
  slot_count: 8,
  updated_at: '2026-05-20T10:00:00Z',
};

const filled = Array.from({ length: 7 }, () => [true, false]);

function renderCard(over: Partial<typeof base> = {}) {
  return render(
    <MemoryRouter>
      <TemplateCard template={{ ...base, ...over }} filled={filled} onDelete={vi.fn()} />
    </MemoryRouter>,
  );
}

beforeAll(() => {
  void i18n.changeLanguage('es');
});

describe('TemplateCard', () => {
  it('shows the name, the phase chip and the dot grid', () => {
    const { container } = renderCard();
    expect(screen.getByText('Semana base')).toBeInTheDocument();
    expect(screen.getByText('Corte')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-dot]').length).toBe(14);
  });

  it('renders an untagged template neutrally — no phase chip, no phase tint', () => {
    const { container } = renderCard({ phase_type: null });
    expect(screen.queryByText('Corte')).toBeNull();
    expect(screen.queryByText(/sin fase/i)).toBeNull();
    expect(container.querySelector('[data-phase-strip]')?.className).not.toContain('bg-phase-');
  });

  it('links to the editor', () => {
    renderCard();
    expect(screen.getByRole('link', { name: /semana base/i })).toHaveAttribute('href', '/templates/t1');
  });

  it('no longer shows an Auto badge', () => {
    renderCard();
    expect(screen.queryByText(/auto/i)).toBeNull();
  });
});
```

Write `PlantillasPage.test.tsx` alongside it (mock `useTemplates` /
`useDeleteTemplate`): it must prove that the phase chips FILTER — with a cut
template and a bulk template in the list, clicking "Corte" leaves only the cut
one on screen. Make that assertion discriminate (assert the bulk one is gone,
not just that the cut one is present).

- [ ] **Step 2: Run tests to verify they fail** — unresolved import / no filter chips.

- [ ] **Step 3: Implement the card, the page and the select change; delete the Auto badge keys.**

- [ ] **Step 4: Verify**

Run: `pnpm vitest run src/features/templates/ src/pages/ && pnpm lint && pnpm typecheck`
Then confirm the widened `.select()` against a real DB and report how.

- [ ] **Step 5: Commit**

```bash
git add src/features/templates/components/TemplateCard.tsx src/features/templates/components/TemplateCard.test.tsx src/pages/PlantillasPage.tsx src/pages/PlantillasPage.test.tsx src/features/templates/api.ts src/i18n/es/planning.json src/i18n/en/planning.json
git commit -m "feat(templates): phase-tinted library cards with a week dot-grid"
```

---

## Task 5: SaveAsTemplateDialog — name + phase + live preview

**Files:**
- Rewrite: `src/features/planning/components/SaveAsTemplateDialog.tsx` + a new test
- Modify: `src/pages/PlanificadorPage.tsx` (pass the phase through to `saveWeekAsTemplate`)

**Interfaces:** `SaveAsTemplateDialog({ open, onOpenChange, weekStart, onSave, busy })`
where `onSave(name: string, phaseType: TemplatePhase | null)`.

Canvas `GuardarPlantillaV1`: a `ResponsiveDialog` (`variant="centered"`) with the
name field, the `PhasePicker`, and a **live preview** of the card the user is
about to create (reuse `TemplateCard` — the preview tints as they pick a phase).
The default name stays `save.defaultName`. Default phase: **the user's currently
active phase** if there is one (that is a sensible default, not a guess baked
into the data — the user can clear it to "sin fase"); `useDailyTarget()` already
exposes `phaseType`.

Tests must prove: the picked phase reaches `onSave`; "sin fase" sends `null`;
the preview retints when the phase changes.

- [ ] Steps as in the previous tasks: failing test → run → implement → green → commit.

```bash
git commit -m "feat(planner): save a week as a phase-tagged template"
```

---

## Task 6: ApplyTemplateDialog — pick a template, see what it fills

**Files:**
- Rewrite: `src/features/planning/components/ApplyTemplateDialog.tsx` + a new test
- Modify: `src/features/planning/components/WeekStrip.tsx` (additive `fill` variant)

**Interfaces:** `ApplyTemplateDialog({ open, onOpenChange, targetDate, onApply, busy })`, unchanged.

The canvas's apply-confirm shows a `WeekStrip` marking exactly which days the
apply will fill — and this is where the **real semantics must be told truthfully**:
`apply_template_to_week(p_template_id, p_target_date)` deletes and refills
**from `p_target_date` through the Sunday of that same week**, and the UI always
passes `today`. So days earlier in the week are **left untouched**, and next week
is **not** touched at all. Draw exactly that: past days of the week marked as
untouched (locked), today→Sunday marked as fill. Do not draw next week — the
canvas does, but our RPC does not touch it, and drawing it would lie.

`WeekStrip` gains an additive, non-interactive `fill` mode: `fillFrom?: string`
(ISO date) + `variant?: 'select' | 'fill'`. The planner's existing usage must be
byte-identical — prove it by leaving `WeekStrip.test.tsx`'s existing cases
unedited.

Tests must prove: the strip marks past days as untouched and today→Sunday as
fill; picking a template and confirming calls `onApply` with its id; the
template list shows each template's phase.

- [ ] Steps as before.

```bash
git commit -m "feat(planner): apply-template confirm showing which days get filled"
```

---

## PR-A wrap-up (in this order — do NOT reorder)

- [ ] `pnpm lint && pnpm build && pnpm test` green, run by the controller. `git status` clean.
- [ ] **Tier-3**: the pgTAP suite passes locally (`supabase start` + the db-test command).
- [ ] **R-32**: both widened `.select()` strings verified against a real DB, not just mocks.
- [ ] Grep gate: no hex, no `bg-<palette>-<n>`, no leftover `autoBadge` keys.
- [ ] **Visual pass (spec §7)** at 390px and 1300px with the agent-browser harness + the QA user: the library (tinted cards, dot grids, phase filter chips, an untagged template rendering neutrally), the save dialog (picker + live preview), the apply confirm (the fill strip telling the truth about which days change).
- [ ] **Only then** `gh pr create`.

---

## PR-B — the template editor (outline)

Detailed steps get written once PR-A merges. The shape:

**B1 — Web editor restyle.** The 7×4 grid rebuilt on the wave-3 pieces: day
headers (a template has no dates — the header is the weekday plus that day's
`DaySummary` totals, scored against `useDailyTarget()`), the meal cells, the
meal-time gutter. `TemplateGrid` keeps its props; `SlotCell`/`DaySummary` get
replaced by the planner's `PlannerMealCell`-style cell (which will need its
date-free variant — the cell is currently date-agnostic already, so this is
mostly rewiring).

**B2 — Mobile editor (net-new).** The template editor is the only grid in the
app with no mobile layout — today mobile users pan a desktop grid sideways. Ship
the canvas's 7-day selector strip: pick a weekday, edit that day's meals as a
list (the planner's `TodayPlanList` shape, minus the date).

**B3 — The editor's own phase.** A `PhasePicker` in the editor's meta card, so a
template's phase can be changed after creation (Task 2 leaves the call site
passing `null`; this is where it starts passing the real value).

**B4 — Reuse the add drawer.** `AddRecipeDrawer` is coupled to a calendar `date`
(its destino chip formats one). The template editor works in `day_of_week`, so
the drawer needs its destination label injected rather than derived. That was
flagged during wave 3 as the thing that would bite here.

**B5 — Visual pass, then the PR.**

## Self-review notes

- Spec §6 wave-4 coverage: library grid with phase-tinted cards + dot minigrid →
  Tasks 3-4; "Guardar como plantilla" V1 modal → Task 5; apply-confirm with
  WeekStrip → Task 6; template view/editor (incl. the mobile 7-day strip) → PR-B.
- The separate read-only "Ver plantilla" page is stripped (our `/templates/:id`
  is already the editor).
- The apply-confirm deliberately does NOT draw next week, though the canvas does:
  `apply_template_to_week` does not touch it. Drawing it would be a lie.
