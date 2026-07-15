import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { bottomNavItems } from './nav-config';
import { useActiveSection } from './useActiveSection';

export function BottomNav() {
  const { t } = useTranslation('nav');
  const section = useActiveSection();
  const items = bottomNavItems(section);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 grid border-t bg-card px-2.5 pt-1.5 pb-[max(env(safe-area-inset-bottom),0.375rem)] md:hidden"
      style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.key}
            to={item.route}
            end={item.route === '/progress'}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center gap-[3px] py-1',
                isActive ? 'font-semibold text-accent-ink' : 'font-medium text-text-dim',
              )
            }
          >
            <Icon className="size-[19px]" />
            <span className="text-[9.5px]">{t(item.key)}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
