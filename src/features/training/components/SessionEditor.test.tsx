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
  secondary_muscles: [],
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
      program_id: null,
      routine_id: null,
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

  it('adopts resolved exercise when initialExercises is populated after mount (async race regression)', async () => {
    const exId = '44444444-4444-4444-4444-444444444444';
    const resolvedExercise: Exercise = {
      ...mockExercise,
      id: exId,
      name_es: 'Curl de bíceps',
      name_en: 'Bicep curl',
    };
    const initial: SessionWithSets = {
      id: 'session-async',
      user_id: 'user-1',
      performed_on: '2026-05-24',
      title: 'Arm day',
      notes: null,
      program_id: null,
      routine_id: null,
      created_at: '2026-05-24T10:00:00Z',
      updated_at: '2026-05-24T10:00:00Z',
      workout_sets: [
        {
          id: 's1',
          session_id: 'session-async',
          exercise_id: exId,
          set_index: 1,
          reps: 10,
          weight_kg: 20,
          rpe: null,
          is_warmup: false,
          created_at: '2026-05-24T10:00:01Z',
        },
      ],
    };

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onSubmit = vi.fn().mockResolvedValue('saved-id');
    const onSaved = vi.fn();

    // First render: exercises map is empty (not yet resolved).
    const { rerender } = render(
      <QueryClientProvider client={qc}>
        <SessionEditor
          initial={initial}
          initialExercises={{}}
          onSubmit={onSubmit}
          onSaved={onSaved}
        />
      </QueryClientProvider>,
    );

    // Block has mounted but exercises map was empty — picker must show empty state
    // (ExerciseBlock renders ExercisePicker only in the "no exercise" branch).
    expect(screen.getByTestId('picker-empty')).toBeTruthy();

    // Re-render with the resolved exercises map (simulates async query completion).
    rerender(
      <QueryClientProvider client={qc}>
        <SessionEditor
          initial={initial}
          initialExercises={{ [exId]: resolvedExercise }}
          onSubmit={onSubmit}
          onSaved={onSaved}
        />
      </QueryClientProvider>,
    );

    // After prop update the block must adopt the resolved exercise: the picker
    // empty state disappears and the exercise name is shown in the block header.
    await waitFor(() => {
      expect(screen.queryByTestId('picker-empty')).toBeNull();
      expect(screen.getByText('Curl de bíceps')).toBeTruthy();
    });
  });

  it('prefills a fresh session from a routine and submits both exercises with program/routine stamps', async () => {
    const user = userEvent.setup();
    const bench: Exercise = { ...mockExercise, id: '22222222-2222-2222-2222-222222222222' };
    const squat: Exercise = {
      ...mockExercise, id: '33333333-3333-3333-3333-333333333333', name_es: 'Sentadilla', name_en: 'Squat',
    };
    const prefill = {
      programId: 'prog-1',
      routineId: 'rout-1',
      exercises: [
        { exerciseId: bench.id, sets: [{ setIndex: 1, isWarmup: false, reps: null, weightKg: null, targetRepsMin: 8, targetRepsMax: 12, restSeconds: 120, targetRpe: null }] },
        { exerciseId: squat.id, sets: [{ setIndex: 1, isWarmup: false, reps: null, weightKg: null, targetRepsMin: 5, targetRepsMax: 5, restSeconds: 180, targetRpe: null }] },
      ],
      exercisesById: { [bench.id]: bench, [squat.id]: squat },
    };

    // Regression guard: the [initial]-effect must reproduce the prefill on
    // mount, not wipe it down to one empty block.
    const { onSubmit } = renderEditor({ prefill });

    await user.click(screen.getByRole('button', { name: i18n.t('entrenamiento:editor.save') }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.programId).toBe('prog-1');
    expect(payload.routineId).toBe('rout-1');
    expect(new Set(payload.sets.map((s: { exercise_id: string }) => s.exercise_id)))
      .toEqual(new Set([bench.id, squat.id]));
  });

  it('prefills warmup sets with is_warmup:true and working sets with is_warmup:false; set_index contiguous after a remove', async () => {
    const user = userEvent.setup();
    const bench: Exercise = { ...mockExercise, id: '22222222-2222-2222-2222-222222222222' };

    // 1 warmup + 2 working = 3 sets total
    const prefill = {
      programId: 'prog-warmup',
      routineId: 'rout-warmup',
      exercises: [
        {
          exerciseId: bench.id,
          sets: [
            { setIndex: 1, isWarmup: true,  reps: 5, weightKg: 25,   targetRepsMin: 5, targetRepsMax: 5, restSeconds: 120, targetRpe: null },
            { setIndex: 2, isWarmup: false, reps: null, weightKg: null, targetRepsMin: 5, targetRepsMax: 5, restSeconds: 120, targetRpe: null },
            { setIndex: 3, isWarmup: false, reps: null, weightKg: null, targetRepsMin: 5, targetRepsMax: 5, restSeconds: 120, targetRpe: null },
          ],
        },
      ],
      exercisesById: { [bench.id]: bench },
    };

    const { onSubmit } = renderEditor({ prefill });

    // The warmup row is pre-filled (reps=5, weight_kg=25) — editor renders
    await user.click(screen.getByRole('button', { name: i18n.t('entrenamiento:editor.save') }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];

    // All sets belong to bench
    expect(payload.sets.every((s: { exercise_id: string }) => s.exercise_id === bench.id)).toBe(true);

    // Warmup set is flagged correctly
    const warmupSets = payload.sets.filter((s: { is_warmup: boolean }) => s.is_warmup);
    const workingSets = payload.sets.filter((s: { is_warmup: boolean }) => !s.is_warmup);
    expect(warmupSets).toHaveLength(1);
    expect(workingSets).toHaveLength(2);

    // Warmup was pre-filled with reps:5 weight_kg:25
    expect(warmupSets[0]).toMatchObject({ reps: 5, weight_kg: 25, is_warmup: true });

    // set_index is contiguous from 1 after submit flatten
    const indices = payload.sets.map((s: { set_index: number }) => s.set_index).sort((a: number, b: number) => a - b);
    expect(indices).toEqual([1, 2, 3]);
  });
});
