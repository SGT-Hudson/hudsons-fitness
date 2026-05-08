import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { roundMacro, type Macros } from '@/features/recipes/macros';

interface Props {
  totals: Macros;
}

function Stat({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">
        {roundMacro(value)}
        <span className="text-sm font-normal text-muted-foreground ml-1">{suffix}</span>
      </div>
    </div>
  );
}

export function DayTotalsCard({ totals }: Props) {
  const { t } = useTranslation('diario');
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('totals.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <Stat label={t('totals.kcal')} value={totals.kcal} suffix="kcal" />
          <Stat label={t('totals.protein')} value={totals.proteinG} suffix="g" />
          <Stat label={t('totals.carbs')} value={totals.carbsG} suffix="g" />
          <Stat label={t('totals.fat')} value={totals.fatG} suffix="g" />
          <Stat label={t('totals.fiber')} value={totals.fiberG} suffix="g" />
        </div>
        <p className="mt-4 text-xs text-muted-foreground">{t('totals.targetsHint')}</p>
      </CardContent>
    </Card>
  );
}
