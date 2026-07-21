import i18n from '@/i18n';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isoDate } from '@/lib/dates';
import type { MealLogWithJoins } from '@/features/diario/api';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

// AddToDaySheet uses useMediaQuery (window.matchMedia is unpolyfilled in jsdom).
// Stub it to mobile (false) so the sheet renders as the vaul Drawer.
vi.stubGlobal('matchMedia', (q: string) => ({
  matches: false,
  media: q,
  onchange: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

const useRecipes = vi.fn();
const hideMutate = vi.fn();
vi.mock('@/features/recipes/hooks', () => ({
  useRecipes: () => useRecipes(),
  useHideRecipe: () => ({ mutate: hideMutate }),
}));

vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'qa@x.dev' } }),
}));
vi.mock('@/features/phases/hooks', () => ({ useActivePhase: () => ({ data: null }) }));
vi.mock('@/features/measurements/hooks', () => ({ useLatestMeasurement: () => ({ data: undefined }) }));
vi.mock('@/features/tdee/hooks', () => ({ useLatestTdee: () => ({ data: undefined }) }));
vi.mock('@/features/ingredients/hooks', () => ({
  useLocalIngredientSearch: () => ({ data: [], isLoading: false }),
}));

// `useMealLogsForDay` stays real — its query timing (cold cache vs. already
// warmed) is exactly what task 3's regression test exercises. Everything else
// AddToDaySheet/RacionStep pull from this module is stubbed.
vi.mock('@/features/diario/hooks', async (importActual) => ({
  ...(await importActual<typeof import('@/features/diario/hooks')>()),
  useQuickAddRecipes: () => ({ data: [] }),
  useCreateMealLog: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateMealLog: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteMealLog: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// `fetchMealLogsForDay` is the network edge `useMealLogsForDay` calls — mocked
// with a controllable delay so a test can simulate "the query is still in
// flight" vs. "it landed a while ago".
const fetchMealLogsForDayMock = vi.fn(
  () =>
    new Promise<MealLogWithJoins[]>((resolve) => {
      setTimeout(() => resolve([]), 30);
    }),
);
vi.mock('@/features/diario/api', async (importActual) => ({
  ...(await importActual<typeof import('@/features/diario/api')>()),
  fetchMealLogsForDay: (...args: Parameters<typeof fetchMealLogsForDayMock>) =>
    fetchMealLogsForDayMock(...args),
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
    // Mine by default — the useAuth mock above is 'u1'. Override to model a
    // pooled recipe (R-01) that I hold a ref to but did not create.
    created_by_user_id: 'u1',
    labels: NO_LABELS,
    perServing: { kcal: 420, proteinG: 30, carbsG: 40, fatG: 12, fiberG: 6 },
    photo_url: null,
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

// A fresh, empty QueryClient per render — the "cold cache" the task-3
// regression test needs (no prior fetch for today's meal logs).
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <RecetasPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function makeBreakfastLog(): MealLogWithJoins {
  return {
    id: 'log-1',
    user_id: 'u1',
    logged_on: isoDate(),
    meal_type: 'breakfast',
    notes: null,
    from_plan: false,
    recipe_id: null,
    ingredient_id: null,
    servings: null,
    quantity: null,
    custom_name: 'Avena con plátano',
    custom_kcal: 318,
    custom_protein_g: 11,
    custom_carbs_g: 58,
    custom_fat_g: 5,
    custom_fiber_g: 4,
    custom_sugar_g: null,
    custom_saturated_fat_g: null,
    plan_week_slot_id: null,
    created_at: '2026-05-18T08:00:00Z',
    recipe: null,
    ingredient: null,
  } as MealLogWithJoins;
}

beforeEach(async () => {
  useRecipes.mockReset();
  hideMutate.mockReset();
  window.localStorage.clear();
  await i18n.changeLanguage('es');
  fetchMealLogsForDayMock.mockReset();
  fetchMealLogsForDayMock.mockImplementation(
    () => new Promise<MealLogWithJoins[]>((resolve) => setTimeout(() => resolve([]), 30)),
  );
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

  // The card/row is a stretched link to the recipe's read view, and the kebab's
  // edit item points at the editor — two different routes since the wave-5 split.
  // Pin them so a bad retarget fails here instead of in the browser.
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
      '/recipes/r-1/edit',
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

// R-01: a library is a set of refs into a shared pool, so it can hold recipes
// other people created. `save_recipe` scopes its UPDATE to the creator, so the
// card menu must not offer "editar" on those — it is a guaranteed 400. Removing
// one from the library (`hide_owned_recipe`) is a ref drop and stays available.
describe('RecetasPage card menu — edit is creator-only, remove is not', () => {
  const mine = recipe({ id: 'r-1', name: 'Pollo con arroz', created_by_user_id: 'u1' });
  const theirs = recipe({
    id: 'r-2',
    name: 'Avena con plátano',
    created_by_user_id: 'someone-else',
  });

  // Both layouts (mobile RecipeRow + web RecipeCard) mount, so each recipe has
  // two menus. Open the one belonging to the named recipe's row/card.
  async function openMenuFor(user: ReturnType<typeof userEvent.setup>, index: number) {
    await user.click(screen.getAllByRole('button', { name: 'Acciones de la receta' })[index]);
  }

  it('offers edit on a recipe I created', async () => {
    const user = userEvent.setup();
    useRecipes.mockReturnValue({ data: [mine], isLoading: false });
    renderPage();

    await openMenuFor(user, 0);

    expect(await screen.findByRole('menuitem', { name: /Editar/ })).toHaveAttribute(
      'href',
      '/recipes/r-1/edit',
    );
    expect(screen.getByRole('menuitem', { name: /Quitar de mi biblioteca/ })).toBeInTheDocument();
  });

  it('offers no edit on a pooled recipe I did not create — but still lets me remove it', async () => {
    const user = userEvent.setup();
    useRecipes.mockReturnValue({ data: [theirs], isLoading: false });
    renderPage();

    await openMenuFor(user, 0);

    // The ref drop is NOT ownership-gated and must keep working.
    expect(await screen.findByRole('menuitem', { name: /Quitar de mi biblioteca/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Editar/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Editar/ })).toBeNull();
  });
});

// Task 3 regression: on a cold react-query cache, the add-to-day sheet opened
// from a recipe row must land on the day's first *empty* meal slot, not the
// 'breakfast' fallback baked into AddToDaySheet's props. RecetasPage warms
// `useMealLogsForDay` on mount so it has landed by the time a click is
// possible; without that, the sheet's reset effect (which reads its meal-slot
// prop once, on open) fires while the query is still in flight.
describe('RecetasPage add-to-day slot suggestion (cold cache)', () => {
  it('lands the sheet on the first empty meal slot once the day already has a breakfast logged', async () => {
    const user = userEvent.setup();
    // The day already has breakfast logged — so once the meal-log query
    // resolves, the first *empty* real slot is lunch ('Comida'), not breakfast.
    fetchMealLogsForDayMock.mockImplementation(
      () => new Promise<MealLogWithJoins[]>((resolve) => setTimeout(() => resolve([makeBreakfastLog()]), 30)),
    );
    useRecipes.mockReturnValue({ data: [pollo, avena], isLoading: false });
    renderPage();

    // Give the page-mount prefetch (30ms mock delay) time to land — a stand-in
    // for the "user browses the list for a bit before clicking" gap the real
    // fix relies on.
    await new Promise((resolve) => setTimeout(resolve, 60));

    await user.click(screen.getAllByRole('button', { name: /añadir al diario/i })[0]);

    const slotGroup = await screen.findByRole('radiogroup', { name: 'Elegir franja' });
    expect(within(slotGroup).getByRole('radio', { name: /Comida/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(within(slotGroup).getByRole('radio', { name: /Desayuno/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });
});
