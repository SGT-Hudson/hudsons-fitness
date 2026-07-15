import { it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '@/i18n';
import { ExerciseStart } from './ExerciseStart';
import { buildRunnerState, type RunnerInput } from '@/core/runner';

beforeAll(async () => { await i18n.changeLanguage('en'); });
afterAll(async () => { await i18n.changeLanguage('es'); });

function exercise() {
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
  return buildRunnerState(input).exercises[0];
}

function renderStart(onSetWorkingWeight = vi.fn()) {
  render(
    <ExerciseStart
      exercise={exercise()}
      exerciseName="Bench Press"
      coachContext={null}
      onSetWorkingWeight={onSetWorkingWeight}
      onBegin={vi.fn()}
    />,
  );
  return onSetWorkingWeight;
}

// The working-weight anchor is controlled by a NUMBER in the runner state, which
// is what makes it fragile in two directions: a `type="number"` element strips a
// typed comma (`82,5` → an 825 kg anchor), and a naive `type="text"` that parses
// and echoes back on every keystroke eats the comma the instant it is typed, so
// a decimal can never be reached at all. `userEvent` (not `fireEvent`) is what
// exposes either one — it drives the keystrokes through the real element.

it('commits a comma-typed working weight as a decimal', async () => {
  const onSetWorkingWeight = renderStart();

  const anchor = screen.getByLabelText("Today's working weight");
  await userEvent.clear(anchor);
  await userEvent.type(anchor, '82,5');

  expect(anchor).toHaveValue('82,5');                    // the comma survives the round-trip
  expect(onSetWorkingWeight).toHaveBeenLastCalledWith(82.5);
});

it('does not commit a half-typed or unparseable anchor', async () => {
  const onSetWorkingWeight = renderStart();

  const anchor = screen.getByLabelText("Today's working weight");
  await userEvent.clear(anchor);                        // clearing commits 0, as `Number('')` did
  expect(onSetWorkingWeight).toHaveBeenLastCalledWith(0);

  await userEvent.type(anchor, 'x');                    // garbage commits nothing (it used to send NaN)
  expect(anchor).toHaveValue('x');
  expect(onSetWorkingWeight).toHaveBeenLastCalledWith(0);
});
