import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { NumberField } from '@/components/ui/NumberField';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useDecimalDraft } from '@/components/ui/useDecimalDraft';
import { useNum } from '@/hooks/useNum';
import { formatDate, type Locale } from '@/lib/dates';
import { cn } from '@/lib/utils';
import {
  ACTIVITY_LEVELS,
  computeFormulaTdee,
  computeKatchTdee,
  type ActivityKey,
  type TdeeSex,
} from '../formulas';

/**
 * R-37 — the calculator body, shared by both frames: the `/tdee` route (no
 * apply) and the phase editor's sheet (apply). It holds its own input state
 * and receives every server-derived value as a prop.
 *
 * The props-in shape is deliberate: a component that transitively imports
 * `@/lib/supabase` renders fine locally and fails in CI, where no env is
 * present. So the frames call the hooks; this file imports none.
 *
 * Editing an input NEVER writes back to the profile. That is the point of the
 * tool ("what if I weighed 78?"), and it keeps Settings as the single owner of
 * profile edits.
 */

export interface TdeeCalculatorData {
  sex: TdeeSex | null;
  ageYears: number | null;
  heightCm: number | null;
  weightKg: number | null;
  /** Latest reading with a body fat %, for the secondary Katch line. */
  bodyFat: { pct: number; measuredOn: string } | null;
  /** R-07's adaptive estimate, when the filter has produced one. */
  adaptiveTdeeKcal: number | null;
  adaptiveConfidence: 'low' | 'medium' | 'high' | null;
}

interface Props {
  data: TdeeCalculatorData;
  /**
   * Present only in the phase-editor frame. Receives the formula TDEE rounded
   * to whole kcal — the value written into `kcal_value`.
   */
  onApply?: (tdeeKcal: number) => void;
}

