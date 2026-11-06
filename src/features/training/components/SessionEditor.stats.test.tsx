// @vitest-environment jsdom
import '@/i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('@/lib/stats', () => ({ track: vi.fn() }));
vi.mock('./ExercisePicker', () => ({ ExercisePicker: () => <div>pick mock</div> }));
vi.mock('../hooks', () => ({ useExerciseHistory: () => ({ data: [], isLoading: false }) }));
vi.mock('../exercises/hooks', () => ({
  useExerciseSearch: () => ({ data: [], isLoading: false }),
  useCreateExercise: () => ({ mutate: vi.fn(), isPending: false }),
  useExercise: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: () => false }));

import { track } from '@/lib/stats';
import type { Exercise } from '../exercises/api';
import type { SessionWithSets } from '../api';
import { SessionEditor } from './SessionEditor';

const BENCH_ID = '22222222-2222-2222-2222-222222222222';
const bench = {
  id: BENCH_ID, name_es: 'Press de banca', name_en: 'Bench press', equipment: 'barbell',
  primary_muscles: ['pec_lower'], secondary_muscles: [], images: [], default_increment_kg: 2.5,
} as unknown as Exercise;

const prefill = {
  programId: 'prog-1',
  routineId: 'rout-1',
  exercises: [
    { exerciseId: BENCH_ID, sets: [{ setIndex: 1, isWarmup: false, reps: null, weightKg: null, targetRepsMin: 8, targetRepsMax: 12, restSeconds: 120, targetRpe: null }] },
  ],
  exercisesById: { [BENCH_ID]: bench },
};

const initial: SessionWithSets = {
  id: 'session-1', user_id: 'user-1', performed_on: '2026-05-22', title: 'Push day', notes: null,
  program_id: null, routine_id: null, created_at: '', updated_at: '',
  workout_sets: [
    { id: 's1', session_id: 'session-1', exercise_id: BENCH_ID, set_index: 1, reps: 8, weight_kg: 70, rpe: 7, is_warmup: false, created_at: '' },
  ],
} as unknown as SessionWithSets;

function renderEditor(props: Partial<Parameters<typeof SessionEditor>[0]>, onSubmit = vi.fn().mockResolvedValue('saved-id')) {
  const onSaved = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <SessionEditor initial={null} onSubmit={onSubmit} onSaved={onSaved} {...props} />
    </QueryClientProvider>,
  );
  return { onSubmit, onSaved };
}

const saveButton = () => screen.getByRole('button', { name: i18n.t('entrenamiento:editor.save') });

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage('es');
});

describe('SessionEditor events', () => {
  it('tracks registrar-entreno (manual) when a new session is saved', async () => {
    const user = userEvent.setup();
    const { onSaved } = renderEditor({ prefill });
    await user.click(saveButton());
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('registrar-entreno', { origen: 'manual' });
  });

  it('tracks nothing when editing an existing session', async () => {
    const user = userEvent.setup();
    const { onSaved } = renderEditor({ initial, initialExercises: { [BENCH_ID]: bench } });
    await user.click(saveButton());
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(track).not.toHaveBeenCalled();
  });

  it('tracks nothing when the save is rejected', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error('fail'));
    const { onSaved } = renderEditor({ prefill }, onSubmit);
    await user.click(saveButton());
    await screen.findByText('fail');
    expect(onSaved).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });
});
