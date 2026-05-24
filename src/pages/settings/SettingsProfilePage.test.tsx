// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';

const mockMutateAsync = vi.fn().mockResolvedValue({});
// Stable `data` reference (created once) — an inline object literal would be a
// fresh reference each render, re-firing the form.reset effect → infinite loop.
vi.mock('@/features/profile/hooks', () => {
  const data = { display_name: 'Gonzalo' };
  return {
    useProfile: () => ({ data, isLoading: false }),
    useUpdateProfile: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  };
});

import { SettingsProfilePage } from './SettingsProfilePage';

beforeEach(async () => { await i18n.changeLanguage('es'); mockMutateAsync.mockClear(); });

// fireEvent (deterministic) + waitFor (submit → mutateAsync is async); userEvent
// stalls under full-suite parallel load.
describe('SettingsProfilePage', () => {
  it('saves the trimmed display name', async () => {
    render(<MemoryRouter><SettingsProfilePage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: '  Gon  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledWith({ display_name: 'Gon' }));
  });

  it('sends null when the name is blank', async () => {
    render(<MemoryRouter><SettingsProfilePage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledWith({ display_name: null }));
  });
});
