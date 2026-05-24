// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';

const updateMutate = vi.fn();
vi.mock('@/features/profile/hooks', () => ({
  useProfile: () => ({ data: { display_name: 'Gonzalo', language: 'es' }, isLoading: false }),
  useUpdateProfile: () => ({ mutate: updateMutate, isPending: false }),
}));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { email: 'gonzalo@x.dev' } }),
}));
const setTheme = vi.fn();
vi.mock('@/features/theme/ThemeProvider', () => ({
  useTheme: () => ({ theme: 'system', setTheme }),
}));

import { SettingsPage } from './SettingsPage';

beforeEach(async () => { await i18n.changeLanguage('es'); updateMutate.mockClear(); });

describe('SettingsPage index', () => {
  it('renders the hero, group headers and drill-in rows', () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    expect(screen.getByText('Gonzalo')).toBeInTheDocument();
    expect(screen.getByText('gonzalo@x.dev')).toBeInTheDocument();
    expect(screen.getByText('Preferencias')).toBeInTheDocument();
    expect(screen.getByText('Tú')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Biometría/ })).toHaveAttribute('href', '/settings/biometrics');
    expect(screen.getByRole('link', { name: /Cuenta y sesión/ })).toHaveAttribute('href', '/settings/account');
  });

  it('switches language inline (persists via mutation)', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'EN' }));
    expect(updateMutate).toHaveBeenCalledWith({ language: 'en' });
  });
});
