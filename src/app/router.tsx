import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile } from '@/features/profile/hooks';
import { isProfileOnboarded } from '@/features/profile/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { SignupPage } from '@/pages/SignupPage';
import { OnboardingPage } from '@/pages/OnboardingPage';
import { ExercisesPage } from '@/pages/ExercisesPage';
import { ExerciseDetailPage } from '@/pages/ExerciseDetailPage';
import { DiarioPage } from '@/pages/DiarioPage';
import { PlanificadorPage } from '@/pages/PlanificadorPage';
import { PlantillasPage } from '@/pages/PlantillasPage';
import { PlantillaEditorPage } from '@/pages/PlantillaEditorPage';
import { RecetasPage } from '@/pages/RecetasPage';
import { RecetaDetailPage } from '@/pages/RecetaDetailPage';
import { RecetaEditorPage } from '@/pages/RecetaEditorPage';
import { IngredientesPage } from '@/pages/IngredientesPage';
import { IngredientMethodPage } from '@/pages/IngredientMethodPage';
import { IngredientEditorPage } from '@/pages/IngredientEditorPage';
import { IngredientSearchPage } from '@/pages/IngredientSearchPage';
import { ObjetivosPage } from '@/pages/ObjetivosPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { MorePage } from '@/pages/MorePage';
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
  if (user) return <Navigate to="/diary" replace />;
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
          <Route index element={<Navigate to="/diary" replace />} />

          {/* Nutrición */}
          <Route path="/diary" element={<DiarioPage />} />
          <Route path="/diary/:date" element={<DiarioPage />} />
          <Route path="/planner" element={<PlanificadorPage />} />
          <Route path="/templates" element={<PlantillasPage />} />
          <Route path="/templates/new" element={<PlantillaEditorPage />} />
          <Route path="/templates/:id" element={<PlantillaEditorPage />} />
          <Route path="/recipes" element={<RecetasPage />} />
          <Route path="/recipes/new" element={<RecetaEditorPage />} />
          {/* R-33 wave 5: reading a recipe and editing it are different screens.
              `/recipes/:id` is the read view; the editor moved to `/edit`. */}
          <Route path="/recipes/:id" element={<RecetaDetailPage />} />
          <Route path="/recipes/:id/edit" element={<RecetaEditorPage />} />
          <Route path="/recipes/ingredients" element={<IngredientesPage />} />
          {/* R-33 wave 6: "¿cómo quieres añadirlo?" — manual / OpenFoodFacts /
              barcode. Every method ends at `/new/manual` below, carrying what it
              learned in `location.state`. */}
          <Route path="/recipes/ingredients/new" element={<IngredientMethodPage />} />
          {/* Still the list (with IngredientDialog open on the barcode tab): the
              full-screen scanner is the next task's, and an unrouted path would
              fall to the catch-all and teleport the user to /diary. */}
          <Route path="/recipes/ingredients/scan" element={<IngredientesPage />} />
          {/* R-33 wave 6: the editor is a PAGE now (create and edit alike). The
              method picker and the scanner both reach `/new/manual` carrying an
              OFF product / a scanned EAN in `location.state`
              (`IngredientEditorRouteState`). `/recipes/ingredients/:id/edit` is
              4 segments and cannot be shadowed by `/recipes/:id/edit` (3), but
              it IS owner-gated inside the page. */}
          <Route path="/recipes/ingredients/new/manual" element={<IngredientEditorPage />} />
          <Route path="/recipes/ingredients/:id/edit" element={<IngredientEditorPage />} />
          {/* D-F24 — the full-screen search, deferred out of the Diario wave. */}
          <Route path="/recipes/ingredients/search" element={<IngredientSearchPage />} />

          {/* Entreno */}
          <Route path="/training" element={<EntrenamientoPage />} />
          <Route path="/training/new" element={<SessionEditorPage />} />
          <Route path="/training/run" element={<RunnerPage />} />
          <Route path="/training/:id" element={<SessionEditorPage />} />
          <Route path="/training/exercises/:id" element={<ExerciseHistoryPage />} />
          <Route path="/routine" element={<RoutinePage />} />
          <Route path="/routine/rutinas/nueva" element={<RoutineEditorPage />} />
          <Route path="/routine/rutinas/:id" element={<RoutineEditorPage />} />
          <Route path="/routine/programas/nuevo" element={<ProgramEditorPage />} />
          <Route path="/routine/programas/:id" element={<ProgramEditorPage />} />
          <Route path="/exercises" element={<ExercisesPage />} />
          <Route path="/exercises/:id" element={<ExerciseDetailPage />} />

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
          <Route path="/more" element={<MorePage />} />
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
