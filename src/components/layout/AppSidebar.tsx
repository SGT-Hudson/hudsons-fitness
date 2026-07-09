import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/AuthProvider';
import { AvatarMenu } from './AvatarMenu';
import { SIDEBAR_GROUPS, type Section } from './nav-config';

const ACTIVE: Record<Section, string> = {
  nutri: 'bg-nutri/10 text-nutri before:bg-nutri',
  gym: 'bg-gym/10 text-gym before:bg-gym',
};
const NEUTRAL_ACTIVE = 'bg-accent-soft text-foreground before:bg-foreground';

export function AppSidebar() {
  const { t } = useTranslation('nav');
  const { t: tCommon } = useTranslation('common');
  const { user } = useAuth();
  const groups = SIDEBAR_GROUPS;

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r bg-card md:flex md:sticky md:top-0 md:h-dvh">
      <div className="flex items-center gap-2 px-4 py-4 font-bold">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-background">
          H
        </span>
        {tCommon('appName')}
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-2">
        {groups.map((group) => (
          <div key={group.key} className="space-y-1">
            <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {t(`groups.${group.key}`)}
            </p>
            {group.items.map((item) => {
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
                        ? group.accent
                          ? ACTIVE[group.accent]
                          : NEUTRAL_ACTIVE
                        : 'hover:bg-muted hover:text-foreground before:bg-transparent',
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
