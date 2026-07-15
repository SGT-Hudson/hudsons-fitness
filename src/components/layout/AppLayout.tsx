import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { BottomNav } from './BottomNav';
import { useActiveSection } from './useActiveSection';

export function AppLayout() {
  const section = useActiveSection();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('section-nutri', 'section-gym');
    root.classList.add(section === 'gym' ? 'section-gym' : 'section-nutri');
  }, [section]);

  return (
    <div className="flex min-h-dvh">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 pb-20 md:pb-0">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
