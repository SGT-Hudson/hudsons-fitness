import i18n from '@/i18n';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// The page (and IngredientDialog, which it still mounts for create/edit) import
// the supabase client, which throws on module load without VITE_SUPABASE_* —
// green locally, red in CI. Stub the client and the data hooks.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

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

const usePoolIngredients = vi.fn();
const useMyIngredientRefIds = vi.fn();
const hideMutate = vi.fn();
vi.mock('@/features/ingredients/hooks', async (importActual) => ({
  ...(await importActual<typeof import('@/features/ingredients/hooks')>()),
  usePoolIngredients: () => usePoolIngredients(),
  useMyIngredientRefIds: () => useMyIngredientRefIds(),
  useHideIngredient: () => ({ mutate: hideMutate, isPending: false }),
}));

vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'qa@x.dev' } }),
}));

import { IngredientesPage } from './IngredientesPage';
import type { Ingredient } from '@/features/ingredients/api';

function ingredient(over: Partial<Ingredient> & Pick<Ingredient, 'id' | 'name'>): Ingredient {
  return {
    name_en: null,
    brand: null,
    source: 'system',
    external_id: null,
    is_verified: false,
    unit_type: 'gram',
    kcal_per_unit: 100,
    protein_g_per_unit: 10,
    carbs_g_per_unit: 20,
    fat_g_per_unit: 5,
    fiber_g_per_unit: 2,
    sugar_g_per_unit: null,
    saturated_fat_g_per_unit: null,
    salt_g_per_unit: null,
    created_by_user_id: null,
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-01T10:00:00Z',
    ...over,
  } as Ingredient;
}

const pollo = ingredient({
  id: 'i-1',
  name: 'Pollo pechuga',
  brand: 'Hacendado',
  source: 'manual',
  created_by_user_id: 'u1',
  is_verified: true,
  kcal_per_unit: 110,
  protein_g_per_unit: 23,
  carbs_g_per_unit: 0,
  fat_g_per_unit: 1.5,
  fiber_g_per_unit: 0,
});
const avena = ingredient({
  id: 'i-2',
  name: 'Avena copos',
  brand: 'Quaker',
  source: 'openfoodfacts',
  kcal_per_unit: 379,
  protein_g_per_unit: 13,
  carbs_g_per_unit: 67,
  fat_g_per_unit: 7,
  fiber_g_per_unit: 10,
});
// A `bedca` row: it must render the *base* badge, not "manual".
const platano = ingredient({
  id: 'i-3',
  name: 'Plátano',
  source: 'bedca',
  unit_type: 'unit',
  kcal_per_unit: 89,
});

function Probe() {
  const { pathname, search } = useLocation();
  return <div data-testid="loc">{pathname + search}</div>;
}

function renderPage(initialPath = '/recipes/ingredients') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <IngredientesPage />
        <Probe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  usePoolIngredients.mockReset();
  useMyIngredientRefIds.mockReset();
  hideMutate.mockReset();
  window.localStorage.clear();
  await i18n.changeLanguage('es');
  useMyIngredientRefIds.mockReturnValue({ data: new Set(['i-1']) });
});

