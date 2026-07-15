import { it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '@/i18n';

// Runner renders ExerciseOverview, which now imports ExerciseInfoButton — pulling
// in @/lib/supabase (throws without env), useExercise (needs a QueryClient), and
// useMediaQuery (needs window.matchMedia). Mock them so the runner flow renders;
// the detail popup stays closed in these tests.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: () => false }));
vi.mock('@/features/training/exercises/hooks', () => ({
  useExercise: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
}));

import { Runner } from './Runner';
import { buildRunnerState, type RunnerInput } from '@/core/runner';

beforeAll(async () => { await i18n.changeLanguage('en'); });
afterAll(async () => { await i18n.changeLanguage('es'); });

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

function renderRunner(onSave = vi.fn().mockResolvedValue('new-id')) {
  render(
    <Runner
      initialState={state()}
      names={names}
      coachContextByExercise={{}}
      lastTimeByExercise={{ bench: '8 × 80 kg' }}
      onSave={onSave}
      onExit={() => {}}
      onSaved={vi.fn()}
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
