// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { AppSidebar } from './AppSidebar';

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
  localStorage.clear();
  mockPhase.current = null;
  await i18n.changeLanguage('es');
});

function renderSidebar(initialEntry = '/diary') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AppSidebar />
    </MemoryRouter>,
  );
}

describe('AppSidebar', () => {
  it('renders the three canvas groups and their items', () => {
    renderSidebar();
    expect(screen.getByText('Nutrición')).toBeInTheDocument();
    expect(screen.getByText('Entrenamiento')).toBeInTheDocument();
    expect(screen.getByText('Análisis')).toBeInTheDocument();
    for (const label of ['Diario', 'Recetas', 'Ingredientes', 'Planificador']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
    for (const label of ['Hoy', 'Rutinas', 'Ejercicios']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
    for (const label of ['Progreso', 'Objetivos']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('collapse toggle persists to localStorage and hides labels', async () => {
    const user = userEvent.setup();
    renderSidebar();
    const toggle = screen.getByRole('button', { name: 'Contraer menú' });
    await user.click(toggle);
    expect(localStorage.getItem('hf-sidebar-collapsed')).toBe('1');
    expect(screen.queryByText('Diario')).not.toBeInTheDocument();
    expect(screen.queryByText('Nutrición')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expandir menú' })).toBeInTheDocument();
    // Verify nav items are still accessible by name in collapsed mode
    expect(screen.getByRole('link', { name: 'Diario' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Recetas' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hoy' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Progreso' })).toBeInTheDocument();
  });

  it('starts collapsed when hf-sidebar-collapsed=1', () => {
    localStorage.setItem('hf-sidebar-collapsed', '1');
    renderSidebar();
    expect(screen.getByRole('button', { name: 'Expandir menú' })).toBeInTheDocument();
    expect(screen.queryByText('Diario')).not.toBeInTheDocument();
  });

  it('footer links to /settings', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Ajustes' })).toHaveAttribute('href', '/settings');
  });

  it('shows the active phase label in the footer when one is active', () => {
    mockPhase.current = { phase_type: 'cut', name: 'Corte verano' };
    renderSidebar();
    expect(screen.getByText('Corte')).toBeInTheDocument();
  });

  it('pins the sidebar to the viewport (sticky, full dvh) so its footer stays visible on long pages', () => {
    const { container } = renderSidebar();
    const aside = container.querySelector('aside');
    expect(aside?.className).toContain('sticky');
    expect(aside?.className).toContain('top-0');
    expect(aside?.className).toContain('h-dvh');
  });

  it('collapsed active item keeps its accent styling instead of a stringified className function', () => {
    localStorage.setItem('hf-sidebar-collapsed', '1');
    renderSidebar('/diary');
    const active = screen.getByRole('link', { name: 'Diario' });
    const inactive = screen.getByRole('link', { name: 'Recetas' });
    expect(active.className).not.toContain('=>');
    expect(inactive.className).not.toContain('=>');
    expect(active.className).toContain('bg-nutri-soft');
    expect(inactive.className).not.toContain('bg-nutri-soft');
  });

  it('respects end semantics: /recipes/ingredients activates Ingredientes, not Recetas', () => {
    renderSidebar('/recipes/ingredients');
    const recetas = screen.getByRole('link', { name: 'Recetas' });
    const ingredientes = screen.getByRole('link', { name: 'Ingredientes' });
    expect(recetas.className).not.toContain('bg-nutri-soft');
    expect(ingredientes.className).toContain('bg-nutri-soft');
  });
});
