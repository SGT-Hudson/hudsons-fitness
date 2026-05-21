import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { bottomNavItems, type Section } from './nav-config';
import { useActiveSection } from './useActiveSection';

const ACTIVE: Record<Section, string> = {
  nutricion: 'text-nutricion',
  entreno: 'text-entreno',
};

export function BottomNav() {
  const { t } = useTranslation('nav');
  const section = useActiveSection();
  const items = bottomNavItems(section);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t bg-background md:hidden">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.key}
            to={item.route}
            end={item.route === '/progress'}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium',
                isActive ? ACTIVE[section] : 'text-muted-foreground',
              )
            }
          >
            <Icon className="h-5 w-5" />
            {t(item.key)}
          </NavLink>
        );
      })}
    </nav>
  );
}
