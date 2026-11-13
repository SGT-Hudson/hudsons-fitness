// @vitest-environment jsdom
//
// R-33 wave 8 PR-B — the phase editor as a ROUTE. This file is the port of
// `PhaseDialog.test.tsx` (the crown jewel): the harness is new — a route, two
// mocked mutations and a location probe instead of an `open` dialog and an
// `onSave` prop — but **every guarantee it pinned is pinned here**, because
// what it protected was never the dialog:
//
//  - R-06: the fat field is a UI PERCENT and the column is a FRACTION. `27,5`
//    must store `0.275` — not `2.75` (the comma eaten by `type="number"`), not
//    NaN (`valueAsNumber` on a real comma). Assert the SUBMITTED PAYLOAD, never
//    the field's own value: a comma there is only corruption once it reaches
//    the number.
//  - The bounds `type="text"` took away from the DOM and gave to zod (fat
//    10–60, protein ≤ 4 g/kg, blank ≠ 0).
//  - R-02 notesOnly: every other field disabled — disabled, NOT blanked, so the
//    full schema still validates the notes-only save through the same path.
//  - R-05: the protein prefill re-anchors from the phase-type table, and NEVER
//    re-anchors a stored phase.
//  - The fractional fat prefill that must not round (0.275 → "27.5", never 28).
//
// NEW (the bug this wave owes): a `23P01` rejection is TOLD to the user, in
// their language, instead of leaving them stuck in front of a form that did
// nothing.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import i18n from '@/i18n';
import { PHASE_PROTEIN_DEFAULTS_G_PER_KG_LBM, pctToFraction } from '@/lib/macros';

// The page's import graph reaches `@/lib/supabase` (via ../api and the hooks),
// which throws at module load without VITE_SUPABASE_* — green locally, red in CI.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

const { createMut, updateMut, deleteMut, usePhases } = vi.hoisted(() => ({
  createMut: { mutateAsync: vi.fn(), isPending: false },
  updateMut: { mutateAsync: vi.fn(), isPending: false },
  deleteMut: { mutateAsync: vi.fn(), isPending: false },
  usePhases: vi.fn(),
}));
vi.mock('@/features/phases/hooks', () => ({
  usePhases: () => usePhases(),
  useCreatePhase: () => createMut,
  useUpdatePhase: () => updateMut,
  useDeletePhase: () => deleteMut,
}));

// The preview's wiring (B2): react-query hooks the harness has no provider
// for. Fixed values keep the derived numbers deterministic — weight 80 kg,
// bf 25 % → lean mass 60 kg; no TDEE estimate (the absolute-mode default
// keeps the preview visible, and the delta mode's needs-TDEE state testable).
vi.mock('@/features/measurements/hooks', () => ({
  useLatestMeasurement: () => ({ data: { weight_kg: 80, body_fat_pct: 25 } }),
  // R-37: the page also reads the recent history, for the calculator sheet's
  // Katch line (the newest reading that carries a body fat %).
  useRecentMeasurements: () => ({
    data: [{ weight_kg: 80, body_fat_pct: 25, measured_on: '2026-05-10' }],
  }),
}));
vi.mock('@/features/tdee/hooks', () => ({
  useLatestTdee: () => ({ data: null }),
}));
// R-37: same reason — the calculator's sex / age / height come off the profile.
vi.mock('@/features/profile/hooks', () => ({
  useProfile: () => ({
    data: { sex: 'male', birth_date: '1990-03-01', height_cm: 180 },
  }),
}));

import { PhaseEditorPage } from './PhaseEditorPage';
import type { Phase } from '@/features/phases/api';

// The editor's `start_date` defaults to the project's canonical Europe/Madrid
// "today" (`todayInTZ`). Freeze the clock at a fixed mid-day-UTC instant so that
// default — and the freeze rule (`isPhaseFrozen`) the notes-only tests depend on
// — are deterministic regardless of the host timezone (CI runs UTC; near a
// UTC/Madrid midnight boundary the date would otherwise drift).
// 2026-05-15T12:00:00Z is 2026-05-15 under both UTC and Europe/Madrid.
const FROZEN_NOW = new Date('2026-05-15T12:00:00Z');

