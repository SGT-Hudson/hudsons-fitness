import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile } from '@/features/profile/hooks';
import { isProfileOnboarded } from '@/features/profile/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { SignupPage } from '@/pages/SignupPage';
import { OnboardingPage } from '@/pages/OnboardingPage';
import { DiarioPage } from '@/pages/DiarioPage';
import { PlanificadorPage } from '@/pages/PlanificadorPage';
import { PlantillasPage } from '@/pages/PlantillasPage';
import { PlantillaEditorPage } from '@/pages/PlantillaEditorPage';
import { RecetasPage } from '@/pages/RecetasPage';
import { RecetaEditorPage } from '@/pages/RecetaEditorPage';
import { IngredientesPage } from '@/pages/IngredientesPage';
import { ProgresoPage } from '@/pages/ProgresoPage';
import { ObjetivosPage } from '@/pages/ObjetivosPage';
import { SettingsPage } from '@/pages/SettingsPage';

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
  if (user) return <Navigate to="/diario" replace />;
  return <>{children}</>;
}

function RequireOnboarded() {
  const { data: profile, isLoading } = useProfile();
  if (isLoading) return <FullPageLoader />;
  if (!isProfileOnboarded(profile)) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

export function AppRouter() {
  return (
    <BrowserRouter>
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
            <Route index element={<Navigate to="/diario" replace />} />
            <Route path="/diario" element={<DiarioPage />} />
            <Route path="/diario/:date" element={<DiarioPage />} />
            <Route path="/planificador" element={<PlanificadorPage />} />
            <Route path="/menus" element={<PlantillasPage />} />
            <Route path="/menus/nuevo" element={<PlantillaEditorPage />} />
            <Route path="/menus/:id" element={<PlantillaEditorPage />} />
            <Route path="/recetas" element={<RecetasPage />} />
            <Route path="/recetas/nuevo" element={<RecetaEditorPage />} />
            <Route path="/recetas/:id" element={<RecetaEditorPage />} />
            <Route path="/ingredientes" element={<IngredientesPage />} />
            <Route path="/progreso" element={<ProgresoPage />} />
            <Route path="/objetivos" element={<ObjetivosPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
