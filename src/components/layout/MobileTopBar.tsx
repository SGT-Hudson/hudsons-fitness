import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Dumbbell, Leaf } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActiveSection } from './useActiveSection';

/** Icon-button linking to the other section's root (spec §4.1). */
export function SectionSwitchButton() {
  const { t } = useTranslation('nav');
  const section = useActiveSection();
  const target = section === 'nutri' ? 'gym' : 'nutri';
  const Icon = target === 'gym' ? Dumbbell : Leaf;
  return (
    <Link
      to={target === 'gym' ? '/training' : '/diary'}
      aria-label={t('switchSection')}
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-[12px] border bg-card',
        target === 'gym' ? 'text-gym' : 'text-nutri',
      )}
    >
      <Icon className="size-4" />
    </Link>
  );
}

interface MobileTopBarProps {
  title: string;
  subtitle?: string;
}

/** Root-screen mobile header (canvas MobileTopBar). Hidden at md+. */
export function MobileTopBar({ title, subtitle }: MobileTopBarProps) {
  return (
    <header className="flex items-center gap-3 border-b bg-card px-5 pb-3 pt-2 md:hidden">
      <div className="flex min-w-0 flex-1 flex-col leading-[1.15]">
        <h1 className="truncate text-title-screen">{title}</h1>
        {subtitle && <span className="tnum text-xs text-text-dim">{subtitle}</span>}
      </div>
      <SectionSwitchButton />
    </header>
  );
}
