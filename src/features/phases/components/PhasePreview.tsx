import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { PhaseChip } from '@/components/ui/PhaseChip';
import { useNum } from '@/hooks/useNum';
import { cn } from '@/lib/utils';
import type { PhaseType } from '@/core/nutritionTone';
import { computeDraftTargets } from '../targets';
import type { PhaseDraft } from './PhaseEditorForm';

/** Header tint — the phase colour is IDENTITY (wave-8 colour rule): tint the
 *  preview's cap, not the whole card, and never with the section accent. */
const HEADER_TONE: Record<PhaseType, string> = {
  cut: 'bg-phase-cut-soft border-phase-cut-line',
  bulk: 'bg-phase-bulk-soft border-phase-bulk-line',
  maintenance: 'bg-phase-maint-soft border-phase-maint-line',
};

const INK_TONE: Record<PhaseType, string> = {
  cut: 'text-phase-cut-ink',
  bulk: 'text-phase-bulk-ink',
  maintenance: 'text-phase-maint-ink',
};

interface Props {
  draft: PhaseDraft;
  /** Latest scale weight — without one there is genuinely nothing to derive. */
  weightKg?: number | null;
  bodyFatPct?: number | null;
  estimatedTdeeKcal?: number | null;
}

/**
 * The live preview (B2): what this phase's DAILY TARGETS will be, updating as
 * the user types. Everything numeric is derived through the real macro maths
 * (`computeDraftTargets` → `computeDailyMacroTargets`) — never the canvas's
 * fixture arithmetic. `draft.fat_pct_of_kcal` arrives already as the DB
 * fraction (the form ran `pctToFraction`); a half-typed field arrives as
 * `null`, and a `null` anywhere means NO numbers — a hint, never zeros.
 *
 * The calorie-split bar's denominator is the SUM of the three macro calories,
 * not the kcal target: when the carb remainder clips at 0 g the segments must
 * still add up to 100 %, or the bar lies.
 */
export function PhasePreview({ draft, weightKg, bodyFatPct, estimatedTdeeKcal }: Props) {
  const { t } = useTranslation('objetivos');
  const num = useNum();

  const phaseType = draft.phase_type as PhaseType;
  const complete =
    draft.kcal_value != null &&
    draft.protein_g_per_kg != null &&
    draft.fat_pct_of_kcal != null &&
    draft.fiber_value != null;

  const targets =
    weightKg != null && complete
      ? computeDraftTargets(draft, weightKg, bodyFatPct, estimatedTdeeKcal)
      : null;

  const hint =
    targets != null
      ? null
      : weightKg == null
        ? t('phases.hero.needsWeight')
        : !complete
          ? t('phases.preview.incomplete')
          : t('phases.hero.needsTdee');

  const split =
    targets == null
      ? []
      : [
          { key: 'protein', kcal: targets.proteinG * 4, bar: 'bg-macro-p' },
          { key: 'carbs', kcal: targets.carbsG * 4, bar: 'bg-macro-c' },
          { key: 'fat', kcal: targets.fatG * 9, bar: 'bg-macro-g' },
        ];
  const splitTotal = split.reduce((sum, s) => sum + s.kcal, 0);

  const grid =
    targets == null
      ? []
      : [
          { key: 'protein', grams: targets.proteinG },
          { key: 'carbs', grams: targets.carbsG },
          { key: 'fat', grams: targets.fatG },
          { key: 'fiber', grams: targets.fiberG },
        ];

  return (
    <Card
      role="region"
      aria-label={t('phases.preview.title')}
      className="overflow-hidden p-0"
    >
      {/* ── The tinted cap: identity + the headline number ── */}
      <div className={cn('border-b px-3.5 py-3 md:px-4', HEADER_TONE[phaseType])}>
        <div className="flex items-center gap-2">
          <PhaseChip phase={phaseType} />
          <span className="min-w-0 truncate text-[12.5px] font-semibold">
            {draft.name.trim() === '' ? (
              <span className="font-normal text-text-dim">
                {t('phases.form.namePlaceholder')}
              </span>
            ) : (
              draft.name
            )}
          </span>
          <span
            className={cn(
              'ml-auto shrink-0 text-[10px] uppercase tracking-[0.05em]',
              INK_TONE[phaseType],
            )}
          >
            {t('phases.preview.title')}
          </span>
        </div>

        {targets != null && (
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span
              data-testid="preview-kcal"
              className="tnum text-[26px] font-semibold leading-none tracking-[-0.03em]"
            >
              {targets.kcal}
            </span>
            <span className="text-xs text-muted-foreground">
              {t('phases.hero.kcalPerDay')}
            </span>
            {draft.kcal_mode === 'tdee_delta' && draft.kcal_value != null && (
              <span className="tnum ml-auto inline-flex h-[20px] items-center rounded-full border bg-card px-2 text-[10px] text-muted-foreground">
                {t('phases.summary.tdeePrefix')} {draft.kcal_value > 0 ? '+' : ''}
                {draft.kcal_value}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── The derived split — or the honest reason there is none ── */}
      <div className="px-3.5 py-3 md:px-4">
        {targets == null ? (
          <p
            role="status"
            className="rounded-md bg-amber-soft px-3 py-2 text-xs leading-[1.45] text-amber-ink"
          >
            {hint}
          </p>
        ) : (
          <>
            <div className="flex h-3 overflow-hidden rounded-[6px]">
              {split.map((s) => (
                <div
                  key={s.key}
                  className={s.bar}
                  style={{ width: `${splitTotal > 0 ? (s.kcal / splitTotal) * 100 : 0}%` }}
                />
              ))}
            </div>
            <div className="tnum mt-1.5 flex justify-between text-[10.5px] text-muted-foreground">
              {split.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1">
                  <span className={cn('size-[6px] rounded-full', s.bar)} aria-hidden="true" />
                  {t(`phases.preview.letter.${s.key}`)}{' '}
                  {splitTotal > 0 ? Math.round((s.kcal / splitTotal) * 100) : 0} %
                </span>
              ))}
            </div>

            <dl className="mt-3 grid grid-cols-4 gap-x-3 gap-y-0.5">
              {grid.map((m) => (
                <div key={m.key} className="min-w-0">
                  <dt className="text-[10px] uppercase tracking-[0.05em] text-text-dim">
                    {t(`phases.hero.${m.key}`)}
                  </dt>
                  <dd className="tnum mt-0.5 text-[13px] font-semibold">{num.qty(m.grams)} g</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </div>
    </Card>
  );
}
