import i18n from '@/i18n';
import { describe, it, expect, afterAll, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Freeze "today" so the editor's presentational reference week is deterministic:
// Tue 2026-05-26 → Mon 2026-05-25 … Sun 2026-05-31 (day_of_week 0…6).
vi.useFakeTimers({ shouldAdvanceTime: true });
vi.setSystemTime(new Date('2026-05-26T09:00:00'));

afterAll(() => {
  vi.useRealTimers();
});

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

const useTemplate = vi.fn();
const saveMutateAsync = vi.fn();
vi.mock('@/features/templates/hooks', () => ({
  useTemplate: (id: string | null) => useTemplate(id),
  useSaveTemplate: () => ({ mutateAsync: saveMutateAsync, isPending: false }),
  useRecipeMacros: () => ({ data: undefined }),
}));

// The user's ACTIVE phase ('bulk') and the template's own phase are different
// concepts: the active one scores the day headers and the drawer's balance, and
// must never leak into what the template is tagged with.
vi.mock('@/features/planning/useDailyTarget', () => ({
  useDailyTarget: () => ({
    targets: { kcal: 2600, proteinG: 170, carbsG: 300, fatG: 80, fiberG: 30 },
    phaseType: 'bulk',
    proteinBasis: 'lean',
    weightKg: 80,
  }),
}));

// The add drawer reads the recipe library (name + per-serving macros).
vi.mock('@/features/recipes/hooks', () => ({
  useRecipes: () => ({
    data: [
      {
        id: 'r9',
        name: 'Pollo al horno',
        servings: 2,
        description: null,
        updated_at: '',
        ingredient_count: 3,
        meal_types: ['lunch'],
        labels: {},
        perServing: { kcal: 420, proteinG: 45, carbsG: 12, fatG: 20, fiberG: 2 },
      },
    ],
    isLoading: false,
  }),
}));

import { PlantillaEditorPage } from './PlantillaEditorPage';
import type { TemplateDetail } from '@/features/templates/api';

const cutTemplate: TemplateDetail = {
  id: 't1',
  name: 'Semana de corte',
  same_schedule_all_days: true,
  default_meal_times: ['08:00:00', '14:00:00'],
  is_auto_generated: false,
  phase_type: 'cut',
  slots: [
    {
      id: 's1',
      day_of_week: 0,
      meal_index: 0,
      recipe_id: 'r1',
      recipe_name: 'Avena',
      servings: 1,
      display_order: 0,
    },
  ],
};

function renderEditor(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/templates/:id" element={<PlantillaEditorPage />} />
        <Route path="/templates" element={<div>lista</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const mobileStack = (c: HTMLElement) => c.querySelector('[data-mobile-stack="day"]') as HTMLElement;
const webGrid = (c: HTMLElement) => c.querySelector('[data-web-grid]') as HTMLElement;
const phaseRadio = (name: RegExp | string) => screen.getByRole('radio', { name });
const savedSlots = () => saveMutateAsync.mock.calls[0][0].slots as Array<{
  day_of_week: number;
  meal_index: number;
  recipe_id: string;
  servings: number;
}>;

beforeEach(async () => {
  useTemplate.mockReset();
  saveMutateAsync.mockReset();
  saveMutateAsync.mockResolvedValue('t1');
  await i18n.changeLanguage('es');
});

describe('PlantillaEditorPage — phase picker', () => {
  it('starts on the template stored phase, not on the user active phase', () => {
    useTemplate.mockReturnValue({ data: cutTemplate, isLoading: false, error: null });
    renderEditor('/templates/t1');

    expect(phaseRadio('Corte')).toHaveAttribute('aria-checked', 'true');
    expect(phaseRadio('Volumen')).toHaveAttribute('aria-checked', 'false');
    expect(phaseRadio('Sin fase')).toHaveAttribute('aria-checked', 'false');
  });

  it('preserves the stored phase when the picker is not touched', async () => {
    const user = userEvent.setup();
    useTemplate.mockReturnValue({ data: cutTemplate, isLoading: false, error: null });

    renderEditor('/templates/t1');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(saveMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 't1', phaseType: 'cut' }),
    );
  });

  it('saves the phase the picker holds, not the stored one', async () => {
    const user = userEvent.setup();
    useTemplate.mockReturnValue({ data: cutTemplate, isLoading: false, error: null });

    renderEditor('/templates/t1');
    await user.click(phaseRadio('Mantenimiento'));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(saveMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 't1', phaseType: 'maintenance' }),
    );
  });

  // `save_template` writes `p_phase_type` unconditionally — null is a write of
  // null, so "Sin fase" must actually clear a tagged template.
  it('clears the phase back to null', async () => {
    const user = userEvent.setup();
    useTemplate.mockReturnValue({ data: cutTemplate, isLoading: false, error: null });

    renderEditor('/templates/t1');
    await user.click(phaseRadio('Sin fase'));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(saveMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 't1', phaseType: null }),
    );
  });

  it('keeps an untagged template untagged on save', async () => {
    const user = userEvent.setup();
    useTemplate.mockReturnValue({
      data: { ...cutTemplate, phase_type: null },
      isLoading: false,
      error: null,
    });

    renderEditor('/templates/t1');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(saveMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ phaseType: null }));
  });

  it('creates a new template untagged, never on the user active phase', async () => {
    const user = userEvent.setup();
    useTemplate.mockReturnValue({ data: undefined, isLoading: false, error: null });

    renderEditor('/templates/new');

    expect(phaseRadio('Sin fase')).toHaveAttribute('aria-checked', 'true');
    expect(phaseRadio('Volumen')).toHaveAttribute('aria-checked', 'false');

    await user.type(screen.getByLabelText(/nombre/i), 'Nueva');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(saveMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: null, phaseType: null }),
    );
  });
});

