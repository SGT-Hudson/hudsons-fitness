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
vi.mock('@/pages/RecetaEditorPage', () => ({ RecetaEditorPage: () => <div>RecetaEditorPage</div> }));
vi.mock('@/pages/IngredientesPage', () => ({ IngredientesPage: () => <div>IngredientesPage</div> }));
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
vi.mock('@/pages/SettingsPage', () => ({ SettingsPage: () => <div>SettingsPage</div> }));
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

  it('redirects the index to /home (desktop dashboard)', () => {
    render(<MemoryRouter initialEntries={['/']}><AppRoutes /></MemoryRouter>);
    expect(screen.getByText('Inicio')).toBeInTheDocument();
  });
});