describe('IngredientesPage', () => {
  it('renders a row per pooled ingredient, with its macros and source badge', () => {
    usePoolIngredients.mockReturnValue({ data: [pollo, avena, platano], isLoading: false });
    renderPage();

    // Both layouts mount at once (mobile rows + web table; CSS hides one), as
    // with PageShell's two headers — hence getAllBy*.
    expect(screen.getAllByText('Pollo pechuga').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Avena copos').length).toBeGreaterThan(0);
    // Macros straight off the row — kcal and the P/C/G figures.
    expect(screen.getAllByText('379').length).toBeGreaterThan(0);
    expect(screen.getAllByText('P 23').length).toBeGreaterThan(0);

    // One badge component, three variants — and `bedca` reads as base.
    expect(screen.getAllByRole('img', { name: 'Creado a mano' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('img', { name: 'Importado de OpenFoodFacts' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('img', { name: 'Ingrediente de la base' }).length).toBeGreaterThan(0);
  });

  it('renders the verified check, and only on verified rows', () => {
    usePoolIngredients.mockReturnValue({ data: [pollo, avena, platano], isLoading: false });
    renderPage();

    // `pollo` is the only verified row, and it mounts twice (row + table).
    expect(screen.getAllByRole('img', { name: 'Verificada' })).toHaveLength(2);
  });

  it('narrows the list with a filter chip, and the chips carry real counts', async () => {
    const user = userEvent.setup();
    usePoolIngredients.mockReturnValue({ data: [pollo, avena, platano], isLoading: false });
    renderPage();

    expect(screen.getByRole('button', { name: 'Base 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Por unidad 1' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Verificadas/ }));

    expect(screen.getAllByText('Pollo pechuga').length).toBeGreaterThan(0);
    expect(screen.queryByText('Avena copos')).toBeNull();
    expect(screen.queryByText('Plátano')).toBeNull();
  });

  it('AND-combines two chips', async () => {
    const user = userEvent.setup();
    usePoolIngredients.mockReturnValue({ data: [pollo, avena, platano], isLoading: false });
    renderPage();

    await user.click(screen.getByRole('button', { name: /Verificadas/ }));
    await user.click(screen.getByRole('button', { name: /Por unidad/ }));

    // `pollo` is verified but priced per 100 g; `platano` is per unit but not verified.
    expect(screen.getByText('Sin resultados')).toBeInTheDocument();
  });

  it('shows the no-results empty state when the search matches nothing', async () => {
    const user = userEvent.setup();
    usePoolIngredients.mockReturnValue({ data: [pollo, avena], isLoading: false });
    renderPage();

    await user.type(screen.getAllByPlaceholderText('Buscar por nombre o marca…')[0], 'zzz');

    expect(screen.getByText('Sin resultados')).toBeInTheDocument();
    expect(screen.queryByText('Pollo pechuga')).toBeNull();
  });

  it('shows the empty-pool state when there are no ingredients at all', () => {
    usePoolIngredients.mockReturnValue({ data: [], isLoading: false });
    renderPage();

    expect(screen.getByText('Aún no hay ingredientes')).toBeInTheDocument();
    expect(screen.queryByText('Sin resultados')).toBeNull();
  });

  it('shows a skeleton while the pool loads', () => {
    usePoolIngredients.mockReturnValue({ data: undefined, isLoading: true });
    renderPage();

    expect(screen.queryByText('Aún no hay ingredientes')).toBeNull();
    expect(screen.queryByText('Sin resultados')).toBeNull();
  });

  // R-25: dropping my ref is the only removal there is — the pool row survives
  // (recipe_ingredients FK is ON DELETE RESTRICT), and the copy says "quitar de
  // mi biblioteca". It is offered only on rows I actually hold a ref to.
  it('removes an ingredient from my library after confirming', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    usePoolIngredients.mockReturnValue({ data: [pollo], isLoading: false });
    renderPage();

    await user.click(screen.getAllByRole('button', { name: 'Acciones del ingrediente' })[0]);
    await user.click(screen.getByRole('menuitem', { name: 'Quitar de mi biblioteca' }));

    expect(hideMutate).toHaveBeenCalledWith('i-1');
    confirmSpy.mockRestore();
  });

  it('offers no library actions on a pooled row I neither own nor hold a ref to', () => {
    usePoolIngredients.mockReturnValue({ data: [avena], isLoading: false });
    useMyIngredientRefIds.mockReturnValue({ data: new Set<string>() });
    renderPage();

    expect(screen.queryByRole('button', { name: 'Acciones del ingrediente' })).toBeNull();
  });

  // The verified badge is READ-ONLY this wave: no RLS policy or RPC governs who
  // may verify a shared-pool row someone else owns (spec §4).
  it('offers no way to toggle verified', () => {
    usePoolIngredients.mockReturnValue({ data: [pollo, avena], isLoading: false });
    renderPage();

    expect(screen.queryByRole('checkbox', { name: /Verificada/ })).toBeNull();
    expect(screen.queryByRole('switch', { name: /Verificada/ })).toBeNull();
    // The chip is a filter, not a writer — the badges themselves are images.
    for (const badge of screen.getAllByRole('img', { name: 'Verificada' })) {
      expect(badge.tagName).not.toBe('BUTTON');
    }
  });

  // `withQuery` carries the active `?q=` into `/new` (routeIntent === 'create'
  // opens IngredientDialog), and `closeDialog` carries it back out again —
  // both ends, or the user loses their search by opening the create dialog.
  it('round-trips an active `?q=` through the create dialog, in and out', async () => {
    const user = userEvent.setup();
    usePoolIngredients.mockReturnValue({ data: [pollo, avena], isLoading: false });
    renderPage('/recipes/ingredients?q=avena');

    expect(screen.getByTestId('loc')).toHaveTextContent('/recipes/ingredients?q=avena');

    // In: opening the create dialog is a navigation to `/new`, and it must
    // not drop the query the user was already scoped to.
    await user.click(screen.getAllByRole('link', { name: 'Nuevo ingrediente' })[0]);
    expect(screen.getByTestId('loc')).toHaveTextContent('/recipes/ingredients/new?q=avena');

    // Out: cancelling the dialog returns to the list, still scoped to it.
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByTestId('loc')).toHaveTextContent('/recipes/ingredients?q=avena');
  });

  // R-33 wave 6: editing is a route, not a dialog. Two things are pinned here —
  // that "Editar" NAVIGATES (a dialog would leave the location untouched), and
  // that it carries the active `?q=` with it, exactly as the create path does.
  // `IngredientEditorPage.test.tsx` pins the way back out.
  it('round-trips an active `?q=` into the edit route, and opens no dialog', async () => {
    const user = userEvent.setup();
    usePoolIngredients.mockReturnValue({ data: [pollo, avena], isLoading: false });
    renderPage('/recipes/ingredients?q=pollo');

    // `pollo` is the row I created — the only one that offers "Editar".
    await user.click(screen.getAllByRole('button', { name: 'Acciones del ingrediente' })[0]);
    await user.click(screen.getByRole('menuitem', { name: 'Editar' }));

    expect(screen.getByTestId('loc')).toHaveTextContent('/recipes/ingredients/i-1/edit?q=pollo');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
