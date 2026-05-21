// @vitest-environment jsdom
//
// Tier-2 component test for the SessionEditor. The save mutation is
// injected as a prop (mirrors PhaseDialog.onSave), so the test asserts
// against a vi.fn() spy rather than mocking TanStack.
//
// ExercisePicker is mocked because the real one debounces Supabase
// queries; we replace it with a stub that doesn't query anything.
// useExerciseHistory (the only hook the editor's children consume) is
// mocked to a synchronous empty result.
//
// The deep "type into inputs then submit" interaction is brittle under
// jsdom + RHF nested-field-arrays (RHF can swallow synthetic key
// events into Number inputs); instead we exercise the EDIT path with a
// pre-filled `initial` SessionWithSets, which deterministically renders
// all the form values and lets us assert the flatten-on-submit logic.
import '@/i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

import type { Exercise } from '../exercises/api';
import type { SessionWithSets } from '../api';
import { SessionEditor } from './SessionEditor';

const mockExercise: Exercise = {
  created_at: '2026-01-01T00:00:00Z',
  created_by_user_id: null,
  default_increment_kg: 2.5,
  equipment: 'barbell',
  id: '11111111-1111-1111-1111-111111111111',
  is_verified: true,
  name_en: 'Bench press',
  name_es: 'Press de banca',
  primary_muscle: 'chest',
  source: 'system',
  updated_at: '2026-01-01T00:00:00Z',
};

vi.mock('./ExercisePicker', () => ({
  ExercisePicker: ({ selected }: { selected: Exercise | null }) => (
    <div data-testid={selected ? 'picker-selected' : 'picker-empty'}>
      {selected ? selected.name_es : 'pick mock'}
    </div>
  ),
}));

vi.mock('../hooks', () => ({
  useExerciseHistory: () => ({ data: [], isLoading: false }),
}));

function renderEditor(props: Partial<Parameters<typeof SessionEditor>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue('saved-id');
  const onSaved = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <SessionEditor initial={null} onSubmit={onSubmit} onSaved={onSaved} {...props} />
    </QueryClientProvider>,
  );
  return { onSubmit, onSaved };
}

beforeEach(async () => {
  await i18n.changeLanguage('es');
});

describe('SessionEditor (Tier-2)', () => {
  it('renders an empty editor with one block prompting the user to pick an exercise', () => {
    renderEditor();
    expect(screen.getByTestId('picker-empty')).toBeTruthy();
  });

  it('flattens an edited session into the expected save_workout payload (per-block re-indexed set_index)', async () => {
    const user = userEvent.setup();

    // Two-exercise pre-existing session — three bench sets + two squat
    // sets, set_index already contiguous. Re-saving should produce the
    // same flat payload, exercise_id grouping preserved, set_index
    // restarted at 1 within each block.
    const initial: SessionWithSets = {
      id: 'session-1',
      user_id: 'user-1',
      performed_on: '2026-05-22',
      title: 'Push day',
      notes: null,
      created_at: '2026-05-22T10:00:00Z',
      updated_at: '2026-05-22T10:00:00Z',
      workout_sets: [
        {
          id: 's1', session_id: 'session-1', exercise_id: '22222222-2222-2222-2222-222222222222',
          set_index: 1, reps: 8, weight_kg: 70, rpe: 7, is_warmup: false,
          created_at: '2026-05-22T10:00:01Z',
        },
        {
          id: 's2', session_id: 'session-1', exercise_id: '22222222-2222-2222-2222-222222222222',
          set_index: 2, reps: 8, weight_kg: 70, rpe: 8, is_warmup: false,
          created_at: '2026-05-22T10:00:02Z',
        },
        {
          id: 's3', session_id: 'session-1', exercise_id: '33333333-3333-3333-3333-333333333333',
          set_index: 1, reps: 5, weight_kg: 100, rpe: 7.5, is_warmup: false,
          created_at: '2026-05-22T10:00:03Z',
        },
      ],
    };
    const benchExercise: Exercise = { ...mockExercise, id: '22222222-2222-2222-2222-222222222222' };
    const squatExercise: Exercise = {
      ...mockExercise,
      id: '33333333-3333-3333-3333-333333333333',
      name_es: 'Sentadilla',
      name_en: 'Squat',
    };

    const { onSubmit, onSaved } = renderEditor({
      initial,
      initialExercises: { '22222222-2222-2222-2222-222222222222': benchExercise, '33333333-3333-3333-3333-333333333333': squatExercise },
    });

    await user.click(screen.getByRole('button', { name: i18n.t('entrenamiento:editor.save') }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    const payload = onSubmit.mock.calls[0][0];
    expect(payload.sessionId).toBe('session-1');
    expect(payload.performedOn).toBe('2026-05-22');
    expect(payload.title).toBe('Push day');
    expect(payload.sets).toHaveLength(3);

    // Order: bench block first (input order in initial), squat second.
    expect(payload.sets[0]).toMatchObject({
      exercise_id: '22222222-2222-2222-2222-222222222222',
      set_index: 1,
      reps: 8,
      weight_kg: 70,
      rpe: 7,
      is_warmup: false,
    });
    expect(payload.sets[1]).toMatchObject({
      exercise_id: '22222222-2222-2222-2222-222222222222',
      set_index: 2,
      reps: 8,
      weight_kg: 70,
      rpe: 8,
    });
    expect(payload.sets[2]).toMatchObject({
      exercise_id: '33333333-3333-3333-3333-333333333333',
      set_index: 1, // re-indexed from 1 within the squat block
      reps: 5,
      weight_kg: 100,
      rpe: 7.5,
    });

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('saved-id'));
  });

  it('does not submit when no exercise has been picked (zod rejects empty exercise_id)', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderEditor();

    // The default block has exercise_id = '', which fails the
    // `z.string().uuid()` constraint. zodResolver blocks submit and the
    // mutation prop is never invoked.
    await user.click(screen.getByRole('button', { name: i18n.t('entrenamiento:editor.save') }));

    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
  });
});
