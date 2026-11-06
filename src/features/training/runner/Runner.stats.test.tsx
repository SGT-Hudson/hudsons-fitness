import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import i18n from '@/i18n';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: () => false }));
vi.mock('@/features/training/exercises/hooks', () => ({
  useExercise: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock('@/lib/stats', () => ({ track: vi.fn() }));

import { track } from '@/lib/stats';
import { Runner } from './Runner';
import { buildRunnerState, type RunnerInput } from '@/core/runner';

beforeAll(async () => { await i18n.changeLanguage('en'); });
afterAll(async () => { await i18n.changeLanguage('es'); });
beforeEach(() => vi.clearAllMocks());

function state(programId: string | null, routineId: string | null) {
  const input: RunnerInput = {
    programId, routineId, routineName: 'Push Day',
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

function walkAndSave(programId: string | null, routineId: string | null, onSave: () => Promise<unknown>) {
  const onSaved = vi.fn();
  render(
    <Runner
      initialState={state(programId, routineId)}
      names={{ bench: 'Bench Press' }}
      coachContextByExercise={{}}
      lastTimeByExercise={{ bench: '8 × 80 kg' }}
      onSave={onSave as never}
      onExit={() => {}}
      onSaved={onSaved}
    />,
  );
  fireEvent.click(screen.getByText('Begin'));
  fireEvent.click(screen.getByText('Start rest'));
  fireEvent.click(screen.getByText('Record set'));
  fireEvent.click(screen.getByText('Continue'));
  fireEvent.click(screen.getByText('Save workout'));
  return onSaved;
}

it.each([
  ['p1', 'r1', 'programa'],
  [null, 'r1', 'rutina'],
  [null, null, 'libre'],
])('tracks registrar-entreno after a saved workout (program %s, routine %s -> %s)', async (p, r, origen) => {
  const onSaved = walkAndSave(p, r, vi.fn().mockResolvedValue('new-id'));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(track).toHaveBeenCalledTimes(1);
  expect(track).toHaveBeenCalledWith('registrar-entreno', { origen });
});

it('tracks nothing when the save is rejected', async () => {
  const onSave = vi.fn().mockRejectedValue(new Error('fail'));
  const onSaved = walkAndSave('p1', 'r1', onSave);
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  await screen.findByText('fail');
  expect(onSaved).not.toHaveBeenCalled();
  expect(track).not.toHaveBeenCalled();
});