describe('PlantillaEditorPage — layout', () => {
  it('mounts the mobile day stack and the web grid together (CSS picks one)', () => {
    useTemplate.mockReturnValue({ data: cutTemplate, isLoading: false, error: null });
    const { container } = renderEditor('/templates/t1');

    // PageShell mounts both headers, so the title renders twice by design.
    expect(screen.getAllByText('Editar plantilla').length).toBeGreaterThanOrEqual(1);
    expect(within(webGrid(container)).getAllByText('Lunes').length).toBe(1);
    expect(container.querySelectorAll('[data-day-header]').length).toBe(7); // web grid
    expect(mobileStack(container).querySelectorAll('[data-day]').length).toBe(7); // week strip
  });

  it('keeps the loading state', () => {
    useTemplate.mockReturnValue({ data: undefined, isLoading: true, error: null });
    renderEditor('/templates/t1');
    expect(screen.getByText('Cargando…')).toBeInTheDocument();
  });

  it('keeps the single localized validation error', async () => {
    const user = userEvent.setup();
    useTemplate.mockReturnValue({ data: undefined, isLoading: false, error: null });

    renderEditor('/templates/new');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Pon un nombre a la plantilla.')).toBeInTheDocument();
    expect(saveMutateAsync).not.toHaveBeenCalled();
  });
});

describe('PlantillaEditorPage — mobile day list', () => {
  it('switches the list to the picked day and adds to THAT day_of_week', async () => {
    const user = userEvent.setup();
    useTemplate.mockReturnValue({ data: cutTemplate, isLoading: false, error: null });
    const { container } = renderEditor('/templates/t1');
    const stack = mobileStack(container);

    // Monday (day_of_week 0) is the default day — its slot is on screen.
    expect(within(stack).getByText('Avena')).toBeInTheDocument();

    // Thursday = day_of_week 3 of the reference week (2026-05-28).
    await user.click(stack.querySelector('[data-day="2026-05-28"]') as HTMLElement);
    expect(within(stack).queryByText('Avena')).not.toBeInTheDocument();

    await user.click(within(stack).getByRole('button', { name: /desayuno: añadir comida/i }));

    // The drawer names the weekday, not a calendar date — a template has none.
    const destination = await screen.findByTestId('destination');
    expect(destination).toHaveTextContent(/jueves/i);
    expect(destination).toHaveTextContent(/desayuno/i);
    expect(destination).toHaveTextContent(/08:00/);

    await user.click(screen.getByRole('button', { name: /pollo al horno/i }));
    await user.click(screen.getByRole('button', { name: /añadir a la comida/i }));

    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(saveMutateAsync).toHaveBeenCalledTimes(1));

    const slots = savedSlots();
    expect(slots).toContainEqual(
      expect.objectContaining({ day_of_week: 3, meal_index: 0, recipe_id: 'r9', servings: 1 }),
    );
    // …and NOT to Monday, where the list started.
    expect(slots.filter((s) => s.recipe_id === 'r9' && s.day_of_week === 0)).toHaveLength(0);
    expect(slots).toHaveLength(2);
  });

  it('updates an existing slot instead of adding a second one', async () => {
    const user = userEvent.setup();
    useTemplate.mockReturnValue({ data: cutTemplate, isLoading: false, error: null });
    const { container } = renderEditor('/templates/t1');

    await user.click(within(mobileStack(container)).getByRole('button', { name: /avena/i }));

    const drawer = within(await screen.findByRole('dialog'));
    await user.click(drawer.getByRole('button', { name: /más raciones/i }));
    await user.click(drawer.getByRole('button', { name: 'Guardar' }));

    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(saveMutateAsync).toHaveBeenCalledTimes(1));

    const slots = savedSlots();
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({
      day_of_week: 0,
      meal_index: 0,
      recipe_id: 'r1',
      servings: 1.5,
    });
  });

  it('keeps the copy-meal flow, sourced from the selected day', async () => {
    const user = userEvent.setup();
    useTemplate.mockReturnValue({ data: cutTemplate, isLoading: false, error: null });
    const { container } = renderEditor('/templates/t1');

    await user.click(
      within(mobileStack(container)).getByRole('button', { name: /copiar comida a otros días/i }),
    );

    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByText(/08:00 · Lunes/)).toBeInTheDocument();
    expect(dialog.getByText('Jueves')).toBeInTheDocument();
  });
});
