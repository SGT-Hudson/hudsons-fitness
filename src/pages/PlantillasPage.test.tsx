import i18n from '@/i18n';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

const useTemplates = vi.fn();
const deleteMutate = vi.fn();
vi.mock('@/features/templates/hooks', () => ({
  useTemplates: () => useTemplates(),
  useDeleteTemplate: () => ({ mutate: deleteMutate }),
}));

import { PlantillasPage } from './PlantillasPage';
import type { TemplateListItem } from '@/features/templates/api';

const cut: TemplateListItem = {
  id: 't-cut',
  name: 'Semana de corte',
  is_auto_generated: false,
  default_meal_times: ['08:00', '14:00'],
  updated_at: '2026-05-20T10:00:00Z',
  slot_count: 2,
  phase_type: 'cut',
  slots: [
    { day_of_week: 0, meal_index: 0 },
    { day_of_week: 6, meal_index: 1 },
  ],
};

const bulk: TemplateListItem = {
  ...cut,
  id: 't-bulk',
  name: 'Semana de volumen',
  phase_type: 'bulk',
  slot_count: 1,
  slots: [{ day_of_week: 1, meal_index: 0 }],
};

const untagged: TemplateListItem = {
  ...cut,
  id: 't-none',
  name: 'Semana sin fase',
  phase_type: null,
  slot_count: 0,
  slots: [],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <PlantillasPage />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  useTemplates.mockReset();
  deleteMutate.mockReset();
  await i18n.changeLanguage('es');
});

describe('PlantillasPage', () => {
  it('shows the loading skeletons while the list is loading', () => {
    useTemplates.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = renderPage();
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByText('Semana de corte')).toBeNull();
  });

  it('shows the empty state when there are no templates', () => {
    useTemplates.mockReturnValue({ data: [], isLoading: false });
    renderPage();
    expect(
      screen.getByText(/Aún no tienes plantillas\. Crea la primera/i),
    ).toBeInTheDocument();
  });

  it('renders one card per template, with its dot grid', () => {
    useTemplates.mockReturnValue({ data: [cut, bulk, untagged], isLoading: false });
    const { container } = renderPage();
    expect(screen.getByText('Semana de corte')).toBeInTheDocument();
    expect(screen.getByText('Semana de volumen')).toBeInTheDocument();
    expect(screen.getByText('Semana sin fase')).toBeInTheDocument();
    // The cut template's two slots light up exactly two of its dots.
    const cutCard = screen.getByText('Semana de corte').closest('[data-template-card]')!;
    expect(cutCard.querySelectorAll('[data-dot]').length).toBe(14);
    expect(cutCard.querySelectorAll('[data-dot="on"]').length).toBe(2);
    expect(container.querySelector('[data-template-card="t-none"] [data-dot="on"]')).toBeNull();
  });

  it('filters by phase: picking "Corte" leaves only the cut template', async () => {
    const user = userEvent.setup();
    useTemplates.mockReturnValue({ data: [cut, bulk, untagged], isLoading: false });
    renderPage();

    await user.click(screen.getByRole('radio', { name: 'Corte' }));

    expect(screen.getByText('Semana de corte')).toBeInTheDocument();
    expect(screen.queryByText('Semana de volumen')).toBeNull();
    expect(screen.queryByText('Semana sin fase')).toBeNull();
  });

  it('picking "Volumen" leaves only the bulk template, and "Todas" brings them all back', async () => {
    const user = userEvent.setup();
    useTemplates.mockReturnValue({ data: [cut, bulk, untagged], isLoading: false });
    renderPage();

    await user.click(screen.getByRole('radio', { name: 'Volumen' }));
    expect(screen.getByText('Semana de volumen')).toBeInTheDocument();
    expect(screen.queryByText('Semana de corte')).toBeNull();

    await user.click(screen.getByRole('radio', { name: 'Todas' }));
    expect(screen.getByText('Semana de corte')).toBeInTheDocument();
    expect(screen.getByText('Semana de volumen')).toBeInTheDocument();
    expect(screen.getByText('Semana sin fase')).toBeInTheDocument();
  });

  it('deletes only after the confirmation is accepted', async () => {
    const user = userEvent.setup();
    useTemplates.mockReturnValue({ data: [cut], isLoading: false });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(deleteMutate).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(deleteMutate).toHaveBeenCalledWith('t-cut');
    confirm.mockRestore();
  });

  it('offers the new-template affordance', () => {
    useTemplates.mockReturnValue({ data: [cut], isLoading: false });
    renderPage();
    const links = screen
      .getAllByRole('link', { name: /nueva plantilla/i })
      .map((el) => el.getAttribute('href'));
    expect(links).toContain('/templates/new');
  });
});
