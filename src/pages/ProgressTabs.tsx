import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export function ProgressTabs() {
  const { t } = useTranslation('nav');
  const { t: tObj } = useTranslation('objetivos');
  const tab = (active: boolean) =>
    cn('px-3 py-1.5 text-sm font-medium border-b-2',
      active ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground');
  return (
    <div className="flex gap-2 border-b">
      <NavLink to="/progress" end className={({ isActive }) => tab(isActive)}>
        {t('progress')}
      </NavLink>
      <NavLink to="/progress/goals" className={({ isActive }) => tab(isActive)}>
        {tObj('pageTitle')}
      </NavLink>
    </div>
  );
}
