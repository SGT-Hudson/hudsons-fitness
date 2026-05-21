import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { bottomNavItems, type Section } from './nav-config';
import { useActiveSection } from './useActiveSection';

const SECTIONS: Section[] = ['nutricion', 'entreno'];
const DOT: Record<Section, string> = { nutricion: 'bg-nutricion', entreno: 'bg-entreno' };
const TEXT: Record<Section, string> = { nutricion: 'text-nutricion', entreno: 'text-entreno' };

export function SectionSwitcher() {
  const { t } = useTranslation('nav');
  const navigate = useNavigate();
  const active = useActiveSection();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn('flex items-center gap-2 font-bold', TEXT[active])}
      >
        <span className={cn('h-3.5 w-3.5 rounded', DOT[active])} />
        {t(`section.${active}`)}
        <ChevronDown className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {SECTIONS.map((s) => (
          <DropdownMenuItem
            key={s}
            onSelect={() => navigate(bottomNavItems(s)[0].route)}
          >
            <span className={cn('h-3 w-3 rounded', DOT[s])} />
            {t(`section.${s}`)}
            {s === active && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
