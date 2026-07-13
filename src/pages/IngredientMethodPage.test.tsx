// @vitest-environment jsdom
//
// R-33 wave 6 PR-B — the method picker (Task 4).
//
// The picker is a NAVIGATION screen: everything it does, it does by handing a
// payload to `/new/manual`. So every test here reads `location.state` — that is
// the behaviour, not an implementation detail.
//
// The load-bearing one is "carries the WHOLE OFFSearchResult": the editor
// branches its save on `offProduct` (set ⇒ import with `source='openfoodfacts'`
// + `external_id`, unset ⇒ a manual row with no barcode). Drop the object here,
// or flatten it to a name, and an imported product silently saves as an
// anonymous manual row — invisible, and unrecoverable without re-scanning.
import i18n from '@/i18n';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';

// The page's import graph reaches `@/lib/supabase` (the ingredient hooks), which
// throws at module load without VITE_SUPABASE_* — green locally, red in CI.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

const { offSearch, lookupMut } = vi.hoisted(() => ({
  offSearch: vi.fn(),
  lookupMut: { mutateAsync: vi.fn(), isPending: false },
}));
vi.mock('@/features/ingredients/hooks', () => ({
  useOFFSearch: (query: string, enabled: boolean) => offSearch(query, enabled),
  useBarcodeLookup: () => lookupMut,
}));

import { IngredientMethodPage } from './IngredientMethodPage';
import type { OFFProductLookup, OFFSearchResult } from '@/lib/openfoodfacts';

const yogur: OFFSearchResult = {
  code: '8410054720533',
  name: 'Yogur natural griego',
  brand: 'Pascual',
  thumbnailUrl: 'https://images.off/yogur.jpg',
  kcalPer100g: 116,
  proteinPer100g: 4.5,
  carbsPer100g: 4.2,
  fatPer100g: 9.7,
  fiberPer100g: 0,
  sugarPer100g: 4,
  satFatPer100g: 6.4,
  saltPer100g: 0.12,
};

/** `(pointer: coarse)` — the ONE query the page keys its camera affordance off. */
function stubPointer(coarse: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('pointer: coarse') ? coarse : false,
    media: q,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function Probe() {
  const { pathname, search, state } = useLocation();
  return (
    <>
      <div data-testid="loc">{pathname + search}</div>
      <div data-testid="state">{JSON.stringify(state)}</div>
    </>
  );
}

function renderPage(initialPath = '/recipes/ingredients/new') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <IngredientMethodPage />
      <Probe />
    </MemoryRouter>,
  );
}

/** What the picker actually handed to `/new/manual`. */
function routeState(): unknown {
  return JSON.parse(screen.getByTestId('state').textContent || 'null');
}

beforeEach(async () => {
  offSearch.mockReset();
  lookupMut.mutateAsync.mockReset();
  vi.unstubAllGlobals();
  stubPointer(false);
  await i18n.changeLanguage('es');
  offSearch.mockReturnValue({ data: [], isFetching: false });
});