function phase(over: Partial<Phase> = {}): Phase {
  return {
    id: 'p1',
    user_id: 'u1',
    name: 'Old cut',
    phase_type: 'cut',
    start_date: '2026-01-01',
    end_date: null,
    kcal_mode: 'absolute',
    kcal_value: 1800,
    protein_g_per_kg: 2.4,
    fat_pct_of_kcal: 0.25,
    fiber_mode: 'fixed_g',
    fiber_value: 30,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  } as Phase;
}

/** A phase that ended long past the 7-day grace window → R-02 notes-only. */
const frozenPhase = phase({ start_date: '2026-01-01', end_date: '2026-02-01' });

function Probe() {
  return <div data-testid="loc">{useLocation().pathname}</div>;
}

/** Mounts the two real routes, so the page reads its params exactly as in the app. */
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/progress/goals" element={<div>ObjetivosPage</div>} />
        <Route path="/progress/goals/phases/new" element={<PhaseEditorPage />} />
        <Route path="/progress/goals/phases/:id/edit" element={<PhaseEditorPage />} />
      </Routes>
      <Probe />
    </MemoryRouter>,
  );
}

const NEW_ROUTE = '/progress/goals/phases/new';
const EDIT_ROUTE = '/progress/goals/phases/p1/edit';

// PageShell mounts BOTH headers at once (BackHeader below md, PageHeaderV2 at
// md+; CSS hides one, and jsdom applies no CSS) — so every header action exists
// twice. Either node submits the same form.
const save = () => screen.getAllByRole('button', { name: i18n.t('common:save') })[0];
const field = (key: string) =>
  screen.getByLabelText(i18n.t(`objetivos:phases.form.${key}`)) as HTMLInputElement;

beforeEach(async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(FROZEN_NOW);
  createMut.mutateAsync.mockReset().mockResolvedValue(phase());
  updateMut.mutateAsync.mockReset().mockResolvedValue(phase());
  deleteMut.mutateAsync.mockReset().mockResolvedValue(undefined);
  usePhases.mockReset().mockReturnValue({ data: [phase()], isLoading: false });
  await i18n.changeLanguage('es');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PhaseEditorPage — validation (the gates the DOM no longer owns)', () => {
  it('rejects an out-of-range fat % and does not call the mutation', async () => {
    const user = userEvent.setup();
    renderAt(NEW_ROUTE);

    await user.type(field('name'), 'Cut Q3');

    const fat = field('fat');
    await user.clear(fat);
    await user.type(fat, '99'); // schema bound is 10–60

    await user.click(save());

    // zodResolver blocks submit; the mutation is never invoked.
    await waitFor(() => expect(createMut.mutateAsync).not.toHaveBeenCalled());
  });

  // `type="text"` drops the native min/max gates, so zod is the only thing left
  // enforcing them. protein's max (4 g/kg) lived ONLY in the DOM before R-06 —
  // this test is what keeps it from silently disappearing.
  it('rejects a protein g/kg above the 4 g/kg bound', async () => {
    const user = userEvent.setup();
    renderAt(NEW_ROUTE);

    await user.type(field('name'), 'Cut');

    const protein = field('protein');
    await user.clear(protein);
    await user.type(protein, '5');

    await user.click(save());

    await waitFor(() => expect(createMut.mutateAsync).not.toHaveBeenCalled());
    expect(
      screen.getByText(i18n.t('objetivos:phases.form.errors.protein')),
    ).toBeInTheDocument();
  });

  // Blank semantics: a required numeric field left empty must still block the
  // save. Blank must never become 0 or null here.
  it('does not submit when a required numeric field is left blank', async () => {
    const user = userEvent.setup();
    renderAt(NEW_ROUTE);

    await user.type(field('name'), 'Cut');
    await user.clear(field('fat'));

    await user.click(save());

    await waitFor(() => expect(createMut.mutateAsync).not.toHaveBeenCalled());
  });
});

