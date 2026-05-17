import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { roundMacro, type Macros } from '@/features/recipes/macros';

/** Which protein basis the active target was computed on (D-B1). */
export type ProteinBasis = 'lean' | 'fallback';

interface Props {
  totals: Macros;
  targets?: Macros;
  /** Set only when `targets` is present — labels the active protein basis. */
  proteinBasis?: ProteinBasis;
}

function Stat({
  label,
  value,
  target,
  suffix,
  note,
}: {
  label: string;
  value: number;
  target?: number;
  suffix: string;
  note?: string;
}) {
  const pct = target != null && target > 0 ? (value / target) * 100 : null;

  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold tabular-nums leading-tight">
        {roundMacro(value)}
        {target != null && (
          <span className="text-sm font-normal text-muted-foreground">
            /{roundMacro(target)}
          </span>
        )}
        <span className="text-sm font-normal text-muted-foreground ml-1">{suffix}</span>
      </div>
      {note && <div className="text-[11px] text-muted-foreground leading-tight">{note}</div>}
      {pct != null && (
        <div className="h-1 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              pct > 100 ? 'bg-destructive' : 'bg-primary',
            )}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function DayTotalsCard({ totals, targets, proteinBasis }: Props) {
  const { t } = useTranslation('diario');
  const proteinNote =
    targets && proteinBasis
      ? proteinBasis === 'lean'
        ? t('totals.proteinBasisLean')
        : t('totals.proteinBasisFallback')
      : undefined;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('totals.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <Stat
            label={t('totals.kcal')}
            value={totals.kcal}
            target={targets?.kcal}
            suffix="kcal"
          />
          <Stat
            label={t('totals.protein')}
            value={totals.proteinG}
            target={targets?.proteinG}
            suffix="g"
            note={proteinNote}
          />
          <Stat
            label={t('totals.carbs')}
            value={totals.carbsG}
            target={targets?.carbsG}
            suffix="g"
          />
          <Stat
            label={t('totals.fat')}
            value={totals.fatG}
            target={targets?.fatG}
            suffix="g"
          />
          <Stat
            label={t('totals.fiber')}
            value={totals.fiberG}
            target={targets?.fiberG}
            suffix="g"
          />
        </div>
        {!targets && (
          <p className="mt-4 text-xs text-muted-foreground">{t('totals.targetsHint')}</p>
        )}
      </CardContent>
    </Card>
  );
}
