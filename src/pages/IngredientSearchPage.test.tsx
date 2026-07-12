import i18n from '@/i18n';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

// The page reaches the supabase client through `features/ingredients/api`
// (ingredientDisplayName), which throws on module load without VITE_SUPABASE_*
// — green locally, red in CI. Stub the client and the search hook.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

const useLocalIngredientSearch = vi.fn();
vi.mock('@/features/ingredients/hooks', () => ({
  useLocalIngredientSearch: (...args: unknown[]) => useLocalIngredientSearch(...args),
}));

import { IngredientSearchPage } from './IngredientSearchPage';
import { normalizeText } from '@/features/recipes/recipeFilter';
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

// The pool — not "my library" (the search is deliberately pool-wide, R-01 §7).
const POOL = [
  ingredient({ id: 'i-1', name: 'Jamón serrano', brand: 'Navidul', is_verified: true }),
  ingredient({ id: 'i-2', name: 'Pollo pechuga', kcal_per_unit: 110 }),
  ingredient({ id: 'i-3', name: 'Avena copos', source: 'openfoodfacts' }),
];

/** Stands in for the server search (ilike over name/name_en/brand). */
function fakeServerSearch(query: string, _limit: number, enabled: boolean) {
  const q = normalizeText(query);
  return {
    data: enabled ? POOL.filter((i) => normalizeText(i.name).includes(q)) : undefined,
    isLoading: false,
  };
}

function Probe() {
  const { pathname, search } = useLocation();
  return <div data-testid="loc">{pathname + search}</div>;
}

function renderSearch() {
  return render(
    <MemoryRouter initialEntries={['/recipes/ingredients/search']}>
      <Routes>
        <Route path="/recipes/ingredients/search" element={<IngredientSearchPage />} />
        <Route path="/recipes/ingredients" element={<div>LA LISTA</div>} />
        <Route path="/recipes/ingredients/new" element={<div>NUEVO</div>} />
      </Routes>
      <Probe />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  useLocalIngredientSearch.mockReset();
  useLocalIngredientSearch.mockImplementation(fakeServerSearch);
  await i18n.changeLanguage('es');
});

describe('IngredientSearchPage', () => {
  it('starts on the hint, with the escape hatch already pinned', () => {
    renderSearch();

    expect(screen.getByText('Escribe para buscar en toda la biblioteca compartida.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Crear un ingrediente nuevo' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Escanear el código de barras' })).toBeInTheDocument();
    // Nothing fetched before the user types.
    expect(useLocalIngredientSearch).toHaveBeenLastCalledWith('', 12, false);
  });

  it('narrows the results as the user types', async () => {
    const user = userEvent.setup();
    renderSearch();

    await user.type(screen.getByRole('textbox', { name: 'Buscar ingredientes…' }), 'pollo');

    expect(await screen.findByText(/pechuga/)).toBeInTheDocument();
    expect(screen.queryByText(/serrano/)).toBeNull();
    expect(screen.queryByText(/Avena/)).toBeNull();
    // The whole pool, 12 rows deep — the hook's semantics are untouched.
    expect(useLocalIngredientSearch).toHaveBeenLastCalledWith('pollo', 12, true);
  });

  it('wraps the matched substring in a <mark>, on the accented original', async () => {
    const user = userEvent.setup();
    renderSearch();

    await user.type(screen.getByRole('textbox', { name: 'Buscar ingredientes…' }), 'jamon');

    const row = await screen.findByRole('button', { name: /Jamón serrano/ });
    const mark = row.querySelector('mark');
    // Typed "jamon", highlighted "Jamón" — the ORIGINAL characters.
    expect(mark?.textContent).toBe('Jamón');
    expect(row).toHaveTextContent('Jamón serrano');
  });

  it('offers the escape hatch when nothing matches', async () => {
    const user = userEvent.setup();
    renderSearch();

    await user.type(screen.getByRole('textbox', { name: 'Buscar ingredientes…' }), 'zzz');

    expect(await screen.findByText('Sin resultados')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Crear un ingrediente nuevo' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Escanear el código de barras' })).toBeInTheDocument();
  });

  it('returns to the list scoped to the picked ingredient', async () => {
    const user = userEvent.setup();
    renderSearch();

    await user.type(screen.getByRole('textbox', { name: 'Buscar ingredientes…' }), 'avena');
    await user.click(await screen.findByRole('button', { name: /Avena copos/ }));

    expect(screen.getByTestId('loc')).toHaveTextContent('/recipes/ingredients?q=Avena+copos');
    expect(screen.getByText('LA LISTA')).toBeInTheDocument();
  });

  it('clears the field, and cancels back to the list', async () => {
    const user = userEvent.setup();
    renderSearch();

    const field = screen.getByRole('textbox', { name: 'Buscar ingredientes…' });
    await user.type(field, 'avena');
    await user.click(screen.getByRole('button', { name: 'Borrar la búsqueda' }));
    expect(field).toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByTestId('loc')).toHaveTextContent('/recipes/ingredients');
    expect(screen.getByText('LA LISTA')).toBeInTheDocument();
  });

  // The takeover is the app's only Radix-based overlay's worth of Escape
  // handling — it used to be a hand-rolled `keydown` listener; now it rides
  // Dialog's own Escape-to-close, which this proves still answers the key.
  it('returns to the list on Escape', async () => {
    const user = userEvent.setup();
    renderSearch();

    await user.keyboard('{Escape}');

    expect(screen.getByTestId('loc')).toHaveTextContent('/recipes/ingredients');
    expect(screen.getByText('LA LISTA')).toBeInTheDocument();
  });
});