describe('PhaseEditorPage — R-06, the percent/fraction boundary', () => {
  it('submits a valid phase with the fat % converted to a DB fraction', async () => {
    const user = userEvent.setup();
    renderAt(NEW_ROUTE);

    // start_date defaults to today (`todayInTZ`); only name + a valid fat are
    // needed for a valid submit (everything else has sane defaults).
    await user.type(field('name'), 'Maintenance');

    const fat = field('fat');
    await user.clear(fat);
    await user.type(fat, '30');

    await user.click(save());

    await waitFor(() => expect(createMut.mutateAsync).toHaveBeenCalledTimes(1));
    const payload = createMut.mutateAsync.mock.calls[0][0];
    expect(payload.name).toBe('Maintenance');
    // The field is a STRING (it dropped `valueAsNumber` when it became
    // `type="text"`), so the schema parses it — but the percent → fraction
    // conversion is still `pctToFraction`'s alone, at the form boundary.
    expect(payload.fat_pct_of_kcal).toBeCloseTo(pctToFraction(30), 10);
    expect(payload.fat_pct_of_kcal).toBeCloseTo(0.3, 10);
    // The other migrated fields keep shipping numbers, not strings.
    expect(payload.protein_g_per_kg).toBe(PHASE_PROTEIN_DEFAULTS_G_PER_KG_LBM.maintenance);
    expect(payload.kcal_value).toBe(2000);
    expect(payload.fiber_value).toBe(30);
  });

  // The decimal-comma fix, on the field hard invariant 6 was written for. A
  // Spanish keyboard puts `,` on the numeric keypad, so `27,5` is what a user
  // types. On the old `type="number"` element the browser stripped the comma
  // before RHF saw it (`27,5` → `"275"`) — and `valueAsNumber` on a real comma
  // returns NaN, so neither half of the fix works without the other.
  it('accepts a decimal comma in every migrated phase field (fat 27,5 → fraction 0.275)', async () => {
    const user = userEvent.setup();
    renderAt(NEW_ROUTE);

    await user.type(field('name'), 'Cut');

    const kcal = field('kcal');
    await user.clear(kcal);
    await user.type(kcal, '2500,5');

    const protein = field('protein');
    await user.clear(protein);
    await user.type(protein, '2,2');

    const fat = field('fat');
    await user.clear(fat);
    await user.type(fat, '27,5');

    const fiber = field('fiber');
    await user.clear(fiber);
    await user.type(fiber, '35,5');

    await user.click(save());

    await waitFor(() => expect(createMut.mutateAsync).toHaveBeenCalledTimes(1));
    const payload = createMut.mutateAsync.mock.calls[0][0];
    // R-06 headline: 27,5 % → 0.275, NOT 2.75 (comma eaten → 275) and NOT NaN.
    expect(payload.fat_pct_of_kcal).toBeCloseTo(0.275, 10);
    expect(payload.fat_pct_of_kcal).toBeCloseTo(pctToFraction(27.5), 10);
    expect(payload.kcal_value).toBeCloseTo(2500.5, 10);
    expect(payload.protein_g_per_kg).toBeCloseTo(2.2, 10);
    expect(payload.fiber_value).toBeCloseTo(35.5, 10);
  });

  // The fat field used to be integer-only (`step="1"`), so the prefill rounded.
  // Now that it accepts a fraction, rounding on prefill would silently rewrite a
  // stored 0.275 to 0.28 on the next save. `fat_pct_of_kcal` is numeric(4,3), so
  // one decimal of percent is exactly storable — keep it.
  it('prefills a fractional fat % without rounding it away (0.275 → 27.5)', async () => {
    usePhases.mockReturnValue({
      data: [phase({ fat_pct_of_kcal: 0.275 })],
      isLoading: false,
    });
    renderAt(EDIT_ROUTE);

    await waitFor(() => expect(field('fat').value).toBe('27.5'));
  });
});

