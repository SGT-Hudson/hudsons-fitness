// @vitest-environment jsdom
//
// Responsive-structure test for the R-33 wave-2 Diario layout (task 6). jsdom
// doesn't evaluate `md:` media queries, so this asserts on the class-based
// gating (which element is `md:hidden` vs `hidden md:flex`) rather than pixels,
// plus that the mobile ring hero and the web rail hero are distinct (no
// duplicated kcal hero across breakpoints). PageShell mounts a dual header, so
// page-level copy uses getAllBy*.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';
import type { MealLogWithJoins } from '@/features/diario/api';

const state = vi.hoisted(() => ({
  activePhase: null as null | Record<string, unknown>,
  logs: [] as MealLogWithJoins[],
  createAsync: vi.fn(),
  updateAsync: vi.fn(),
  deleteAsync: vi.fn(),
}));

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

// The page's static import tree reaches supabase.ts (via the add-sheet's
// ingredient/recipe helpers), which throws at import when the test env has no
// Supabase keys. Stub the client so the tree loads; the data hooks below are
// mocked, so nothing actually queries it.
vi.mock('@/lib/supabase', () => ({ supabase: {} as never }));

// The add-sheet's library/search hooks — kept off the real client (return
// empty). The sheet is always mounted (open toggles content), so these run
// even before a trigger opens it.
vi.mock('@/features/recipes/hooks', () => ({
  useRecipes: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/features/ingredients/hooks', () => ({
  useLocalIngredientSearch: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'qa@x.dev' } }),
}));

vi.mock('@/features/phases/hooks', () => ({
  useActivePhase: () => ({ data: state.activePhase }),
}));

// Fixed targets whenever a phase + weight exist — keeps the page test off the
// real phase-target math (covered by its own unit tests).
vi.mock('@/features/phases/targets', () => ({
  computePhaseTargets: () => ({ kcal: 2180, proteinG: 168, carbsG: 245, fatG: 68, fiberG: 30 }),
}));

vi.mock('@/features/tdee/hooks', () => ({
  useLatestTdee: () => ({ data: { estimated_tdee_kcal: 2480 } }),
}));

vi.mock('@/features/measurements/hooks', async (importActual) => ({
  ...(await importActual<typeof import('@/features/measurements/hooks')>()),
  useLatestMeasurement: () => ({
    data: { weight_kg: 82.9, body_fat_pct: 18, measured_on: '2026-05-27' },
  }),
  useSmoothedMeasurements: () => ({ data: [] }),
}));

vi.mock('@/features/diario/hooks', async (importActual) => ({
  ...(await importActual<typeof import('@/features/diario/hooks')>()),
  useMealLogsForDay: () => ({ data: state.logs, isLoading: false, isError: false }),
  useQuickAddRecipes: () => ({ data: [] }),
  useMaterializePlan: () => ({ mutate: vi.fn() }),
  useWeeklyKcal: () => ({ data: undefined }),
  useCreateMealLog: () => ({ mutateAsync: state.createAsync, isPending: false }),
  useUpdateMealLog: () => ({ mutateAsync: state.updateAsync, isPending: false }),
  useDeleteMealLog: () => ({ mutateAsync: state.deleteAsync, isPending: false }),
}));

import { DiarioPage } from './DiarioPage';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/diary']}>
        <DiarioPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function makeCustomLog(overrides: Partial<MealLogWithJoins> = {}): MealLogWithJoins {
  return {
    id: 'log-1',
    user_id: 'u1',
    logged_on: '2026-05-18',
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
    ...overrides,
  } as MealLogWithJoins;
}

beforeEach(async () => {
  await i18n.changeLanguage('es');
  state.activePhase = { phase_type: 'cut', kcal_mode: 'absolute' };
  state.logs = [];
  state.createAsync = vi.fn().mockResolvedValue({ id: 'new' });
  state.updateAsync = vi.fn().mockResolvedValue({ id: 'log-1' });
  state.deleteAsync = vi.fn().mockResolvedValue(undefined);
});

