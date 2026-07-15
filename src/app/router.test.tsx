// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';

vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'u', email: 'q@x.dev' }, loading: false, signOut: vi.fn() }),
}));
vi.mock('@/features/profile/hooks', () => ({
  useProfile: () => ({ data: { onboarded_at: 'x' }, isLoading: false }),
}));
vi.mock('@/features/profile/api', () => ({ isProfileOnboarded: () => true }));
vi.mock('@/components/layout/AppLayout', async () => {
  const rr = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { AppLayout: () => <rr.Outlet /> };
});

vi.mock('@/pages/DiarioPage', () => ({ DiarioPage: () => <div>DiarioPage</div> }));
vi.mock('@/pages/PlanificadorPage', () => ({ PlanificadorPage: () => <div>PlanificadorPage</div> }));
vi.mock('@/pages/PlantillasPage', () => ({ PlantillasPage: () => <div>PlantillasPage</div> }));
vi.mock('@/pages/PlantillaEditorPage', () => ({ PlantillaEditorPage: () => <div>PlantillaEditorPage</div> }));
vi.mock('@/pages/RecetasPage', () => ({ RecetasPage: () => <div>RecetasPage</div> }));
vi.mock('@/pages/RecetaDetailPage', () => ({ RecetaDetailPage: () => <div>RecetaDetailPage</div> }));
vi.mock('@/pages/RecetaEditorPage', () => ({ RecetaEditorPage: () => <div>RecetaEditorPage</div> }));
vi.mock('@/pages/IngredientesPage', () => ({ IngredientesPage: () => <div>IngredientesPage</div> }));
vi.mock('@/pages/IngredientMethodPage', () => ({
  IngredientMethodPage: () => <div>IngredientMethodPage</div>,
}));
vi.mock('@/pages/IngredientEditorPage', () => ({
  IngredientEditorPage: () => <div>IngredientEditorPage</div>,
}));
vi.mock('@/pages/IngredientSearchPage', () => ({
  IngredientSearchPage: () => <div>IngredientSearchPage</div>,
}));
vi.mock('@/pages/IngredientScanPage', () => ({
  IngredientScanPage: () => <div>IngredientScanPage</div>,
}));
vi.mock('@/pages/EntrenamientoPage', () => ({ EntrenamientoPage: () => <div>EntrenamientoPage</div> }));
vi.mock('@/pages/SessionEditorPage', () => ({ SessionEditorPage: () => <div>SessionEditorPage</div> }));
vi.mock('@/pages/RunnerPage', () => ({ RunnerPage: () => <div>RunnerPage</div> }));
vi.mock('@/pages/ExerciseHistoryPage', () => ({ ExerciseHistoryPage: () => <div>ExerciseHistoryPage</div> }));
vi.mock('@/pages/RoutinePage', () => ({ RoutinePage: () => <div>RoutinePage</div> }));
vi.mock('@/pages/RoutineEditorPage', () => ({ RoutineEditorPage: () => <div>RoutineEditorPage</div> }));
vi.mock('@/pages/ProgramEditorPage', () => ({ ProgramEditorPage: () => <div>ProgramEditorPage</div> }));
vi.mock('@/pages/ExercisesPage', () => ({ ExercisesPage: () => <div>ExercisesPage</div> }));
vi.mock('@/pages/ExerciseDetailPage', () => ({ ExerciseDetailPage: () => <div>ExerciseDetailPage</div> }));
vi.mock('@/pages/ProgresoPage', () => ({ ProgresoPage: () => <div>ProgresoPage</div> }));
vi.mock('@/pages/ObjetivosPage', () => ({ ObjetivosPage: () => <div>ObjetivosPage</div> }));
vi.mock('@/pages/PhaseEditorPage', () => ({ PhaseEditorPage: () => <div>PhaseEditorPage</div> }));
vi.mock('@/pages/MeasurementHistoryPage', () => ({
  MeasurementHistoryPage: () => <div>MeasurementHistoryPage</div>,
}));
vi.mock('@/pages/SettingsPage', () => ({ SettingsPage: () => <div>SettingsPage</div> }));
vi.mock('@/pages/MorePage', () => ({ MorePage: () => <div>MorePage</div> }));
vi.mock('@/pages/settings/SettingsProfilePage', () => ({ SettingsProfilePage: () => <div>SettingsProfilePage</div> }));
vi.mock('@/pages/settings/SettingsBiometricsPage', () => ({ SettingsBiometricsPage: () => <div>SettingsBiometricsPage</div> }));
vi.mock('@/pages/settings/SettingsAccountPage', () => ({ SettingsAccountPage: () => <div>SettingsAccountPage</div> }));
vi.mock('@/pages/LoginPage', () => ({ LoginPage: () => <div>LoginPage</div> }));
vi.mock('@/pages/SignupPage', () => ({ SignupPage: () => <div>SignupPage</div> }));
vi.mock('@/pages/OnboardingPage', () => ({ OnboardingPage: () => <div>OnboardingPage</div> }));

import { AppRoutes } from './router';

function stubWidth(desktop: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: desktop, media: q,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(), onchange: null,
  }));
}

