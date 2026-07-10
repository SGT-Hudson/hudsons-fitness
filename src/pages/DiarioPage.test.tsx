// @vitest-environment jsdom
//
// Responsive-structure test for the R-33 wave-2 Diario layout (task 6). jsdom
// doesn't evaluate `md:` media queries, so this asserts on the class-based
// gating (which element is `md:hidden` vs `hidden md:flex`) rather than pixels,
// plus that the mobile ring hero and the web rail hero are distinct (no
// duplicated kcal hero across breakpoints). PageShell mounts a dual header, so
// page-level copy uses getAllBy*.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/i18n';

const state = vi.hoisted(() => ({
  activePhase: null as null | Record<string, unknown>,
}));

// The page's static import tree reaches supabase.ts (via MealLogDialog →
// RecipeAutocomplete), which throws at import when the test env has no Supabase
// keys. Stub the client so the tree loads; the data hooks below are mocked, so
// nothing actually queries it.
vi.mock('@/lib/supabase', () => ({ supabase: {} as never }));

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
  useMealLogsForDay: () => ({ data: [], isLoading: false, isError: false }),
  useQuickAddRecipes: () => ({ data: [] }),
  useMaterializePlan: () => ({ mutate: vi.fn() }),
  useWeeklyKcal: () => ({ data: undefined }),
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

beforeEach(async () => {
  await i18n.changeLanguage('es');
  state.activePhase = { phase_type: 'cut', kcal_mode: 'absolute' };
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
