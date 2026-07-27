import { it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '@/i18n';

// Runner renders ExerciseOverview, which now imports ExerciseInfoButton — pulling
// in @/lib/supabase (throws without env), useExercise (needs a QueryClient), and
// useMediaQuery (needs window.matchMedia). Mock them so the runner flow renders;
// the detail popup stays closed in these tests.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: () => false }));
const searchResults: { id: string; name_es: string; name_en: string; equipment: string | null }[] = [];
vi.mock('@/features/training/exercises/hooks', () => ({
  useExercise: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useExerciseSearch: () => ({ data: searchResults, isLoading: false }),
  useCreateExercise: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

import { Runner } from './Runner';
import { buildRunnerState, type RunnerInput } from '@/core/runner';
import { EXTRAS_KEY } from './useRunnerDraft';

beforeAll(async () => { await i18n.changeLanguage('en'); });
afterAll(async () => { await i18n.changeLanguage('es'); });
// Runner now seeds/mirrors `extras` (added-exercise display data) to
// localStorage (R-46 review finding); isolate each test from the others.
beforeEach(() => localStorage.clear());

function state() {
  const input: RunnerInput = {
    programId: 'p1', routineId: 'r1', routineName: 'Push Day',
    performedOn: '2026-05-25', nowMs: 1_000_000,
    exercises: [{
      exerciseId: 'bench', position: 1, targetSets: 1, targetRepsMin: 8, targetRepsMax: 8,
      restSeconds: 90, targetRpe: 8, defaultIncrementKg: 2.5,
      warmupSets: [], lastWorkingWeightKg: 80,
      workingSetPrefill: [{ reps: 8, weightKg: 80 }],
    }],
  };
  return buildRunnerState(input);
}

const names = { bench: 'Bench Press' };

const curlRow = {
  id: 'curl', name_es: 'Curl de bíceps', name_en: 'Biceps Curl',
  default_increment_kg: 1.25, primary_muscles: ['biceps'], equipment: null,
};

function fakeLoad(overrides = {}) {
  return vi.fn().mockResolvedValue({
    input: {
      exerciseId: 'curl', targetSets: 3, targetRepsMin: 8, targetRepsMax: 12,
      restSeconds: null, targetRpe: null, defaultIncrementKg: 1.25, warmupSets: [],
      lastWorkingWeightKg: 14,
      workingSetPrefill: [
        { reps: 12, weightKg: 14 }, { reps: 12, weightKg: 14 }, { reps: 10, weightKg: 14 },
      ],
    },
    name: 'Biceps Curl',
    lastTimeLabel: '10 × 14 kg',
    coachContext: {
      exerciseId: 'curl', primaryMuscles: ['biceps'], equipment: null,
      defaultIncrementKg: 1.25, history: [], todayISO: '2026-07-26',
    },
    ...overrides,
  });
}

async function openOverview() {
  // The header button's accessible name comes from its aria-label
  // (runner.jumpToExercise), which overrides its visible text (runner.switchExercise).
  await userEvent.click(screen.getByRole('button', { name: i18n.t('entrenamiento:runner.jumpToExercise') }));
}

function renderRunner(onSave = vi.fn().mockResolvedValue('new-id'), onLoadExercise = fakeLoad()) {
  render(
    <Runner
      initialState={state()}
      names={names}
      coachContextByExercise={{}}
      lastTimeByExercise={{ bench: '8 × 80 kg' }}
      onSave={onSave}
      onExit={() => {}}
      onSaved={vi.fn()}
      onLoadExercise={onLoadExercise}
    />,
  );
  return onSave;
}

it('walks begin → start rest → record → finish → save with correct payload', async () => {
  const onSave = vi.fn().mockResolvedValue('new-id');
  const onSaved = vi.fn();
  render(
    <Runner
      initialState={state()}
      names={names}
      coachContextByExercise={{}}
      lastTimeByExercise={{ bench: '8 × 80 kg' }}
      onSave={onSave}
      onExit={() => {}}
      onSaved={onSaved}
      onLoadExercise={fakeLoad()}
    />,
  );

  fireEvent.click(screen.getByText('Begin'));            // exercise-start → set READY
  fireEvent.click(screen.getByText('Start rest'));       // READY → RESTING
  fireEvent.click(screen.getByText('Record set'));       // record last set → exercise-complete
  fireEvent.click(screen.getByText('Continue'));         // → finishing → review (no skips)
  fireEvent.click(screen.getByText('Save workout'));

  await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  const payload = onSave.mock.calls[0][0];
  expect(payload.routineId).toBe('r1');
  expect(payload.programId).toBe('p1');
  expect(payload.sets).toEqual([
    { exercise_id: 'bench', set_index: 1, reps: 8, weight_kg: 80, rpe: 8, is_warmup: false },
  ]);
});

// The runner's weight fields are controlled by a NUMBER in the runner state, so
// they are the ones the decimal-comma fix can regress in two different ways: the
// browser stripping the comma (`82,5` → 825 kg logged), or — once the field is
// `type="text"` — the parse-and-echo round-trip eating the comma as it is typed,
// leaving the user unable to reach a decimal at all. Both are only visible when
// the keystrokes are driven one at a time and the SAVED payload is asserted, so
// these use `userEvent` (a `fireEvent.change` would bypass the browser's own
// sanitisation and pass against the broken code).

it('logs a comma-typed set weight as a decimal, not a 10× load', async () => {
  const onSave = renderRunner();

  fireEvent.click(screen.getByText('Begin'));
  fireEvent.click(screen.getByText('Start rest'));       // READY → RESTING (fields editable)

  const weight = screen.getByLabelText('Weight');
  await userEvent.clear(weight);
  await userEvent.type(weight, '82,5');
  expect(weight).toHaveValue('82,5');                    // the comma survives the re-render

  fireEvent.click(screen.getByText('Record set'));
  fireEvent.click(screen.getByText('Continue'));
  fireEvent.click(screen.getByText('Save workout'));

  await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  expect(onSave.mock.calls[0][0].sets[0].weight_kg).toBe(82.5);
});

it('leaves reps on the integer spinner — there is no comma to lose there', () => {
  renderRunner();
  fireEvent.click(screen.getByText('Begin'));
  fireEvent.click(screen.getByText('Start rest'));

  expect(screen.getByLabelText('Reps')).toHaveAttribute('type', 'number');
  expect(screen.getByLabelText('Weight')).toHaveAttribute('type', 'text');
});

it('adds an exercise from the overview panel', async () => {
  searchResults.length = 0;
  searchResults.push(curlRow);
  const onLoadExercise = fakeLoad();
  renderRunner(vi.fn(), onLoadExercise);

  await openOverview();
  await userEvent.click(screen.getByRole('button', { name: i18n.t('entrenamiento:runner.addExercise') }));
  await userEvent.click(screen.getByPlaceholderText(i18n.t('entrenamiento:picker.placeholder')));
  await userEvent.click(await screen.findByText('Biceps Curl'));

  expect(onLoadExercise).toHaveBeenCalledWith(expect.objectContaining({ id: 'curl' }));
  // back on the overview, listed last with its resolved name and position
  expect(await screen.findByText(/Biceps Curl/)).toBeInTheDocument();
});

// The contract says onLoadExercise never rejects (see loadAddedExercise), but
// Runner shouldn't rely on that: a rejection must not become an unhandled
// promise rejection nor a silent no-op that leaves the user staring at nothing.
it('does not add the exercise or crash when onLoadExercise rejects', async () => {
  searchResults.length = 0;
  searchResults.push(curlRow);
  const onLoadExercise = vi.fn().mockRejectedValue(new Error('lookup failed'));
  renderRunner(vi.fn(), onLoadExercise);

  await openOverview();
  await userEvent.click(screen.getByRole('button', { name: i18n.t('entrenamiento:runner.addExercise') }));
  await userEvent.click(screen.getByPlaceholderText(i18n.t('entrenamiento:picker.placeholder')));
  await userEvent.click(await screen.findByText('Biceps Curl'));

  await vi.waitFor(() => expect(onLoadExercise).toHaveBeenCalled());
  // No phantom exercise was added — the overview still shows only 'bench'.
  expect(screen.queryByText(/Biceps Curl/)).not.toBeInTheDocument();
});

it('hides exercises already in the session from the picker', async () => {
  searchResults.length = 0;
  searchResults.push(curlRow, { id: 'bench', name_es: 'Press banca', name_en: 'Bench Press', equipment: null });
  renderRunner(vi.fn(), fakeLoad());

  await openOverview();
  await userEvent.click(screen.getByRole('button', { name: i18n.t('entrenamiento:runner.addExercise') }));
  await userEvent.click(screen.getByPlaceholderText(i18n.t('entrenamiento:picker.placeholder')));

  // Scoped to the picker's results dropdown — the overview panel behind the
  // dialog also renders "Bench Press" (as "1 · Bench Press"), so an unscoped
  // query would pass for the wrong reason.
  const list = await screen.findByRole('list');
  expect(within(list).getByText('Biceps Curl')).toBeInTheDocument();
  // 'bench' is the routine's only exercise; it must not be offered again
  expect(within(list).queryAllByText('Bench Press')).toHaveLength(0);
});

it('still adds the exercise when the prefill lookup fails', async () => {
  searchResults.length = 0;
  searchResults.push(curlRow);
  const onLoadExercise = fakeLoad({
    input: {
      exerciseId: 'curl', targetSets: 3, targetRepsMin: 8, targetRepsMax: 12,
      restSeconds: null, targetRpe: null, defaultIncrementKg: 2.5, warmupSets: [],
      lastWorkingWeightKg: null,
      workingSetPrefill: [
        { reps: 8, weightKg: null }, { reps: 8, weightKg: null }, { reps: 8, weightKg: null },
      ],
    },
    lastTimeLabel: null,
  });
  renderRunner(vi.fn(), onLoadExercise);

  await openOverview();
  await userEvent.click(screen.getByRole('button', { name: i18n.t('entrenamiento:runner.addExercise') }));
  await userEvent.click(screen.getByPlaceholderText(i18n.t('entrenamiento:picker.placeholder')));
  await userEvent.click(await screen.findByText('Biceps Curl'));

  expect(await screen.findByText(/Biceps Curl/)).toBeInTheDocument();
});

// A resumed draft (PWA reload mid-workout) rebuilds `initialState` from
// localStorage complete with the added exercise, but `RunnerPage` rebuilds
// `names`/`coachContextByExercise`/`lastTimeByExercise` from the routine only
// — which has no row for it. Without persisting `extras` too, the merged maps
// would lose the added exercise's display data on exactly this path.
function stateWithAddedExercise() {
  const input: RunnerInput = {
    programId: 'p1', routineId: 'r1', routineName: 'Push Day',
    performedOn: '2026-05-25', nowMs: 1_000_000,
    exercises: [
      {
        exerciseId: 'bench', position: 1, targetSets: 1, targetRepsMin: 8, targetRepsMax: 8,
        restSeconds: 90, targetRpe: 8, defaultIncrementKg: 2.5,
        warmupSets: [], lastWorkingWeightKg: 80,
        workingSetPrefill: [{ reps: 8, weightKg: 80 }],
      },
      {
        exerciseId: 'curl', position: 2, targetSets: 3, targetRepsMin: 8, targetRepsMax: 12,
        restSeconds: null, targetRpe: null, defaultIncrementKg: 1.25,
        warmupSets: [], lastWorkingWeightKg: 14,
        workingSetPrefill: [
          { reps: 12, weightKg: 14 }, { reps: 12, weightKg: 14 }, { reps: 10, weightKg: 14 },
        ],
      },
    ],
  };
  return buildRunnerState(input);
}

const curlExtrasEntry = {
  name: 'Biceps Curl',
  lastTime: '10 × 14 kg',
  coach: {
    exerciseId: 'curl', primaryMuscles: ['biceps'], equipment: null,
    defaultIncrementKg: 1.25, history: [], todayISO: '2026-07-26',
  },
};

it('resumes a draft with an added exercise\'s display data intact', async () => {
  // Simulates a reload: the draft (initialState) already has 'curl' in
  // state.exercises, and its display data was mirrored to storage before the
  // reload, stamped for this exact session (routineId 'r1', startedAtMs
  // 1_000_000 — see stateWithAddedExercise) — but the routine-derived `names`
  // prop below only knows 'bench'.
  localStorage.setItem(EXTRAS_KEY, JSON.stringify({
    routineId: 'r1',
    startedAtMs: 1_000_000,
    map: { curl: curlExtrasEntry },
  }));

  render(
    <Runner
      initialState={stateWithAddedExercise()}
      names={names}
      coachContextByExercise={{}}
      lastTimeByExercise={{ bench: '8 × 80 kg' }}
      onSave={vi.fn()}
      onExit={() => {}}
      onSaved={vi.fn()}
      onLoadExercise={fakeLoad()}
    />,
  );

  await openOverview();
  // Resolved name, not the raw 'curl' id the routine-derived `names` would fall back to.
  expect(await screen.findByText(/2 · Biceps Curl/)).toBeInTheDocument();
});

it('does not adopt another session\'s stale extras', async () => {
  // Stamped for a *different* session (an abandoned draft from another
  // routine, tab closed / phone died, never discarded or saved). Starting
  // this session must render this session's own routine-provided name for
  // 'curl', not the stale one — a plausible collision, since routines share
  // one exercise catalog.
  localStorage.setItem(EXTRAS_KEY, JSON.stringify({
    routineId: 'a-different-routine',
    startedAtMs: 999,
    map: { curl: curlExtrasEntry },
  }));

  render(
    <Runner
      initialState={stateWithAddedExercise()}
      names={{ ...names, curl: 'Hammer Curl' }} // this session's own routine-provided name
      coachContextByExercise={{}}
      lastTimeByExercise={{ bench: '8 × 80 kg' }}
      onSave={vi.fn()}
      onExit={() => {}}
      onSaved={vi.fn()}
      onLoadExercise={fakeLoad()}
    />,
  );

  await openOverview();
  expect(await screen.findByText(/2 · Hammer Curl/)).toBeInTheDocument();
  expect(screen.queryByText(/Biceps Curl/)).not.toBeInTheDocument();
});
