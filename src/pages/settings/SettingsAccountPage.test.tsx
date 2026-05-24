// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';

const signOut = vi.fn();
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ signOut, user: { email: 'qa@x.dev' } }),
}));
// DeleteAccountDialog imports ../api (supabase client) at module load; stub it
// so the import chain stays inert in CI (no VITE_SUPABASE_* env).
vi.mock('@/features/account/api', () => ({ deleteAccount: vi.fn() }));

import { SettingsAccountPage } from './SettingsAccountPage';

beforeEach(async () => { await i18n.changeLanguage('es'); signOut.mockClear(); });

describe('SettingsAccountPage', () => {
  it('shows the email and signs out', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><SettingsAccountPage /></MemoryRouter>);
    expect(screen.getByDisplayValue('qa@x.dev')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(signOut).toHaveBeenCalled();
  });

  it('opens the delete-account dialog', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><SettingsAccountPage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Eliminar cuenta' }));
    expect(await screen.findByRole('heading', { name: 'Eliminar cuenta' })).toBeInTheDocument();
  });
});
