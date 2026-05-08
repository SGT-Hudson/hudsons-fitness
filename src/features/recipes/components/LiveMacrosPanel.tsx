import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { computeRecipeMacros, roundMacro, type RecipeRowMacrosInput } from '../macros';

interface Props {
  servings: number;
  rows: RecipeRowMacrosInput[];
}

function MacroLine({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="font-semibold tabular-nums">
        {roundMacro(value)}
        <span className="text-xs font-normal text-muted-foreground ml-1">{suffix}</span>
      </span>
    </div>
  );
}

export function LiveMacrosPanel({ servings, rows }: Props) {
  const { t } = useTranslation('recetas');
  const { total, perServing } = computeRecipeMacros({ servings, rows });
  const dual = servings !== 1;

  return (
    <Card className="sticky top-20">
      <CardHeader>
        <CardTitle className="text-lg">{t('macros.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {dual ? (
          <div className="grid grid-cols-2 gap-4">
            <Column title={t('macros.total')} macros={total} />
            <Column title={t('macros.perServing')} macros={perServing} />
          </div>
        ) : (
          <Column title={t('macros.label')} macros={total} />
        )}
      </CardContent>
    </Card>
  );
}

function Column({ title, macros }: { title: string; macros: ReturnType<typeof computeRecipeMacros>['total'] }) {
  const { t } = useTranslation('recetas');
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <MacroLine label={t('macros.kcal')} value={macros.kcal} suffix="kcal" />
      <MacroLine label={t('macros.protein')} value={macros.proteinG} suffix="g" />
      <MacroLine label={t('macros.carbs')} value={macros.carbsG} suffix="g" />
      <MacroLine label={t('macros.fat')} value={macros.fatG} suffix="g" />
      <MacroLine label={t('macros.fiber')} value={macros.fiberG} suffix="g" />
    </div>
  );
}
