import i18n from '@/i18n';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

const useRecipes = vi.fn();
const hideMutate = vi.fn();
vi.mock('@/features/recipes/hooks', () => ({
  useRecipes: () => useRecipes(),
  useHideRecipe: () => ({ mutate: hideMutate }),
}));

import { RecetasPage } from './RecetasPage';
import type { RecipeListItem } from '@/features/recipes/api';
import type { RecipeLabels } from '@/features/recipes/labels';

const NO_LABELS: RecipeLabels = {
  goals: {
    highProtein: false,
    lowCarb: false,
    lowFat: false,
    highFiber: false,
    lowSugar: null,
    lowSatFat: null,
  },
  warnings: { highSugar: null, highSatFat: null },
};

function recipe(over: Partial<RecipeListItem> & Pick<RecipeListItem, 'id' | 'name'>): RecipeListItem {
  return {
    servings: 2,
    description: null,
    updated_at: '2026-07-01T10:00:00Z',
    ingredient_count: 5,
    meal_types: [],
    prep_time_minutes: null,
    labels: NO_LABELS,
    perServing: { kcal: 420, proteinG: 30, carbsG: 40, fatG: 12, fiberG: 6 },
    ...over,
  };
}

const pollo = recipe({ id: 'r-1', name: 'Pollo con arroz', meal_types: ['lunch'] });
const avena = recipe({
  id: 'r-2',
  name: 'Avena con plátano',
  meal_types: ['breakfast'],
  perServing: { kcal: 318, proteinG: 11, carbsG: 58, fatG: 5, fiberG: 8 },
  labels: {
    ...NO_LABELS,
    goals: { ...NO_LABELS.goals, highFiber: true },
  },
});

function renderPage() {
  return render(
    <MemoryRouter>
      <RecetasPage />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  useRecipes.mockReset();
  hideMutate.mockReset();
  window.localStorage.clear();
  await i18n.changeLanguage('es');
});

describe('RecetasPage', () => {
  it('renders a card per fetched recipe', () => {
    useRecipes.mockReturnValue({ data: [pollo, avena], isLoading: false });
    renderPage();

    // Two layouts are mounted at once (mobile row + web card; CSS hides one),
    // as with PageShell's two headers — hence getAllBy*.
    expect(screen.getAllByText('Pollo con arroz').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Avena con plátano').length).toBeGreaterThan(0);
    // kcal/ración off `perServing`, not a re-fetch.
    expect(screen.getAllByText('318').length).toBeGreaterThan(0);
  });

  // The card/row is a stretched link to the recipe, and the kebab's edit item
  // points at the editor. Both are routes the wave-5 route split moves — pin
  // them so a bad retarget fails here instead of in the browser.
  it('links every card and row to its recipe', () => {
    useRecipes.mockReturnValue({ data: [pollo, avena], isLoading: false });
    renderPage();

    const links = screen.getAllByRole('link', { name: 'Pollo con arroz' });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toHaveAttribute('href', '/recipes/r-1');
  });

  it('the card menu edits the recipe and removes it from the library after confirming', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    useRecipes.mockReturnValue({ data: [pollo, avena], isLoading: false });
    renderPage();

    await user.click(screen.getAllByRole('button', { name: 'Acciones de la receta' })[0]);

    expect(screen.getByRole('menuitem', { name: 'Editar' })).toHaveAttribute(
      'href',
      '/recipes/r-1',
    );

    await user.click(screen.getByRole('menuitem', { name: 'Quitar de mi biblioteca' }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Pollo con arroz'));
    expect(hideMutate).toHaveBeenCalledWith('r-1');
    confirmSpy.mockRestore();
  });

  it('does not remove the recipe when the confirm is dismissed', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    useRecipes.mockReturnValue({ data: [pollo, avena], isLoading: false });
    renderPage();

    await user.click(screen.getAllByRole('button', { name: 'Acciones de la receta' })[0]);
    await user.click(screen.getByRole('menuitem', { name: 'Quitar de mi biblioteca' }));

    expect(hideMutate).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('narrows the list with a meal-type chip', async () => {
    const user = userEvent.setup();
    useRecipes.mockReturnValue({ data: [pollo, avena], isLoading: false });
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Desayuno' }));

    expect(screen.getAllByText('Avena con plátano').length).toBeGreaterThan(0);
    expect(screen.queryByText('Pollo con arroz')).toBeNull();
  });

  it('narrows the list with a nutrition-goal chip', async () => {
    const user = userEvent.setup();
    useRecipes.mockReturnValue({ data: [pollo, avena], isLoading: false });
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Alto en fibra' }));

    expect(screen.getAllByText('Avena con plátano').length).toBeGreaterThan(0);
    expect(screen.queryByText('Pollo con arroz')).toBeNull();
  });

  it('shows the no-results empty state when the search matches nothing', async () => {
    const user = userEvent.setup();
    useRecipes.mockReturnValue({ data: [pollo, avena], isLoading: false });
    renderPage();

    await user.type(screen.getAllByPlaceholderText('Buscar receta…')[0], 'zzz');

    expect(screen.getByText('Sin resultados')).toBeInTheDocument();
    expect(screen.queryByText('Pollo con arroz')).toBeNull();
  });

  it('shows the empty-library state when there are no recipes at all', () => {
    useRecipes.mockReturnValue({ data: [], isLoading: false });
    renderPage();

    expect(screen.getByText('Aún no tienes recetas')).toBeInTheDocument();
    expect(screen.queryByText('Sin resultados')).toBeNull();
  });

  it('favourites a recipe and filters down to it with the Favoritas chip', async () => {
    const user = userEvent.setup();
    useRecipes.mockReturnValue({ data: [pollo, avena], isLoading: false });
    renderPage();

    // Both layouts render a pin; either is the same toggle.
    await user.click(screen.getAllByRole('button', { name: 'Marcar como favorita' })[0]);
    await user.click(screen.getByRole('button', { name: /Favoritas/ }));

    expect(screen.getAllByText('Pollo con arroz').length).toBeGreaterThan(0);
    expect(screen.queryByText('Avena con plátano')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem('hudsons-fitness-recetas-favorites') ?? '[]')).toEqual([
      'r-1',
    ]);
  });

  // Favourites are device-local ids: a removed recipe leaves its id in storage.
  // The chip must count what the library actually has, not what storage holds.
  it('counts only favourites present in the library, not stored ghosts', () => {
    window.localStorage.setItem(
      'hudsons-fitness-recetas-favorites',
      JSON.stringify(['r-1', 'gone-1', 'gone-2']),
    );
    useRecipes.mockReturnValue({ data: [pollo, avena], isLoading: false });
    renderPage();

    expect(screen.getByRole('button', { name: 'Favoritas (1)' })).toBeInTheDocument();
  });
});
