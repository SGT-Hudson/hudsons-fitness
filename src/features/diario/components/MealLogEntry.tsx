import { useTranslation } from 'react-i18next';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { computeMealLogMacros, describeMealLog } from '../macros';
import type { MealLogWithJoins } from '../api';
import { roundMacro } from '@/features/recipes/macros';

interface Props {
  log: MealLogWithJoins;
  onEdit: (log: MealLogWithJoins) => void;
}

export function MealLogEntry({ log, onEdit }: Props) {
  const { t } = useTranslation('diario');
  const macros = computeMealLogMacros(log);
  const desc = describeMealLog(log);
  // R-01: `recipes.deleted_at` is gone. Anon-owned (creator-hidden)
  // recipes still resolve via the open pool SELECT — no "recipe deleted"
  // distinction surfaces here anymore; historical entries render normally
  // (the never-orphan invariant).

  return (
    <li className="flex items-start gap-3 px-4 py-3 hover:bg-accent/40 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">{desc.title}</span>
          {desc.detail && <span className="text-xs text-muted-foreground">· {desc.detail}</span>}
          {log.from_plan && (
            <Badge variant="secondary">{t('entry.fromPlan')}</Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums mt-0.5 flex-wrap">
          <span>{roundMacro(macros.kcal)} kcal</span>
          <span>P {roundMacro(macros.proteinG)}g</span>
          <span>C {roundMacro(macros.carbsG)}g</span>
          <span>F {roundMacro(macros.fatG)}g</span>
          {macros.fiberG > 0 && <span>Fib {roundMacro(macros.fiberG)}g</span>}
        </div>
        {log.notes && (
          <p className="text-xs text-muted-foreground mt-1 border-l-2 border-muted pl-2">
            {log.notes}
          </p>
        )}
      </div>
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
