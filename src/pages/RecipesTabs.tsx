import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export function RecipesTabs() {
  const { t } = useTranslation('nav');
  const tab = (active: boolean) =>
    cn('px-3 py-1.5 text-sm font-medium border-b-2',
      active ? 'border-nutri text-nutri' : 'border-transparent text-muted-foreground');
  return (
    <div className="flex gap-2 border-b">
      <NavLink to="/recipes" end className={({ isActive }) => tab(isActive)}>
        {t('recipes')}
      </NavLink>
      <NavLink to="/recipes/ingredients" className={({ isActive }) => tab(isActive)}>
        {t('ingredients')}
      </NavLink>
    </div>
  );
}
