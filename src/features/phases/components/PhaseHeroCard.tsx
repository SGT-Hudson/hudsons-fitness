import { useTranslation } from 'react-i18next';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PhaseChip } from '@/components/ui/PhaseChip';
import { useDailyTarget } from '@/features/planning/useDailyTarget';
import { fractionToPct } from '@/lib/macros';
import { useNum } from '@/hooks/useNum';
import { daysBetween, formatDate, isoDate, type Locale } from '@/lib/dates';
import type { PhaseType } from '@/core/nutritionTone';
import { useActivePhase } from '../hooks';
import type { Phase } from '../api';

interface Props {
  /** Opens the phase editor on the active phase. */
  onEdit: (phase: Phase) => void;
}

/**
 * The active phase, as the page's headline.
 *
 * Two colour systems meet here and they mean different things: the **section
 * accent** (nutri green) says "this is the live one" — the status chip, the
 * elapsed bar — while the **phase colour** is pure identity (the type chip).
 * Tinting the whole hero raspberry would conflate the two.
 *
 * The daily targets are NOT derived here: `computePhaseTargets` owns the macro
 * maths and `useDailyTarget` owns its wiring (weight, body fat, TDEE). This
 * component only paints what they return — including the case where they return
 * nothing, which is a real state and not a zero (see below).
 *
 * Not built (deliberate): the canvas's start/actual/goal weight track. The
 * `/progress` hero already ships that bar from the same derived numbers; a
 * second copy would be a second place to get it wrong.
 */
export function PhaseHeroCard({ onEdit }: Props) {
  const { t, i18n } = useTranslation('objetivos');
  const num = useNum();
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;
  const activePhase = useActivePhase();
  const { targets, weightKg, proteinBasis } = useDailyTarget();

  const phase = activePhase.data;
  if (!phase) return null;

  const today = isoDate();

  // Pure calendar maths (not macro maths): where we are inside the phase.
  const dayIndex = Math.max(0, daysBetween(phase.start_date, today));
  const weekOf = Math.floor(dayIndex / 7) + 1;
  const totalDays = phase.end_date
    ? daysBetween(phase.start_date, phase.end_date) + 1
    : null;
  const totalWeeks = totalDays != null ? Math.max(1, Math.ceil(totalDays / 7)) : null;
  const weeksLeft = phase.end_date
    ? Math.ceil(Math.max(0, daysBetween(today, phase.end_date)) / 7)
    : null;
  const elapsedPct =
    totalDays != null && totalDays > 0
      ? Math.min(100, Math.max(0, Math.round(((dayIndex + 1) / totalDays) * 100)))
      : null;

  const range = `${formatDate(phase.start_date, 'd MMM yyyy', locale)} → ${
    phase.end_date ? formatDate(phase.end_date, 'd MMM yyyy', locale) : '∞'
  }`;

  // `computePhaseTargets` returns null for a `tdee_delta` phase with no TDEE
  // estimate — there is genuinely no number to show. Say so; never render 0.
  const hint =
    targets != null
      ? null
      : weightKg == null
        ? t('phases.hero.needsWeight')
        : t('phases.hero.needsTdee');

  const macros =
    targets == null
      ? []
      : [
          { key: 'protein', value: `${num.qty(targets.proteinG)} g` },
          { key: 'carbs', value: `${num.qty(targets.carbsG)} g` },
          {
            key: 'fat',
            // R-06: the column is a fraction — `fractionToPct` owns the boundary.
            value: `${num.qty(targets.fatG)} g · ${num.qty(Math.round(fractionToPct(phase.fat_pct_of_kcal)))} %`,
          },
          { key: 'fiber', value: `${num.qty(targets.fiberG)} g` },
        ];

  return (
    <Card className="p-4 md:p-5">
      <div className="grid gap-5 md:grid-cols-2 md:gap-8">
        {/* ── Identity ── */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-full border border-accent-line bg-accent-soft px-2.5 text-[10.5px] font-medium text-accent-ink">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
              {t('phases.hero.activeLabel')}
            </span>
            <PhaseChip phase={phase.phase_type as PhaseType} />
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto shrink-0"
              onClick={() => onEdit(phase)}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {t('phases.edit')}
            </Button>
          </div>

          <h2 className="mt-2 truncate text-[22px] font-semibold leading-[1.1] tracking-[-0.02em] md:text-[26px]">
            {phase.name}
          </h2>

          <p className="tnum mt-1.5 text-xs text-muted-foreground">
            {range}
            {' · '}
            {totalWeeks != null
              ? t('phases.hero.weekOf', { n: weekOf, total: totalWeeks })
              : t('phases.hero.weekN', { n: weekOf })}
            {weeksLeft != null && ` · ${t('phases.hero.weeksLeft', { n: weeksLeft })}`}
          </p>

          {elapsedPct != null && (
            <div
              className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={elapsedPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t('phases.hero.elapsed')}
            >
              <div
                data-testid="phase-elapsed-fill"
                className="h-full rounded-full bg-accent"
                style={{ width: `${elapsedPct}%` }}
              />
            </div>
          )}
        </div>

        {/* ── Daily targets ── */}
        <div className="min-w-0 border-t pt-4 md:border-l md:border-t-0 md:pl-8 md:pt-0">
          <span className="text-cap-label">{t('phases.hero.dailyTargets')}</span>

          {targets == null ? (
            <p
              role="status"
              className="mt-2 rounded-md bg-amber-soft px-3 py-2 text-xs text-amber-ink"
            >
              {hint}
            </p>
          ) : (
            <>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span
                  data-testid="hero-kcal"
                  className="tnum text-[30px] font-semibold leading-none tracking-[-0.03em] md:text-[32px]"
                >
                  {targets.kcal}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t('phases.hero.kcalPerDay')}
                </span>
                {phase.kcal_mode === 'tdee_delta' && (
                  <span className="tnum inline-flex h-[22px] items-center rounded-full border bg-muted px-2 text-[10.5px] text-muted-foreground">
                    {t('phases.summary.tdeePrefix')} {phase.kcal_value > 0 ? '+' : ''}
                    {phase.kcal_value}
                  </span>
                )}
              </div>

              <dl className="mt-3 grid grid-cols-4 gap-x-3 gap-y-0.5">
                {macros.map((m) => (
                  <div key={m.key} className="min-w-0">
                    <dt className="text-[10px] uppercase tracking-[0.05em] text-text-dim">
                      {t(`phases.hero.${m.key}`)}
                    </dt>
                    <dd className="tnum mt-0.5 text-[13px] font-semibold md:text-[15px]">
                      {m.value}
                    </dd>
                  </div>
                ))}
              </dl>

              <p className="mt-3 text-[10.5px] text-text-dim">
                {proteinBasis === 'lean'
                  ? t('phases.hero.basisLean', { n: phase.protein_g_per_kg })
                  : t('phases.hero.basisFallback')}
              </p>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