describe('PhaseEditorPage — R-05, the protein prefill', () => {
  it('prefills protein g/kg from the phase-aware lean-mass table on a new phase', async () => {
    renderAt(NEW_ROUTE);

    // Default phase_type is "maintenance" → table default.
    await waitFor(() =>
      expect(Number(field('protein').value)).toBeCloseTo(
        PHASE_PROTEIN_DEFAULTS_G_PER_KG_LBM.maintenance,
        10,
      ),
    );
  });

  it('re-anchors the protein default when the phase type changes on a new phase', async () => {
    const user = userEvent.setup();
    renderAt(NEW_ROUTE);

    await user.click(screen.getByRole('radio', { name: i18n.t('objetivos:phases.type.cut') }));

    await waitFor(() =>
      expect(Number(field('protein').value)).toBeCloseTo(
        PHASE_PROTEIN_DEFAULTS_G_PER_KG_LBM.cut,
        10,
      ),
    );
  });

  it('never clobbers a protein the user typed, even when the type changes', async () => {
    const user = userEvent.setup();
    renderAt(NEW_ROUTE);

    const protein = field('protein');
    await user.clear(protein);
    await user.type(protein, '3,1');

    await user.click(screen.getByRole('radio', { name: i18n.t('objetivos:phases.type.bulk') }));

    // The table default for bulk would be something else entirely; the manual
    // override wins (`dirtyFields.protein_g_per_kg`).
    await waitFor(() => expect(field('protein').value).toBe('3,1'));
  });

  it('does NOT re-anchor protein for an existing phase (keeps the stored value)', async () => {
    // Deliberately not the table default.
    usePhases.mockReturnValue({
      data: [phase({ protein_g_per_kg: 1.234 })],
      isLoading: false,
    });
    renderAt(EDIT_ROUTE);

    await waitFor(() => expect(Number(field('protein').value)).toBeCloseTo(1.234, 10));
  });
});

describe('PhaseEditorPage — R-02, notes-only as a page mode', () => {
  beforeEach(() => {
    usePhases.mockReturnValue({ data: [frozenPhase], isLoading: false });
  });

  it('disables every non-notes field but keeps notes editable', () => {
    renderAt(EDIT_ROUTE);

    expect(screen.getByText(i18n.t('objetivos:phases.form.notesOnlyHint'))).toBeInTheDocument();
    expect(field('name')).toBeDisabled();
    expect(field('startDate')).toBeDisabled();
    expect(field('fat')).toBeDisabled();
    expect(field('protein')).toBeDisabled();
    // The phase-type control is a SegmentedControl now, not a Select — still locked.
    expect(screen.getByRole('radio', { name: i18n.t('objetivos:phases.type.cut') })).toBeDisabled();
    // Notes stay editable forever (D-A5 / R-02).
    expect(field('notes')).not.toBeDisabled();
  });

  // "Disabled, not blanked": the locked fields keep their real values, so the
  // FULL schema still validates a notes-only save through the same submit path.
  // A blanked field would fail `requiredNumericString` and the save would die
  // with no visible cause.
  it('saves the notes through the same submit path, with every stored value intact', async () => {
    const user = userEvent.setup();
    renderAt(EDIT_ROUTE);

    await user.type(field('notes'), 'Salió bien');
    await user.click(save());

    await waitFor(() => expect(updateMut.mutateAsync).toHaveBeenCalledTimes(1));
    expect(updateMut.mutateAsync.mock.calls[0][0]).toMatchObject({
      id: 'p1',
      patch: {
        notes: 'Salió bien',
        name: 'Old cut',
        phase_type: 'cut',
        kcal_value: 1800,
        protein_g_per_kg: 2.4,
        fat_pct_of_kcal: 0.25,
      },
    });
  });

  it('offers no delete on a frozen phase (history is closed)', () => {
    renderAt(EDIT_ROUTE);
    expect(
      screen.queryByRole('button', { name: i18n.t('objetivos:phases.delete') }),
    ).toBeNull();
  });
});

