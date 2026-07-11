import { cn } from '@/lib/utils';
import type { TemplatePhase } from '../api';

const PHASE_DOT: Record<TemplatePhase, string> = {
  cut: 'bg-phase-cut',
  bulk: 'bg-phase-bulk',
  maintenance: 'bg-phase-maint',
};

interface Props {
  mealCount: number;
  filled: boolean[][]; // [dayOfWeek 0..6][mealIndex] → has a slot
  phase?: TemplatePhase | null;
  className?: string;
}

/** Pure 7×(mealCount) dot-grid preview of a template's week. No data access. */
export function TemplateDotGrid({ mealCount, filled, phase, className }: Props) {
  const onTone = phase ? PHASE_DOT[phase] : 'bg-muted-foreground/50';
  return (
    <div className={cn('grid grid-cols-7 gap-1', className)}>
      {Array.from({ length: mealCount }, (_, mealIndex) =>
        Array.from({ length: 7 }, (_, day) => {
          const on = filled[day]?.[mealIndex] ?? false;
          return (
            <span
              key={`${day}-${mealIndex}`}
              data-dot={on ? 'on' : 'off'}
              data-day={day}
              data-meal={mealIndex}
              className={cn('h-1.5 w-1.5 rounded-xs', on ? onTone : 'bg-muted')}
            />
          );
        }),
      )}
    </div>
  );
}