beforeEach(async () => { await i18n.changeLanguage('es'); localStorage.clear(); stubWidth(true); });
afterEach(() => vi.unstubAllGlobals());

describe('AppRoutes', () => {
  it('routes /routine to the RoutinePage', () => {
    render(<MemoryRouter initialEntries={['/routine']}><AppRoutes /></MemoryRouter>);
    expect(screen.getByText('RoutinePage')).toBeInTheDocument();
  });

  it('routes /exercises to the exercise browse page', () => {
    render(<MemoryRouter initialEntries={['/exercises']}><AppRoutes /></MemoryRouter>);
    expect(screen.getByText('ExercisesPage')).toBeInTheDocument();
  });

  it('routes /exercises/:id to the exercise detail page', () => {
    render(<MemoryRouter initialEntries={['/exercises/abc-123']}><AppRoutes /></MemoryRouter>);
    expect(screen.getByText('ExerciseDetailPage')).toBeInTheDocument();
  });

  it('renders the diary page at /diary', () => {
    render(<MemoryRouter initialEntries={['/diary']}><AppRoutes /></MemoryRouter>);
    expect(screen.getByText('DiarioPage')).toBeInTheDocument();
  });

  it('redirects the index to /diary', () => {
    render(<MemoryRouter initialEntries={['/']}><AppRoutes /></MemoryRouter>);
    expect(screen.getByText('DiarioPage')).toBeInTheDocument();
  });

  // R-33 wave 5 route split: reading a recipe and editing it are different
  // screens. Pin all three recipe routes — a regression here silently drops the
  // user back into edit mode from a reading intent.
  it('routes /recipes/:id to the recipe read view', () => {
    render(<MemoryRouter initialEntries={['/recipes/r-1']}><AppRoutes /></MemoryRouter>);
    expect(screen.getByText('RecetaDetailPage')).toBeInTheDocument();
  });

  it('routes /recipes/:id/edit to the recipe editor', () => {
    render(<MemoryRouter initialEntries={['/recipes/r-1/edit']}><AppRoutes /></MemoryRouter>);
    expect(screen.getByText('RecetaEditorPage')).toBeInTheDocument();
  });

  it('routes /recipes/new to the recipe editor', () => {
    render(<MemoryRouter initialEntries={['/recipes/new']}><AppRoutes /></MemoryRouter>);
    expect(screen.getByText('RecetaEditorPage')).toBeInTheDocument();
  });

  // R-33 wave 6: the ingredient editor is a page. `/recipes/ingredients/:id/edit`
  // is 4 segments and `/recipes/:id/edit` is 3, so they cannot collide — but the
  // recipe editor sitting one path family away is exactly the shadowing mistake
  // this pins against.
  it('routes /recipes/ingredients/new to the method picker, not the list', () => {
    render(
      <MemoryRouter initialEntries={['/recipes/ingredients/new']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByText('IngredientMethodPage')).toBeInTheDocument();
    expect(screen.queryByText('IngredientesPage')).toBeNull();
  });

  it('routes /recipes/ingredients/new/manual to the ingredient editor', () => {
    render(
      <MemoryRouter initialEntries={['/recipes/ingredients/new/manual']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByText('IngredientEditorPage')).toBeInTheDocument();
  });

  // Wave 6 moved the scanner off the list page (where it was a dialog tab) onto
  // its own full-screen route. A regression here puts the user back on a bare
  // list with no way to scan.
  it('routes /recipes/ingredients/scan to the full-screen scanner, not the list', () => {
    render(
      <MemoryRouter initialEntries={['/recipes/ingredients/scan']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByText('IngredientScanPage')).toBeInTheDocument();
    expect(screen.queryByText('IngredientesPage')).toBeNull();
  });

  it('routes /recipes/ingredients/:id/edit to the ingredient editor, not the recipe editor', () => {
    render(
      <MemoryRouter initialEntries={['/recipes/ingredients/i-1/edit']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByText('IngredientEditorPage')).toBeInTheDocument();
    expect(screen.queryByText('RecetaEditorPage')).toBeNull();
  });

  // R-33 wave 7: the measurement archive is a route, not a dialog — and it is
  // the only place a measurement can be deleted.
  it('routes /progress/history to the measurement history page', () => {
    render(
      <MemoryRouter initialEntries={['/progress/history']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByText('MeasurementHistoryPage')).toBeInTheDocument();
    expect(screen.queryByText('ProgresoPage')).toBeNull();
  });

  // R-33 wave 8: the phase editor is a route, not a dialog.
  it('routes the phase editor (new + edit) to the editor page', () => {
    render(
      <MemoryRouter initialEntries={['/progress/goals/phases/new']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByText('PhaseEditorPage')).toBeInTheDocument();
    expect(screen.queryByText('ObjetivosPage')).toBeNull();

    render(
      <MemoryRouter initialEntries={['/progress/goals/phases/p1/edit']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getAllByText('PhaseEditorPage').length).toBeGreaterThan(0);
  });

  it('routes /more to the More hub page', () => {
    render(<MemoryRouter initialEntries={['/more']}><AppRoutes /></MemoryRouter>);
    expect(screen.getByText('MorePage')).toBeInTheDocument();
  });
});