describe('PhaseEditorPage — the overlapping save (23P01)', () => {
  // THE bug this wave owes. `phases_user_id_daterange_excl` is an INCLUSIVE
  // daterange, so two phases sharing a single boundary day already overlap.
  // PostgREST rejects with a PLAIN OBJECT (not an `Error`), which is why
  // `toastError` degraded to "algo ha ido mal" — and `PhaseDialog` awaited the
  // rejection and did nothing, leaving the user in front of a form that had
  // silently failed.
  const overlapError = {
    code: '23P01',
    message: 'conflicting key value violates exclusion constraint',
    details: null,
    hint: null,
  };

  it('tells the user their dates collide with another phase, in their language', async () => {
    const user = userEvent.setup();
    createMut.mutateAsync.mockRejectedValue(overlapError);
    renderAt(NEW_ROUTE);

    await user.type(field('name'), 'Corte solapado');
    await user.click(save());

    await waitFor(() =>
      expect(
        screen.getByText(i18n.t('objetivos:phases.form.errors.overlap')),
      ).toBeInTheDocument(),
    );
    // …announced, and the user is still on the editor with their input intact —
    // not navigated away, and not stuck in front of a form that said nothing.
    expect(screen.getByRole('alert')).toHaveTextContent(
      i18n.t('objetivos:phases.form.errors.overlap'),
    );
    expect(screen.getByTestId('loc')).toHaveTextContent(NEW_ROUTE);
    expect(field('name')).toHaveValue('Corte solapado');
  });

  it('surfaces the overlap on an EDIT too, and keeps the editor open', async () => {
    const user = userEvent.setup();
    updateMut.mutateAsync.mockRejectedValue(overlapError);
    renderAt(EDIT_ROUTE);

    await user.click(save());

    await waitFor(() =>
      expect(
        screen.getByText(i18n.t('objetivos:phases.form.errors.overlap')),
      ).toBeInTheDocument(),
    );
    expect(screen.getByTestId('loc')).toHaveTextContent(EDIT_ROUTE);
  });

  // Any OTHER failure must not be swallowed either — it just is not the overlap.
  it('shows a non-overlap failure with its own message', async () => {
    const user = userEvent.setup();
    createMut.mutateAsync.mockRejectedValue(new Error('network down'));
    renderAt(NEW_ROUTE);

    await user.type(field('name'), 'Cut');
    await user.click(save());

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('network down'));
    expect(
      screen.queryByText(i18n.t('objetivos:phases.form.errors.overlap')),
    ).toBeNull();
  });

  it('clears the failure and leaves for the list once the save succeeds', async () => {
    const user = userEvent.setup();
    createMut.mutateAsync.mockRejectedValueOnce(overlapError).mockResolvedValueOnce(phase());
    renderAt(NEW_ROUTE);

    await user.type(field('name'), 'Cut');
    await user.click(save());
    await waitFor(() =>
      expect(
        screen.getByText(i18n.t('objetivos:phases.form.errors.overlap')),
      ).toBeInTheDocument(),
    );

    // The user fixes the dates and retries.
    await user.clear(field('startDate'));
    await user.type(field('startDate'), '2027-01-01');
    await user.click(save());

    await waitFor(() => expect(screen.getByText('ObjetivosPage')).toBeInTheDocument());
  });
});

