// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { MorePage } from './MorePage';

vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ signOut: vi.fn(), user: { email: 'qa@x.dev' } }),
}));

const { mockPhase } = vi.hoisted(() => ({
  mockPhase: { current: null as null | { phase_type: string; name: string } },
}));
vi.mock('@/features/phases/hooks', () => ({
  useActivePhase: () => ({ data: mockPhase.current }),
}));

beforeEach(async () => {
  mockPhase.current = null;
  await i18n.changeLanguage('es');
});

function renderMorePage() {
  return render(
    <MemoryRouter initialEntries={['/more']}>
      <MorePage />
    </MemoryRouter>,
  );
}

describe('MorePage', () => {
  it('renders the profile card linking to /settings/profile', () => {
    renderMorePage();
    const link = screen.getByRole('link', { name: /qa@x\.dev/ });
    expect(link).toHaveAttribute('href', '/settings/profile');
  });

  it('renders hub rows: Ingredientes, Plantillas, Objetivos, Calculadora de TDEE, Ajustes', () => {
    renderMorePage();
    expect(screen.getByRole('link', { name: 'Ingredientes' })).toHaveAttribute(
      'href',
      '/recipes/ingredients',
    );
    expect(screen.getByRole('link', { name: 'Plantillas' })).toHaveAttribute('href', '/templates');
    expect(screen.getByRole('link', { name: 'Objetivos' })).toHaveAttribute(
      'href',
      '/progress/goals',
    );
    expect(screen.getByRole('link', { name: 'Calculadora de TDEE' })).toHaveAttribute(
      'href',
      '/tdee',
    );
    expect(screen.getByRole('link', { name: 'Ajustes' })).toHaveAttribute('href', '/settings');
  });

  it('shows the active phase label under the email when a phase is active', () => {
    mockPhase.current = { phase_type: 'cut', name: 'Corte verano' };
    renderMorePage();
    expect(screen.getByText('Corte')).toBeInTheDocument();
  });

  it('renders the page title twice (mobile topbar + desktop header)', () => {
    renderMorePage();
    expect(screen.getAllByRole('heading', { name: 'Más' })).toHaveLength(2);
  });
});
