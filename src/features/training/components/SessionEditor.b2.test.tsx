// @vitest-environment jsdom
import '@/i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

const EXES = [
  { id: 'aaaaaaaa-0000-0000-0000-000000000001', name_es: 'Press de banca', name_en: 'Bench', primary_muscles: ['pec_lower'], secondary_muscles: [], equipment: 'barbell', default_increment_kg: 2.5, is_verified: true, source: 'system', created_by_user_id: null, created_at: '', updated_at: '' },
  { id: 'bbbbbbbb-0000-0000-0000-000000000002', name_es: 'Sentadilla', name_en: 'Squat', primary_muscles: ['quads'], secondary_muscles: [], equipment: 'barbell', default_increment_kg: 5, is_verified: true, source: 'system', created_by_user_id: null, created_at: '', updated_at: '' },
];
vi.mock('../exercises/hooks', () => ({
  useExerciseSearch: (q: string) => ({ data: EXES.filter((e) => e.name_es.toLowerCase().includes(q.toLowerCase())), isLoading: false }),
  useCreateExercise: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('../hooks', () => ({ useExerciseHistory: () => ({ data: [], isLoading: false }) }));

import { SessionEditor } from './SessionEditor';

beforeEach(async () => { await i18n.changeLanguage('es'); });

describe('B-2: add multiple exercises on a fresh session', () => {
  it('captures two picked exercises in the submitted payload', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue('id');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <SessionEditor initial={null} onSubmit={onSubmit} onSaved={vi.fn()} />
      </QueryClientProvider>,
    );

    await user.type(screen.getByPlaceholderText(i18n.t('entrenamiento:picker.placeholder')), 'Press');
    await user.click(await screen.findByText('Press de banca'));

    await user.click(screen.getByRole('button', { name: i18n.t('entrenamiento:editor.addExercise') }));
    const pickers = screen.getAllByPlaceholderText(i18n.t('entrenamiento:picker.placeholder'));
    await user.type(pickers[pickers.length - 1], 'Sentadilla');
    await user.click(await screen.findByText('Sentadilla'));

    const repsInputs = screen.getAllByLabelText(i18n.t('entrenamiento:setRow.reps'));
    const weightInputs = screen.getAllByLabelText(i18n.t('entrenamiento:setRow.weightKg'));
    await user.type(repsInputs[0], '8'); await user.type(weightInputs[0], '70');
    await user.type(repsInputs[1], '5'); await user.type(weightInputs[1], '100');

    await user.click(screen.getByRole('button', { name: i18n.t('entrenamiento:editor.save') }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const ids = onSubmit.mock.calls[0][0].sets.map((s: { exercise_id: string }) => s.exercise_id);
    expect(new Set(ids)).toEqual(new Set([EXES[0].id, EXES[1].id]));
  });
});