export function TdeeCalculator({ data, onApply }: Props) {
  const { t, i18n } = useTranslation('objetivos');
  const num = useNum();
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;

  const [sex, setSex] = useState<TdeeSex>(data.sex ?? 'male');
  const [ageYears, setAgeYears] = useState<number | null>(data.ageYears);
  const [heightCm, setHeightCm] = useState<number | null>(data.heightCm);
  const [weightKg, setWeightKg] = useState<number | null>(data.weightKg);
  // The lowest rung is the honest default: the 1.2-to-1.9 span is roughly
  // ±600 kcal of self-flattery, so the user opts up rather than down.
  const [activity, setActivity] = useState<ActivityKey>('sedentary');

  // `useDecimalDraft` keeps what the user typed (including a comma) visible
  // while committing a parsed number upward; a cleared field commits 0, which
  // `computeFormulaTdee` treats as "no answer".
  const age = useDecimalDraft(
    ageYears == null ? '' : String(ageYears),
    setAgeYears,
  );
  const height = useDecimalDraft(
    heightCm == null ? '' : String(heightCm),
    setHeightCm,
  );
  const weight = useDecimalDraft(
    weightKg == null ? '' : String(weightKg),
    setWeightKg,
  );

  function reset() {
    setSex(data.sex ?? 'male');
    setAgeYears(data.ageYears);
    setHeightCm(data.heightCm);
    setWeightKg(data.weightKg);
  }

  const result = computeFormulaTdee({
    sex,
    ageYears,
    heightCm,
    weightKg,
    activity,
  });
  const katch = computeKatchTdee({
    weightKg,
    bodyFatPct: data.bodyFat?.pct ?? null,
    activity,
  });

  const adaptive = data.adaptiveTdeeKcal;
  const diff =
    adaptive != null && result != null ? adaptive - result.tdeeKcal : null;
  const confidenceNote =
    data.adaptiveConfidence === 'low'
      ? t('tdee.adaptiveLow')
      : data.adaptiveConfidence === 'medium'
        ? t('tdee.adaptiveMedium')
        : null;

  return (
    <div className="flex flex-col gap-3 md:gap-3.5">
      <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
        {t('tdee.intro')}
      </p>

      {/* ── 1. Your data ── */}
      <Card className="space-y-3.5 p-3.5 md:p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">
            {t('tdee.yourData')}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={reset}
            data-testid="tdee-reset"
            className="h-8 text-[12px] text-muted-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {t('tdee.reset')}
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label id="tdee-sex-label">{t('tdee.sexLabel')}</Label>
          <SegmentedControl
            labelledBy="tdee-sex-label"
            value={sex}
            onChange={setSex}
            options={[
              { value: 'male' as const, label: t('tdee.sexMale') },
              { value: 'female' as const, label: t('tdee.sexFemale') },
              { value: 'other' as const, label: t('tdee.sexOther') },
            ]}
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <NumberField
            id="tdee-age"
            label={t('tdee.age')}
            suffix={t('tdee.ageUnit')}
            {...age}
          />
          <NumberField
            id="tdee-height"
            label={t('tdee.height')}
            suffix="cm"
            {...height}
          />
          <NumberField
            id="tdee-weight"
            label={t('tdee.weight')}
            suffix="kg"
            {...weight}
          />
        </div>

        <p className="text-[11.5px] leading-[1.45] text-muted-foreground">
          {t('tdee.dataHint')}
        </p>
      </Card>

      {/* ── 2. Activity level ── */}
      <Card className="space-y-2 p-3.5 md:p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">
          {t('tdee.activityLabel')}
        </p>
        <div
          role="radiogroup"
          aria-label={t('tdee.activityLabel')}
          className="flex flex-col gap-1.5"
        >
          {ACTIVITY_LEVELS.map((level) => {
            const on = level.key === activity;
            return (
              <button
                key={level.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setActivity(level.key)}
                className={cn(
                  'flex items-start gap-2.5 rounded-[12px] border px-3 py-2.5 text-left transition-colors',
                  on ? 'border-accent-line bg-accent-soft' : 'hover:bg-muted/60',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold">
                    {t(`tdee.activity.${level.key}`)}
                  </p>
                  <p className="text-[11.5px] leading-[1.4] text-muted-foreground">
                    {t(`tdee.activityDescription.${level.key}`)}
                  </p>
                </div>
                <span className="tnum shrink-0 pt-0.5 text-[11.5px] text-text-dim">
                  {t('tdee.multiplier', { n: level.multiplier })}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* ── 3. The result ── */}
      <Card className="space-y-2 p-3.5 md:p-4">
        {result == null ? (
          <p
            role="status"
            data-testid="tdee-incomplete"
            className="rounded-md bg-amber-soft px-3 py-2 text-xs leading-[1.45] text-amber-ink"
          >
            {t('tdee.incomplete')}
          </p>
        ) : (
          <>
            <p className="text-[11.5px] text-muted-foreground">
              {t('tdee.bmr')}{' '}
              <span
                className="tnum font-semibold text-foreground"
                data-testid="tdee-bmr"
              >
                {num.int(result.bmrKcal)}
              </span>{' '}
              {t('tdee.kcalUnit')}
            </p>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">
              {t('tdee.tdeeLabel')}
            </p>
            <p
              className="tnum text-[30px] font-bold leading-none"
              data-testid="tdee-result"
            >
              {num.int(result.tdeeKcal)}{' '}
              <span className="text-[15px] font-medium text-muted-foreground">
                {t('tdee.kcalUnit')}
              </span>
            </p>

            {katch != null && data.bodyFat != null && (
              <p
                className="text-[11.5px] leading-[1.45] text-muted-foreground"
                data-testid="tdee-katch"
              >
                {t('tdee.katch', { n: Math.round(katch.tdeeKcal) })}{' '}
                {t('tdee.katchNote', {
                  date: formatDate(data.bodyFat.measuredOn, 'd MMM yyyy', locale),
                })}
              </p>
            )}

            {onApply && (
              <div className="space-y-1 pt-1">
                <Button
                  type="button"
                  onClick={() => onApply(Math.round(result.tdeeKcal))}
                  data-testid="tdee-apply"
                  className="h-11 w-full"
                >
                  {t('tdee.apply', { n: Math.round(result.tdeeKcal) })}
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  {t('tdee.applyHint')}
                </p>
              </div>
            )}
          </>
        )}
      </Card>

      {/* ── The honesty block ── */}
      {adaptive != null ? (
        <Card className="space-y-1 p-3.5 md:p-4" data-testid="tdee-adaptive">
          <p className="text-[13px] font-semibold">
            {t('tdee.adaptiveTitle', { n: Math.round(adaptive) })}
          </p>
          {diff != null && (
            <p className="text-[11.5px] text-muted-foreground">
              {Math.round(diff) === 0
                ? t('tdee.adaptiveSame')
                : diff > 0
                  ? t('tdee.adaptiveAbove', { n: Math.round(diff) })
                  : t('tdee.adaptiveBelow', { n: Math.round(-diff) })}
            </p>
          )}
          <p className="text-[11.5px] leading-[1.45] text-muted-foreground">
            {t('tdee.adaptiveBody')}
          </p>
          {confidenceNote && (
            <p className="text-[11.5px] leading-[1.45] text-amber-ink">
              {confidenceNote}
            </p>
          )}
        </Card>
      ) : (
        <p
          className="text-[11.5px] leading-[1.45] text-muted-foreground"
          data-testid="tdee-no-adaptive"
        >
          {t('tdee.noAdaptive')}
        </p>
      )}
    </div>
  );
}
