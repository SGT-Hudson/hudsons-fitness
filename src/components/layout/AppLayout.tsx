import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/AuthProvider';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { to: '/diario', key: 'diario' },
  { to: '/planificador', key: 'planificador' },
  { to: '/menus', key: 'menus' },
  { to: '/recetas', key: 'recetas' },
  { to: '/ingredientes', key: 'ingredientes' },
  { to: '/progreso', key: 'progreso' },
  { to: '/objetivos', key: 'objetivos' },
  { to: '/settings', key: 'settings' },
] as const;

export function AppLayout() {
  const { t } = useTranslation('nav');
  const { t: tCommon } = useTranslation('common');
  const { t: tAuth } = useTranslation('auth');
  const { signOut, user } = useAuth();

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="border-b bg-background sticky top-0 z-10">
        <div className="container flex items-center justify-between h-14 gap-4">
          <span className="font-bold tracking-tight">{tCommon('appName')}</span>
          <nav className="flex items-center gap-1 overflow-x-auto">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                  )
                }
              >
                {t(item.key)}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {user && (
              <Button variant="ghost" size="sm" onClick={() => void signOut()}>
                {tAuth('signOut')}
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="container py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
