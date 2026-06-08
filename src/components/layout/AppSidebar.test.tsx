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
  it('renders Progreso and both section groups with their items', () => {
    render(
      <MemoryRouter initialEntries={['/diary']}>
        <AppSidebar />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Progreso' })).toBeInTheDocument();
    expect(screen.getByText('Nutrición')).toBeInTheDocument();
    expect(screen.getByText('Entreno')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Diario' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hoy' })).toBeInTheDocument();
  });

  it('pins the sidebar to the viewport (sticky, full dvh) so its footer stays visible on long pages', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/diary']}>
        <AppSidebar />
      </MemoryRouter>,
    );
    const aside = container.querySelector('aside');
    expect(aside?.className).toContain('sticky');
    expect(aside?.className).toContain('top-0');
    expect(aside?.className).toContain('h-dvh');
  });
});
