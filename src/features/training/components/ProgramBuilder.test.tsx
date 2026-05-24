// @vitest-environment jsdom
import '@/i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '@/i18n';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

import { ProgramBuilder } from './ProgramBuilder';

const routines = [
  { id: '11111111-1111-1111-1111-111111111111', user_id: 'u', name: 'Push', notes: null, created_at: '', updated_at: '', routine_exercises: [] },
  { id: '22222222-2222-2222-2222-222222222222', user_id: 'u', name: 'Pull', notes: null, created_at: '', updated_at: '', routine_exercises: [] },
];

beforeEach(async () => { await i18n.changeLanguage('es'); });

describe('ProgramBuilder (Tier-2)', () => {
  it('submits a save_program payload with day_index-ordered slots', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue('program-1');
    render(<ProgramBuilder initial={null} routines={routines} onSubmit={onSubmit} onSaved={vi.fn()} />);

    await user.type(screen.getByLabelText(i18n.t('entrenamiento:program.name')), 'PPL');
    // default first slot is a routine slot; pick the first routine
    await user.selectOptions(screen.getAllByRole('combobox')[0], '11111111-1111-1111-1111-111111111111');
    await user.click(screen.getByRole('button', { name: i18n.t('entrenamiento:program.save') }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.name).toBe('PPL');
    expect(payload.days[0]).toMatchObject({ day_index: 0, is_rest: false, routine_id: '11111111-1111-1111-1111-111111111111' });
  });
});
