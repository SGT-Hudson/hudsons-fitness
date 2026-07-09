import { useState } from 'react';
import { Link, NavLink, useMatch } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/features/auth/AuthProvider';
import { useActivePhase } from '@/features/phases/hooks';
import { SIDEBAR_GROUPS, type NavItem, type Section } from './nav-config';

const STORAGE_KEY = 'hf-sidebar-collapsed';

const ACTIVE_STYLES: Record<Section, { row: string; bar: string }> = {
  nutri: { row: 'bg-nutri-soft text-nutri-ink', bar: 'before:bg-nutri' },
  gym: { row: 'bg-gym-soft text-gym-ink', bar: 'before:bg-gym' },
};

function SidebarItem({
  item,
  accent,
  collapsed,
}: {
  item: NavItem;
  accent: Section | null;
  collapsed: boolean;
}) {
  const { t } = useTranslation('nav');
  const active = accent ? ACTIVE_STYLES[accent] : { row: 'bg-muted text-foreground', bar: '' };
  const match = useMatch({
    path: item.route,
    end: item.route === '/progress' || item.route === '/recipes',
  });
  const isActive = match !== null;
  const link = (
    <NavLink
      to={item.route}
      end={item.route === '/progress' || item.route === '/recipes'}
      aria-label={t(item.key)}
      className={cn(
        collapsed
          ? 'grid size-10 place-items-center self-center rounded-[10px]'
          : 'relative flex h-9 items-center gap-3 rounded-[10px] px-3 text-[13.5px]',
        isActive
          ? cn(
              active.row,
              'font-medium',
              !collapsed &&
                accent && [
                  'before:absolute before:-left-2.5 before:top-2 before:bottom-2',
                  'before:w-[3px] before:rounded-full',
                  active.bar,
                ],
            )
          : 'text-muted-foreground hover:bg-muted/60',
      )}
    >
      <item.icon className="size-[17px] shrink-0" />
      {!collapsed && <span className="truncate">{t(item.key)}</span>}
    </NavLink>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{t(item.key)}</TooltipContent>
    </Tooltip>
  );
}

export function AppSidebar() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: phase } = useActivePhase();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(STORAGE_KEY) === '1');

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  };

  const email = user?.email ?? '';
  const initial = (email[0] ?? '?').toUpperCase();

  return (
    <TooltipProvider delayDuration={150}>
      <aside
        className={cn(
          'hidden shrink-0 flex-col border-r bg-card transition-[width,padding] duration-200',
          'md:sticky md:top-0 md:flex md:h-dvh',
          collapsed ? 'w-[60px] px-2 py-[18px]' : 'w-[232px] px-3.5 py-[18px]',
        )}
      >
        <div className={cn('flex items-center gap-2.5', collapsed && 'flex-col')}>
          <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-foreground text-[13px] font-bold tracking-[-0.04em] text-background">
            HF
          </div>
          {!collapsed && (
            <span className="flex-1 truncate text-[13.5px] font-semibold">
              {t('common:appName')}
            </span>
          )}
          <button
            type="button"
            aria-label={collapsed ? t('nav:sidebar.expand') : t('nav:sidebar.collapse')}
            onClick={toggle}
            className="grid size-6 place-items-center rounded-md text-text-dim hover:bg-muted"
          >
            <ChevronLeft className={cn('size-3.5 transition-transform', collapsed && 'rotate-180')} />
          </button>
        </div>

        <nav className="mt-4 flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {SIDEBAR_GROUPS.map((group, gi) => (
            <div key={group.key} className="flex flex-col gap-0.5">
              {collapsed ? (
                gi > 0 && <div className="mx-auto my-1.5 h-px w-6 bg-border" />
              ) : (
                <div className="px-3 pb-1.5 pt-2.5 text-[11px] font-medium uppercase tracking-[0.04em] text-text-dim">
                  {t(`nav:groups.${group.key}`)}
                </div>
              )}
              {group.items.map((item) => (
                <SidebarItem key={item.key} item={item} accent={group.accent} collapsed={collapsed} />
              ))}
            </div>
          ))}
        </nav>

        <div className={cn('mt-2 flex items-center gap-2.5 border-t pt-2.5', collapsed && 'flex-col')}>
          <div className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
            {initial}
          </div>
          {!collapsed && (
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-[12.5px] font-medium">{email}</span>
              {phase && (
                <span className="truncate text-[10.5px] text-text-dim">
                  {t(`objetivos:phases.type.${phase.phase_type}`)}
                </span>
              )}
            </div>
          )}
          <Link
            to="/settings"
            aria-label={t('nav:settings')}
            className="grid size-7 shrink-0 place-items-center rounded-md text-text-dim hover:bg-muted"
          >
            <Settings className="size-[15px]" />
          </Link>
        </div>
      </aside>
    </TooltipProvider>
  );
}
