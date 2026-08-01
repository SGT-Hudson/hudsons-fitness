import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useNum } from '@/hooks/useNum';
import { formatDecimal } from '@/lib/number';
import { cn } from '@/lib/utils';

export interface EnergyBalanceData {
  /** `tdee_estimates.estimated_tdee_kcal` — the filter's expenditure estimate. */
  tdeeKcal: number;
  /** `tdee_estimates.avg_kcal_intake` — the intake the filter folded. */
  avgIntakeKcal: number;
  /** Derived by `estimatedBmr`; null when the profile is incomplete. */
  bmrKcal: number | null;
}

/**
 * Expenditure, intake and BMR as three bars normalized to the TDEE estimate —
 * the "why" behind the rate the hero reports. Props-in and hookless (beyond
 * i18n) so its Tier-2 test needs no Supabase mock; `ProgresoPage` owns the data.
 *
 * The card is not rendered at all without a TDEE estimate — there is nothing to
 * normalize against, and an empty frame is worse than no frame.
 */
export function EnergyBalanceCard({ data }: { data: EnergyBalanceData }) {
  const { t, i18n } = useTranslation('metricas');
  const num = useNum();
  const { tdeeKcal, avgIntakeKcal, bmrKcal } = data;

  const balance = Math.round(avgIntakeKcal - tdeeKcal);
  // Signed to no decimals: `+380` / `-510` / `0`, and a value that rounds to
  // `-0` is zero, so it shows no sign — handled natively by `formatDecimal`
  // rather than by hand (see `MeasurementHistoryPage.formatDeltaKg`).
  const signedBalance = formatDecimal(balance, { lang: i18n.language, digits: 0, signed: true });

  const rows: Array<{ id: string; label: string; value: number; muted: boolean }> = [
    { id: 'tdee', label: t('energyBalance.tdee'), value: tdeeKcal, muted: false },
    { id: 'intake', label: t('energyBalance.intake'), value: avgIntakeKcal, muted: false },
  ];
  if (bmrKcal != null) {
    rows.push({ id: 'bmr', label: t('energyBalance.bmr'), value: bmrKcal, muted: true });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="text-base">{t('energyBalance.title')}</CardTitle>
        <span
          data-testid="energy-balance"
          className="text-sm font-semibold tabular-nums text-accent-ink"
        >
          {signedBalance} {t('energyBalance.unit')}
        </span>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row) => {
          // `tdeeKcal` is the normalization base for every bar (including its
          // own). Guard division by a non-positive value — implausible for a
          // real estimate, but a NaN/Infinity width is worse than a flat bar.
          const pct = tdeeKcal > 0 ? Math.min(100, Math.max(0, (row.value / tdeeKcal) * 100)) : 0;
          return (
            <div key={row.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-2.5 text-xs">
              <span className="w-[104px] shrink-0 text-muted-foreground">{row.label}</span>
              <span className="h-1.5 min-w-0 overflow-hidden rounded-full bg-muted">
                <span
                  className={cn('block h-full rounded-full', row.muted ? 'bg-border' : 'bg-primary')}
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span
                data-testid={`energy-${row.id}`}
                className="shrink-0 text-right font-semibold tabular-nums"
              >
                {num.int(Math.round(row.value))}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
