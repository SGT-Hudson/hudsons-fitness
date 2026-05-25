import { it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import i18n from '@/i18n';
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
