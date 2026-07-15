import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { PhaseType } from '@/core/nutritionTone';
import { CHIP_TONE } from './PhaseChip';

const PHASES: PhaseType[] = ['cut', 'bulk', 'maintenance'];

const RING_TONE: Record<PhaseType, string> = {
  cut: 'ring-phase-cut',
  bulk: 'ring-phase-bulk',
  maintenance: 'ring-phase-maint',
};

interface Props {
  value: PhaseType | null;
  onChange: (phase: PhaseType | null) => void;
  className?: string;
}

/** Phase picker: the 3 phases + an explicit "no phase" choice. Shared: Plantillas save/editor and the Objetivos wave. */
export function PhasePicker({ value, onChange, className }: Props) {
  const { t } = useTranslation(['planning', 'objetivos']);
  return (
    <div
      role="radiogroup"
      aria-label={t('phase.pick', { ns: 'planning' })}
      className={cn('flex flex-wrap gap-2', className)}
    >
      {PHASES.map((phase) => {
        const checked = value === phase;
        return (
          <button
            key={phase}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(phase)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors',
              CHIP_TONE[phase],
              checked ? cn('ring-2 ring-offset-1 ring-offset-background', RING_TONE[phase]) : 'opacity-60',
            )}
          >
            {t(`phases.type.${phase}`, { ns: 'objetivos' })}
          </button>
        );
      })}
      <button
        type="button"
        role="radio"
        aria-checked={value === null}
        onClick={() => onChange(null)}
        title={t('phase.noneHint', { ns: 'planning' })}
        className={cn(
          'rounded-full border border-border bg-muted px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors',
          value === null
            ? 'ring-2 ring-ring ring-offset-1 ring-offset-background'
            : 'opacity-60',
        )}
      >
        {t('phase.none', { ns: 'planning' })}
      </button>
    </div>
  );
}
