import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RestTimerView } from './useRestTimer';

function fmt(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface Props {
  timer: RestTimerView;
  compact?: boolean;
  onSkip: () => void;
  onAdjust?: (deltaSeconds: number) => void;
}

/** Rest display: countdown (green), count-up stopwatch (muted, warm-ups /
 *  null rest), or over-time. `compact` is the slim band shown after recording
 *  while the rest keeps running (spec §2 frame 7). */
export function RestTimerBand({ timer, compact, onSkip, onAdjust }: Props) {
  const { t } = useTranslation('entrenamiento');
  const label = timer.isCountUp
    ? `${fmt(timer.elapsedSeconds)} ↑`
    : timer.overSeconds > 0
      ? `+${fmt(timer.overSeconds)}`
      : fmt(timer.remainingSeconds);

  return (
    <div
      className={cn(
        'rounded-lg border text-center',
        timer.isCountUp ? 'border-muted bg-muted/30' : 'border-primary/50 bg-primary/10',
        compact ? 'flex items-center justify-between px-3 py-2' : 'p-3',
      )}
    >
      <div className={cn('uppercase tracking-wide text-muted-foreground', compact ? 'text-[10px]' : 'text-[10px]')}>
        {timer.isCountUp ? t('runner.restNoTarget') : t('runner.rest')}
      </div>
      <div className={cn('font-bold tabular-nums', compact ? 'text-base' : 'text-3xl text-primary')}>{label}</div>
      <div className={cn('flex justify-center gap-2', compact ? '' : 'mt-2')}>
        {onAdjust && !timer.isCountUp && (
          <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={() => onAdjust(-15)}>−15</Button>
        )}
        <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={onSkip}>{t('runner.skipRest')}</Button>
        {onAdjust && !timer.isCountUp && (
          <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={() => onAdjust(15)}>+15</Button>
        )}
      </div>
    </div>
  );
}