describe('DiarioPage responsive layout', () => {
  it('mounts the mobile ring summary and the web rail with responsive gating classes', () => {
    const { container } = renderPage();

    // Two-column grid (meals left, 380px rail right) on md+.
    expect(container.querySelector('.md\\:grid-cols-\\[1fr_380px\\]')).not.toBeNull();

    // Rail is hidden on mobile, flex on md+.
    const aside = container.querySelector('aside');
    expect(aside).not.toBeNull();
    expect(aside).toHaveClass('hidden');
    expect(aside?.className).toMatch(/md:flex/);

    // The rail owns the kcal hero + the body card's register button.
    expect(screen.getByTestId('kcal-hero-remaining')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /registrar medición/i }),
    ).toBeInTheDocument();

    // The mobile ring summary is present but wrapped in md:hidden — so the
    // desktop rail hero is NOT duplicated. The ring value testid is unique to
    // DayTotalsCard's KcalRing (the rail uses KcalHero, no ring).
    const ring = screen.getByTestId('kcal-ring-value');
    expect(ring.closest('.md\\:hidden')).not.toBeNull();
  });

  it('shares one set of meal sections across both breakpoints', () => {
    renderPage();
    // Meal headings render once (single shared column), not per breakpoint.
    expect(screen.getByText('Desayuno')).toBeInTheDocument();
    expect(screen.getByText('Cena')).toBeInTheDocument();
  });

  it('with no active phase, the rail shows the targets hint and no hero', () => {
    state.activePhase = null;
    renderPage();
    expect(screen.queryByTestId('kcal-hero-remaining')).toBeNull();
    // The hint copy shows in both the mobile card and the rail fallback.
    expect(screen.getAllByText(/objetivos diarios/i).length).toBeGreaterThan(0);
  });
});

// The page's numbers all come from `useDayContext` — this is the net under that
// derivation: the day's kcal total (ring + rail hero), the active-phase label,
// and the per-slot subtotals the add-sheet's slot picker draws.
describe('DiarioPage day numbers (useDayContext)', () => {
  it('renders the day’s kcal total, the phase label and the per-slot subtotals', () => {
    state.logs = [
      makeCustomLog(), // desayuno, 318 kcal
      makeCustomLog({
        id: 'log-2',
        meal_type: 'lunch',
        custom_name: 'Pollo con arroz',
        custom_kcal: 500,
      }),
    ];
    renderPage();

    // totals.kcal = 318 + 500 → the mobile ring's centre number, and the rail
    // hero's remaining against the mocked 2180 target.
    expect(screen.getByTestId('kcal-ring-value')).toHaveTextContent('818');
    expect(screen.getByTestId('kcal-hero-remaining')).toHaveTextContent('1362');

    // phaseLabel — the rail hero's accent chip ('cut' → "Corte").
    expect(screen.getByText('Corte')).toBeInTheDocument();

    // mealSubtotals — one kcal figure per slot chip in the add-sheet.
    fireEvent.click(screen.getAllByRole('button', { name: /^añadir comida$/i })[0]);
    const group = screen.getByRole('radiogroup', { name: 'Elegir franja' });
    expect(within(group).getByRole('radio', { name: /Desayuno/ })).toHaveTextContent('318');
    expect(within(group).getByRole('radio', { name: /Comida/ })).toHaveTextContent('500');
    expect(within(group).getByRole('radio', { name: /Cena/ })).toHaveTextContent('vacío');
  });
});

describe('DiarioPage add-flow triggers', () => {
  function slotGroup() {
    return screen.getByRole('radiogroup', { name: 'Elegir franja' });
  }

  it('the header "Añadir comida" button opens the sheet at the first empty slot', () => {
    renderPage();
    // PageShell dual-mounts the header → two buttons; either opens the sheet.
    fireEvent.click(screen.getAllByRole('button', { name: /^añadir comida$/i })[0]);
    expect(
      within(slotGroup()).getByRole('radio', { name: /Desayuno/ }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('a meal-card + opens the sheet locked to that meal slot', () => {
    renderPage();
    // Order: breakfast, lunch, snack, dinner ('other' hidden when empty).
    const adds = screen.getAllByRole('button', { name: /añadir a esta comida/i });
    fireEvent.click(adds[1]); // lunch
    expect(
      within(slotGroup()).getByRole('radio', { name: /Comida/ }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('editing an entry opens the sheet in edit mode and updates via useUpdateMealLog', async () => {
    state.logs = [makeCustomLog()];
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /editar entrada/i }));
    // The edit title (not "Añadir a hoy") confirms edit mode.
    expect(screen.getAllByText('Editar entrada').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(state.updateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'log-1' }),
      ),
    );
  });
});