describe('IngredientMethodPage', () => {
  it('offers the three methods', () => {
    renderPage();

    expect(screen.getByRole('link', { name: /Añadir manualmente/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Buscar en OpenFoodFacts/ })).toBeInTheDocument();
    // Desktop (the beforeEach default): the barcode method is the typed-EAN field.
    expect(screen.getByLabelText('Código de barras (EAN/UPC)')).toBeInTheDocument();
  });

  it('sends "manual" to the empty editor, seeding the name from an active `?q=`', async () => {
    const user = userEvent.setup();
    renderPage('/recipes/ingredients/new?q=avena');

    await user.click(screen.getByRole('link', { name: /Añadir manualmente/ }));

    // The `?q=` rides along so the editor exits back to the list the user was
    // searching, AND seeds the name field.
    expect(screen.getByTestId('loc')).toHaveTextContent('/recipes/ingredients/new/manual?q=avena');
    expect(routeState()).toEqual({ name: 'avena' });
  });

  // THE test of this task (Constraint 2). Break the payload — pass the name
  // instead of the object, or drop `state` — and it fails.
  it('carries the WHOLE picked OFF product into the editor', async () => {
    const user = userEvent.setup();
    offSearch.mockReturnValue({ data: [yogur], isFetching: false });
    renderPage();

    await user.click(screen.getByRole('button', { name: /Buscar en OpenFoodFacts/ }));
    await user.type(screen.getByPlaceholderText('ej. yogur griego natural'), 'yogur');
    await user.click(await screen.findByRole('button', { name: /Yogur natural griego/ }));

    expect(screen.getByTestId('loc')).toHaveTextContent('/recipes/ingredients/new/manual');
    // Every field, not just the name: this object IS what makes the save an
    // import (source='openfoodfacts' + external_id = the code).
    expect(routeState()).toEqual({ offProduct: yogur });
  });

  it('runs the OFF search off the panel query, and only from 3 characters (the hook gate)', async () => {
    const user = userEvent.setup();
    renderPage();

    // Closed: the hook is mounted but disabled — no request for a panel nobody opened.
    expect(offSearch).toHaveBeenLastCalledWith('', false);

    await user.click(screen.getByRole('button', { name: /Buscar en OpenFoodFacts/ }));
    await user.type(screen.getByPlaceholderText('ej. yogur griego natural'), 'yogur');

    await waitFor(() => expect(offSearch).toHaveBeenLastCalledWith('yogur', true));
  });

  it('seeds the OFF panel with an active `?q=`', async () => {
    const user = userEvent.setup();
    renderPage('/recipes/ingredients/new?q=avena');

    await user.click(screen.getByRole('button', { name: /Buscar en OpenFoodFacts/ }));

    expect(screen.getByPlaceholderText('ej. yogur griego natural')).toHaveValue('avena');
  });

  describe('on a desktop pointer', () => {
    it('offers no camera, and says plainly that scanning is mobile-only', () => {
      renderPage();

      expect(screen.queryByRole('link', { name: /Abrir cámara/ })).toBeNull();
      expect(screen.getByText(/solo está disponible en el móvil/)).toBeInTheDocument();
    });

    it('looks a typed EAN up on OFF and carries the found product into the editor', async () => {
      const user = userEvent.setup();
      const found: OFFProductLookup = { ...yogur, complete: true };
      lookupMut.mutateAsync.mockResolvedValue(found);
      renderPage();

      await user.type(screen.getByLabelText('Código de barras (EAN/UPC)'), yogur.code);
      await user.click(screen.getByRole('button', { name: 'Buscar' }));

      expect(lookupMut.mutateAsync).toHaveBeenCalledWith(yogur.code);
      await waitFor(() =>
        expect(screen.getByTestId('loc')).toHaveTextContent('/recipes/ingredients/new/manual'),
      );
      expect(routeState()).toEqual({ offProduct: found });
    });

    it('carries a typed EAN that OFF does not know as a bare code, never as a product', async () => {
      const user = userEvent.setup();
      lookupMut.mutateAsync.mockResolvedValue(null);
      renderPage();

      await user.type(screen.getByLabelText('Código de barras (EAN/UPC)'), yogur.code);
      await user.click(screen.getByRole('button', { name: 'Buscar' }));

      await waitFor(() =>
        expect(screen.getByTestId('loc')).toHaveTextContent('/recipes/ingredients/new/manual'),
      );
      // `ean` alone: `createManualIngredient` writes no external_id, so the row
      // stays manual — and the editor says so. An `offProduct` here would be a lie.
      expect(routeState()).toEqual({ ean: yogur.code });
    });

    it('refuses to look up an invalid EAN', async () => {
      const user = userEvent.setup();
      renderPage();

      await user.type(screen.getByLabelText('Código de barras (EAN/UPC)'), '123');

      expect(screen.getByRole('button', { name: 'Buscar' })).toBeDisabled();
    });
  });

  describe('on a touch pointer', () => {
    it('promotes the camera and drops the typed-EAN field (the scanner has its own)', () => {
      stubPointer(true);
      renderPage('/recipes/ingredients/new?q=avena');

      const camera = screen.getByRole('link', { name: /Abrir cámara/ });
      // The `?q=` rides into the scanner too — it is the list the user came from.
      expect(camera).toHaveAttribute('href', '/recipes/ingredients/scan?q=avena');
      expect(screen.queryByLabelText('Código de barras (EAN/UPC)')).toBeNull();
    });
  });
});
