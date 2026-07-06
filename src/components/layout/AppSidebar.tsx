import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/AuthProvider';
import { AvatarMenu } from './AvatarMenu';
import { sidebarGroups, SECTION_I18N_KEY, type NavGroup } from './nav-config';

const ACTIVE: Record<NavGroup, string> = {
  shared: 'bg-accent text-foreground before:bg-foreground',
  nutri: 'bg-nutri/10 text-nutri before:bg-nutri',
  gym: 'bg-gym/10 text-gym before:bg-gym',
};

export function AppSidebar() {
  const { t } = useTranslation('nav');
  const { t: tCommon } = useTranslation('common');
  const { user } = useAuth();
  const groups = sidebarGroups();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r bg-card md:flex md:sticky md:top-0 md:h-dvh">
      <div className="flex items-center gap-2 px-4 py-4 font-bold">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-background">
          H
        </span>
        {tCommon('appName')}
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-2">
        {groups.map(({ group, items }) => (
          <div key={group} className="space-y-1">
            {group !== 'shared' && (
              <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                {t(`section.${SECTION_I18N_KEY[group]}`)}
              </p>
            )}
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.key}
                  to={item.route}
                  end={item.route === '/progress'}
                  className={({ isActive }) =>
                    cn(
                      'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors',
                      'before:absolute before:-left-3 before:top-2 before:bottom-2 before:w-0.5 before:rounded-r',
                      isActive
                        ? ACTIVE[group]
                        : 'hover:bg-accent hover:text-foreground before:bg-transparent',
                    )
                  }
                >
                  <Icon className="h-[18px] w-[18px]" />
                  {t(item.key)}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-3 border-t px-3 py-3">
        <AvatarMenu />
        <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
      </div>
    </aside>
  );
}
