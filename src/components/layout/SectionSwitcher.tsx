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
import { bottomNavItems, SECTION_I18N_KEY, type Section } from './nav-config';
import { useActiveSection } from './useActiveSection';

const SECTIONS: Section[] = ['nutri', 'gym'];
const DOT: Record<Section, string> = { nutri: 'bg-nutri', gym: 'bg-gym' };
const TEXT: Record<Section, string> = { nutri: 'text-nutri', gym: 'text-gym' };

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
        {t(`section.${SECTION_I18N_KEY[active]}`)}
        <ChevronDown className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {SECTIONS.map((s) => (
          <DropdownMenuItem
            key={s}
            onSelect={() => navigate(bottomNavItems(s)[0].route)}
          >
            <span className={cn('h-3 w-3 rounded', DOT[s])} />
            {t(`section.${SECTION_I18N_KEY[s]}`)}
            {s === active && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
