// @vitest-environment jsdom
import '@/i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '@/i18n';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

// Stub the picker: clicking it selects a fixed exercise (avoids debounced query).
const EX = {
  id: '11111111-1111-1111-1111-111111111111', name_es: 'Press de banca', name_en: 'Bench press',
  primary_muscles: ['pec_lower'], secondary_muscles: [], equipment: 'barbell', default_increment_kg: 2.5,
  is_verified: true, source: 'system', created_by_user_id: null,
  created_at: '', updated_at: '',
};
vi.mock('./ExercisePicker', () => ({
  ExercisePicker: ({ onSelect }: { onSelect: (e: typeof EX) => void }) => (
    <button type="button" onClick={() => onSelect(EX)}>pick-mock</button>
  ),
}));

import { RoutineBuilder } from './RoutineBuilder';

beforeEach(async () => { await i18n.changeLanguage('es'); });

describe('RoutineBuilder (Tier-2)', () => {
  it('submits a save_routine payload with position-indexed exercises', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue('routine-1');
    render(<RoutineBuilder initial={null} onSubmit={onSubmit} onSaved={vi.fn()} />);

    await user.type(screen.getByLabelText(i18n.t('entrenamiento:routine.name')), 'Push A');
    await user.click(screen.getByText('pick-mock')); // selects EX into row 0
    await user.click(screen.getByRole('button', { name: i18n.t('entrenamiento:routine.save') }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.name).toBe('Push A');
    expect(payload.exercises[0]).toMatchObject({ exercise_id: EX.id, position: 1 });
  });

  it('preserves picked exercise name after a new row is added (stable keys regression)', async () => {
    const user = userEvent.setup();
    render(<RoutineBuilder initial={null} onSubmit={vi.fn()} onSaved={vi.fn()} />);

    // Pick an exercise into row 0.
    await user.click(screen.getByText('pick-mock'));
    // The name should be visible immediately after picking.
    expect(screen.getByText('Press de banca')).toBeTruthy();

    // Add a second exercise row — this triggers append on the field array.
    await user.click(screen.getByRole('button', { name: i18n.t('entrenamiento:routine.addExercise') }));

    // The first row must STILL show the exercise name (not wiped by the append).
    expect(screen.getByText('Press de banca')).toBeTruthy();
  });

  it('adds a warmup set and submits it in the payload', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue('routine-2');
    render(<RoutineBuilder initial={null} onSubmit={onSubmit} onSaved={vi.fn()} />);

    await user.type(screen.getByLabelText(i18n.t('entrenamiento:routine.name')), 'Pull A');
    await user.click(screen.getByText('pick-mock'));

    // Add one warmup set.
    await user.click(screen.getByRole('button', { name: i18n.t('entrenamiento:routine.addWarmup') }));

    // Type into the pct and reps inputs (default values are 50 / 5, clear and retype).
    const pctInput = screen.getByLabelText(i18n.t('entrenamiento:routine.warmupPct'));
    await user.clear(pctInput);
    await user.type(pctInput, '60');

    const repsInput = screen.getByLabelText(i18n.t('entrenamiento:routine.warmupReps'));
    await user.clear(repsInput);
    await user.type(repsInput, '8');

    await user.click(screen.getByRole('button', { name: i18n.t('entrenamiento:routine.save') }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.exercises[0].warmup_sets).toEqual([{ pct: 60, reps: 8 }]);
  });
});
