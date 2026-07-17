import { useTranslation } from 'react-i18next';
import { CalendarDays, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { computeMealLogMacros, describeMealLog } from '../macros';
import type { MealLogWithJoins } from '../api';
import { roundMacro } from '@/features/recipes/macros';
import { useNum } from '@/hooks/useNum';

interface Props {
  log: MealLogWithJoins;
  onEdit: (log: MealLogWithJoins) => void;
}

export function MealLogEntry({ log, onEdit }: Props) {
  const { t, i18n } = useTranslation('diario');
  const num = useNum();
  const macros = computeMealLogMacros(log);
  const desc = describeMealLog(log, i18n.language);
  // R-01: `recipes.deleted_at` is gone. Anon-owned (creator-hidden)
  // recipes still resolve via the open pool SELECT — no "recipe deleted"
  // distinction surfaces here anymore; historical entries render normally
  // (the never-orphan invariant).

  return (
    <li className="flex items-center gap-3 px-3.5 py-2 hover:bg-muted/40 transition-colors md:grid md:grid-cols-[1fr_auto_auto_auto] md:gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-medium truncate">{desc.title}</span>
          {log.from_plan && (
            <Badge
              variant="accent"
              className="h-[18px] shrink-0 gap-1 px-[7px] text-[9.5px]"
            >
              <CalendarDays className="hidden h-[9px] w-[9px] md:block" aria-hidden="true" />
              <span className="md:hidden">{t('entry.planShort')}</span>
              <span className="hidden md:inline">{t('entry.fromPlan')}</span>
            </Badge>
          )}
        </div>
        {desc.detail && (
          <div className="text-[11px] text-muted-foreground mt-0.5">{desc.detail}</div>
        )}
        {log.notes && (
          <p className="text-xs text-muted-foreground mt-1 border-l-2 border-muted pl-2">
            {log.notes}
          </p>
        )}
      </div>
      <div className="hidden items-center gap-3.5 text-[11.5px] text-muted-foreground tabular-nums md:flex">
        <span>P <b className="font-medium text-foreground">{num.qty(roundMacro(macros.proteinG))}</b></span>
        <span>C <b className="font-medium text-foreground">{num.qty(roundMacro(macros.carbsG))}</b></span>
        <span>F <b className="font-medium text-foreground">{num.qty(roundMacro(macros.fatG))}</b></span>
      </div>
      <span className="shrink-0 text-xs tabular-nums md:min-w-[48px] md:text-right md:text-[13px]">
        <span className="md:font-medium md:text-foreground">{num.qty(roundMacro(macros.kcal))}</span>{' '}
        <span className="text-muted-foreground">kcal</span>
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('entry.edit')}
        onClick={() => onEdit(log)}
      >
        <Pencil className="h-4 w-4" />
      </Button>
    </li>
  );
}