describe('PhaseEditorPage — the route itself', () => {
  it('updates the phase behind the id, never creating a second one', async () => {
    const user = userEvent.setup();
    renderAt(EDIT_ROUTE);

    await user.clear(field('name'));
    await user.type(field('name'), 'Corte renombrado');
    await user.click(save());

    await waitFor(() => expect(updateMut.mutateAsync).toHaveBeenCalledTimes(1));
    expect(updateMut.mutateAsync.mock.calls[0][0]).toMatchObject({
      id: 'p1',
      patch: { name: 'Corte renombrado' },
    });
    expect(createMut.mutateAsync).not.toHaveBeenCalled();
    // Back to the list, and the editor is gone.
    await waitFor(() => expect(screen.getByText('ObjetivosPage')).toBeInTheDocument());
  });

  // A CREATE form at an edit URL would INSERT a second phase instead of updating
  // the one the user opened — and, with the exclusion constraint on the dates,
  // that insert would then collide with the very phase it was meant to edit.
  it('redirects to the list when the id resolves to no phase', () => {
    usePhases.mockReturnValue({ data: [], isLoading: false });
    renderAt(EDIT_ROUTE);

    expect(screen.getByText('ObjetivosPage')).toBeInTheDocument();
    expect(screen.queryByLabelText(i18n.t('objetivos:phases.form.name'))).toBeNull();
  });

  it('renders no editor while the phases are loading', () => {
    usePhases.mockReturnValue({ data: undefined, isLoading: true });
    renderAt(EDIT_ROUTE);

    expect(screen.queryByLabelText(i18n.t('objetivos:phases.form.name'))).toBeNull();
  });

  it('deletes the phase behind a confirm and returns to the list', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAt(EDIT_ROUTE);

    await user.click(
      screen.getAllByRole('button', { name: i18n.t('objetivos:phases.delete') })[0],
    );

    await waitFor(() => expect(deleteMut.mutateAsync).toHaveBeenCalledWith('p1'));
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});

describe('PhaseEditorPage — the live preview (B2)', () => {
  // weight 80 / bf 25 (the hook mocks) → lean 60 kg. The NEW form's defaults:
  // 2000 kcal absolute, maintenance protein 2.0 g/kg, fat 25 %, fiber 30 g.
  it('derives the preview from the defaults through the real macro maths', () => {
    renderAt(NEW_ROUTE);

    // kcal 2000 · protein 60×2 = 120 g · fat 2000×0.25/9 = 56 g ·
    // carbs (2000−480−500)/4 = 255 g · fiber 30 g
    expect(screen.getByTestId('preview-kcal')).toHaveTextContent('2000');
    expect(screen.getByText('120 g')).toBeInTheDocument();
    expect(screen.getByText('56 g')).toBeInTheDocument();
    expect(screen.getByText('255 g')).toBeInTheDocument();
  });

  it('typing a comma fat percent reaches the preview as the R-06 fraction', async () => {
    const user = userEvent.setup();
    renderAt(NEW_ROUTE);

    const fat = field('fat');
    await user.clear(fat);
    await user.type(fat, '27,5');

    // 27,5 % → fraction 0.275 → 2000×0.275/9 = 61 g. The two corruptions this
    // pins against: the eaten comma (275 % → schema-invalid) and the unscaled
    // percent (27.5 → 6111 g).
    expect(await screen.findByText('61 g')).toBeInTheDocument();
  });

  it('a blanked kcal field empties the preview to the incomplete hint — never zeros', async () => {
    const user = userEvent.setup();
    renderAt(NEW_ROUTE);

    await user.clear(field('kcal'));

    expect(await screen.findByRole('status')).toHaveTextContent(
      i18n.t('objetivos:phases.preview.incomplete'),
    );
    expect(screen.queryByTestId('preview-kcal')).not.toBeInTheDocument();
  });

  it('renders no preview in notes-only mode', () => {
    usePhases.mockReturnValue({ data: [frozenPhase], isLoading: false });
    renderAt(EDIT_ROUTE);

    expect(
      screen.queryByRole('region', { name: i18n.t('objetivos:phases.preview.title') }),
    ).not.toBeInTheDocument();
  });
});
