// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { AppSidebar } from './AppSidebar';

vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ signOut: vi.fn(), user: { email: 'qa@x.dev' } }),
}));

beforeEach(async () => {
  await i18n.changeLanguage('es');
});

describe('AppSidebar', () => {
  it('renders Home + Progreso and both section groups with their items', () => {
    render(
      <MemoryRouter initialEntries={['/home']}>
        <AppSidebar />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Inicio' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Progreso' })).toBeInTheDocument();
    expect(screen.getByText('Nutrición')).toBeInTheDocument();
    expect(screen.getByText('Entreno')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Diario' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hoy' })).toBeInTheDocument();
  });
});
