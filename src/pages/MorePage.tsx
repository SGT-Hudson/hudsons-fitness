import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Apple, Calculator, ChevronRight, LayoutTemplate, Settings, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { PageShell } from '@/components/layout/PageShell';
import { useAuth } from '@/features/auth/AuthProvider';
import { useActivePhase } from '@/features/phases/hooks';

const ROWS = [
  { key: 'ingredients', route: '/recipes/ingredients', icon: Apple, chip: 'bg-nutri-soft text-nutri-ink' },
  { key: 'templates', route: '/templates', icon: LayoutTemplate, chip: 'bg-gym-soft text-gym-ink' },
  { key: 'goals', route: '/progress/goals', icon: Target, chip: 'bg-amber-soft text-amber-ink' },
  { key: 'tdee', route: '/tdee', icon: Calculator, chip: 'bg-accent-soft text-accent-ink' },
  { key: 'settings', route: '/settings', icon: Settings, chip: 'bg-muted text-muted-foreground' },
] as const;

export function MorePage() {
  const { t } = useTranslation('nav');
  const { user } = useAuth();
  const { data: phase } = useActivePhase();
  const email = user?.email ?? '';
  const initial = (email[0] ?? '?').toUpperCase();

  return (
    <PageShell title={t('more')}>
      <div className="flex flex-col gap-5">
        <Link
          to="/settings/profile"
          className="flex items-center gap-[13px] rounded-[14px] border border-accent-line bg-accent-soft p-3.5"
        >
          <div className="grid size-[46px] shrink-0 place-items-center rounded-full bg-accent text-[19px] font-bold text-accent-foreground">
            {initial}
          </div>
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-[14.5px] font-semibold">{email}</span>
            {phase && (
              <span className="truncate text-[11.5px] text-muted-foreground">
                {t(`objetivos:phases.type.${phase.phase_type}`)}
              </span>
            )}
          </div>
          <ChevronRight className="size-4 shrink-0 text-text-dim" />
        </Link>

        <Card className="overflow-hidden p-0">
          {ROWS.map((row, i) => (
            <Link
              key={row.key}
              to={row.route}
              className={cn(
                'flex min-h-[50px] items-center gap-[11px] px-[13px] py-2.5',
                i > 0 && 'border-t',
              )}
            >
              <div className={cn('grid size-[30px] shrink-0 place-items-center rounded-[9px]', row.chip)}>
                <row.icon className="size-4" />
              </div>
              <span className="flex-1 text-[13px] font-medium">{t(row.key)}</span>
              <ChevronRight className="size-[15px] text-text-dim" />
            </Link>
          ))}
        </Card>
      </div>
    </PageShell>
  );
}
