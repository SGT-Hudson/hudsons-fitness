import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { BottomNav } from './BottomNav';
import { SectionSwitcher } from './SectionSwitcher';
import { AvatarMenu } from './AvatarMenu';
import { useActiveSection } from './useActiveSection';

export function AppLayout() {
  const section = useActiveSection();
  return (
    <div className={`flex min-h-dvh ${section === 'gym' ? 'section-gym' : 'section-nutri'}`}>
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background px-4 md:hidden">
          <SectionSwitcher />
          <AvatarMenu />
        </header>
        <main className="flex-1 pb-20 md:pb-0">
          <div className="container py-6">
            <Outlet />
          </div>
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
