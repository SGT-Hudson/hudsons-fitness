import { useTranslation } from 'react-i18next';
import { Flame, TrendingUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PhaseType } from '@/core/nutritionTone';

const CHIP_TONE: Record<PhaseType, string> = {
  cut: 'bg-phase-cut-soft text-phase-cut-ink border-phase-cut-line',
  bulk: 'bg-phase-bulk-soft text-phase-bulk-ink border-phase-bulk-line',
  maintenance: 'bg-phase-maint-soft text-phase-maint-ink border-phase-maint-line',
};

const ICON_TONE: Record<PhaseType, string> = {
  cut: 'text-phase-cut',
  bulk: 'text-phase-bulk',
  maintenance: 'text-phase-maint',
};

const ICON: Record<PhaseType, typeof Flame> = {
  cut: Flame,
  bulk: TrendingUp,
  maintenance: Minus,
};

interface Props {
  phase: PhaseType;
  className?: string;
}

/** Phase-tinted chip. Shared: the planner header, plus the Plantillas and Objetivos waves. */
export function PhaseChip({ phase, className }: Props) {
  const { t } = useTranslation('objetivos');
  const Icon = ICON[phase];
  return (
    <span
      className={cn(
        'inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[10.5px] font-medium',
        CHIP_TONE[phase],
        className,
      )}
    >
      <Icon className={cn('h-3 w-3', ICON_TONE[phase])} aria-hidden="true" />
      {t(`phases.type.${phase}`)}
    </span>
  );
}
