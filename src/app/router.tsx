import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile } from '@/features/profile/hooks';
import { isProfileOnboarded } from '@/features/profile/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { SignupPage } from '@/pages/SignupPage';
import { OnboardingPage } from '@/pages/OnboardingPage';
import { HomePage } from '@/pages/HomePage';
import { EnProgresoPage } from '@/pages/EnProgresoPage';
import { DiarioPage } from '@/pages/DiarioPage';
import { PlanificadorPage } from '@/pages/PlanificadorPage';
import { PlantillasPage } from '@/pages/PlantillasPage';
import { PlantillaEditorPage } from '@/pages/PlantillaEditorPage';
import { RecetasPage } from '@/pages/RecetasPage';
import { RecetaEditorPage } from '@/pages/RecetaEditorPage';
import { IngredientesPage } from '@/pages/IngredientesPage';
import { ObjetivosPage } from '@/pages/ObjetivosPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { SettingsProfilePage } from '@/pages/settings/SettingsProfilePage';
import { SettingsBiometricsPage } from '@/pages/settings/SettingsBiometricsPage';
import { SettingsAccountPage } from '@/pages/settings/SettingsAccountPage';
import { EntrenamientoPage } from '@/pages/EntrenamientoPage';
import { SessionEditorPage } from '@/pages/SessionEditorPage';
import { ExerciseHistoryPage } from '@/pages/ExerciseHistoryPage';
import { RoutinePage } from '@/pages/RoutinePage';
import { RunnerPage } from '@/pages/RunnerPage';
import { RoutineEditorPage } from '@/pages/RoutineEditorPage';
import { ProgramEditorPage } from '@/pages/ProgramEditorPage';
import { MuscleActivityPage } from '@/pages/MuscleActivityPage';

const ProgresoPage = lazy(() =>
  import('@/pages/ProgresoPage').then((m) => ({ default: m.ProgresoPage })),
);

function FullPageLoader() {
  return <div className="p-8 text-muted-foreground">…</div>;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (user) return <Navigate to="/home" replace />;
  return <>{children}</>;
}

function RequireOnboarded() {
  const { data: profile, isLoading } = useProfile();
  if (isLoading) return <FullPageLoader />;
  if (!isProfileOnboarded(profile)) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfAuthed>
            <LoginPage />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/signup"
        element={
          <RedirectIfAuthed>
            <SignupPage />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            <OnboardingPage />
          </RequireAuth>
        }
      />
      <Route
        element={
          <RequireAuth>
            <RequireOnboarded />
          </RequireAuth>
        }
      >
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<HomePage />} />

          {/* Nutrición */}
          <Route path="/diary" element={<DiarioPage />} />
          <Route path="/diary/:date" element={<DiarioPage />} />
          <Route path="/planner" element={<PlanificadorPage />} />
          <Route path="/templates" element={<PlantillasPage />} />
          <Route path="/templates/new" element={<PlantillaEditorPage />} />
          <Route path="/templates/:id" element={<PlantillaEditorPage />} />
          <Route path="/recipes" element={<RecetasPage />} />
          <Route path="/recipes/new" element={<RecetaEditorPage />} />
          <Route path="/recipes/:id" element={<RecetaEditorPage />} />
          <Route path="/recipes/ingredients" element={<IngredientesPage />} />

          {/* Entreno */}
          <Route path="/training" element={<EntrenamientoPage />} />
          <Route path="/training/muscles" element={<MuscleActivityPage />} />
          <Route path="/training/new" element={<SessionEditorPage />} />
          <Route path="/training/run" element={<RunnerPage />} />
          <Route path="/training/:id" element={<SessionEditorPage />} />
          <Route path="/training/exercises/:id" element={<ExerciseHistoryPage />} />
          <Route path="/routine" element={<RoutinePage />} />
          <Route path="/routine/rutinas/nueva" element={<RoutineEditorPage />} />
          <Route path="/routine/rutinas/:id" element={<RoutineEditorPage />} />
          <Route path="/routine/programas/nuevo" element={<ProgramEditorPage />} />
          <Route path="/routine/programas/:id" element={<ProgramEditorPage />} />
          <Route path="/exercises" element={<EnProgresoPage />} />

          {/* Shared */}
          <Route
            path="/progress"
            element={
              <Suspense fallback={<FullPageLoader />}>
                <ProgresoPage />
              </Suspense>
            }
          />
          <Route path="/progress/goals" element={<ObjetivosPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/profile" element={<SettingsProfilePage />} />
          <Route path="/settings/biometrics" element={<SettingsBiometricsPage />} />
          <Route path="/settings/account" element={<SettingsAccountPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
