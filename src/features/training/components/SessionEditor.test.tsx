// @vitest-environment jsdom
//
// Tier-2 component test for the SessionEditor — verifies that the
// RHF + zod wiring produces the exact `save_workout` payload shape
// (flat sets[] with per-block re-indexed set_index from 1) when the
// user picks an exercise, fills a set row, and submits. The save
// mutation is injected as a prop (mirrors PhaseDialog.onSave), so the
// test asserts against a vi.fn() spy rather than mocking TanStack.
//
// ExercisePicker is mocked because the real one debounces Supabase
// queries; we replace it with a one-button stub that synchronously
// calls onSelect with a fixed mock Exercise.
import '@/i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';

// `./SessionEditor` transitively imports `@/lib/supabase` (via
// ./ExerciseBlock → ../exercises/api). Stub it before the component
// import so module-load doesn't throw under the test env.
vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

import type { Exercise } from '../exercises/api';
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

// Mock the picker: synchronous, single button — clicking fires onSelect.
vi.mock('./ExercisePicker', () => ({
  ExercisePicker: ({
    selected,
    onSelect,
  }: {
    selected: Exercise | null;
    onSelect: (ex: Exercise) => void;
    onClear: () => void;
  }) => {
    if (selected) return <div data-testid="picker-selected">{selected.name_es}</div>;
    return (
      <button type="button" data-testid="pick-mock" onClick={() => onSelect(mockExercise)}>
        Pick mock
      </button>
    );
  },
}));

// Mock useExerciseHistory: synchronous, returns empty (no prior history → no
// placeholder, no progression suggestion). useAuth isn't called by the
// editor directly but the hook depends on it; the hook is mocked entirely.
vi.mock('../hooks', () => ({
  useExerciseHistory: () => ({ data: [], isLoading: false }),
}));

function renderEditor(props: Partial<Parameters<typeof SessionEditor>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue('new-session-id');
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
  it('renders with one empty block prompting the user to pick an exercise', () => {
    renderEditor();
    expect(screen.getByTestId('pick-mock')).toBeTruthy();
  });

  it('picking an exercise + filling a set + submitting produces the expected save_workout payload', async () => {
    const user = userEvent.setup();
    const { onSubmit, onSaved } = renderEditor();

    await user.click(screen.getByTestId('pick-mock'));
    // Picker now in "selected" state — set inputs are visible.
    expect(await screen.findByTestId('picker-selected')).toBeTruthy();

    const repsInput = document.querySelector<HTMLInputElement>(
      'input[name="blocks.0.sets.0.reps"]',
    );
    const weightInput = document.querySelector<HTMLInputElement>(
      'input[name="blocks.0.sets.0.weight_kg"]',
    );
    const rpeInput = document.querySelector<HTMLInputElement>(
      'input[name="blocks.0.sets.0.rpe"]',
    );
    expect(repsInput).toBeTruthy();
    expect(weightInput).toBeTruthy();
    expect(rpeInput).toBeTruthy();

    await user.clear(repsInput!);
    await user.type(repsInput!, '8');
    await user.clear(weightInput!);
    await user.type(weightInput!, '70');
    await user.clear(rpeInput!);
    await user.type(rpeInput!, '7');

    await user.click(screen.getByRole('button', { name: i18n.t('entrenamiento:editor.save') }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    const payload = onSubmit.mock.calls[0][0];
    expect(payload.sessionId).toBeNull();
    expect(payload.performedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(payload.sets).toHaveLength(1);
    expect(payload.sets[0]).toMatchObject({
      exercise_id: mockExercise.id,
      set_index: 1,
      reps: 8,
      weight_kg: 70,
      rpe: 7,
      is_warmup: false,
    });

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('does not submit when no exercise has been picked (zod rejects empty exercise_id)', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderEditor();

    // The default block has exercise_id = '', which fails the
    // `z.string().uuid()` constraint. zodResolver blocks submit and the
    // mutation prop is never invoked.
    await user.click(screen.getByRole('button', { name: i18n.t('entrenamiento:editor.save') }));

    // Give the form a tick to settle — should still be 0 calls.
    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
  });
});
