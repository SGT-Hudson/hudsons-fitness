import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { MeasurementDialog } from '@/features/measurements/components/MeasurementDialog';
import { deltaTone, type DeltaTone, type PhaseType } from '@/features/measurements/trend';
import { formatDate, isoDate, type Locale } from '@/lib/dates';
import type { BodyMeasurement } from '@/features/measurements/api';

const TONE_CLASS: Record<DeltaTone, string> = {
  good: 'text-tone-good',
  bad: 'text-destructive',
  neutral: 'text-muted-foreground',
};

interface Props {
  latest: BodyMeasurement | null | undefined;
  /** Smoothed kg/week rate; null when not derivable. */
  rate: number | null;
  /** Active phase — colours the weekly-delta chip (down-in-cut = good, etc.). */
  phaseType?: PhaseType;
}

function signedRate(n: number): string {
  const v = Math.abs(n).toFixed(2);
  if (n > 0) return `↑ ${v}`;
  if (n < 0) return `↓ ${v}`;
  return `· ${v}`;
}

/**
 * Web right-rail "Cuerpo" card (R-33 wave 2, task 6): latest weight + weekly
 * delta, with a button that opens the shared measurement dialog — the same
 * add-measurement flow Progreso uses (no new form).
 */
export function BodyQuickMeasureCard({ latest, rate, phaseType }: Props) {
  const { t, i18n } = useTranslation('diario');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;
  const [open, setOpen] = useState(false);
  const tone: DeltaTone =
    rate == null ? 'neutral' : deltaTone('weight', Math.sign(rate), phaseType);

  return (
    <div className="flex flex-col gap-2.5 rounded-[14px] border bg-card p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{t('body.title')}</span>
        {latest?.measured_on && (
          <span className="text-[11px] text-text-dim tabular-nums">
            {t('body.lastMeasured', {
              date: formatDate(latest.measured_on, 'd MMM', locale),
            })}
          </span>
        )}
      </div>

      {latest?.weight_kg != null ? (
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums tracking-tight">
            {latest.weight_kg}
          </span>
          <span className="text-xs text-text-dim">kg</span>
          {rate != null && (
            <span
              className={cn(
                'ml-auto rounded-full border border-border px-2 py-0.5 text-[10.5px] font-semibold tabular-nums',
                TONE_CLASS[tone],
              )}
            >
              {signedRate(rate)} {t('body.rateUnit')}
            </span>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t('body.empty')}</p>
      )}

      <Button
        variant="outline"
        className="h-9 justify-center border-accent-line bg-accent-soft text-accent-ink hover:bg-accent-soft hover:text-accent-ink"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-4 w-4" />
        {t('body.register')}
      </Button>

      <MeasurementDialog
        open={open}
        onOpenChange={setOpen}
        defaultDate={isoDate()}
        prefillFrom={latest ?? null}
      />
    </div>
  );
}
