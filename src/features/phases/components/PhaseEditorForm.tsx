import { useEffect, useState, type ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberField } from '@/components/ui/NumberField';
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Textarea } from '@/components/ui/textarea';
import {
  TdeeCalculator,
  type TdeeCalculatorData,
} from '@/features/tdee/components/TdeeCalculator';
import { todayInTZ } from '@/lib/dates';
import { parseDecimalInput } from '@/lib/number';
import {
  fractionToPct,
  pctToFraction,
  PHASE_PROTEIN_DEFAULTS_G_PER_KG_LBM,
  type PhaseType,
} from '@/lib/macros';
import type { Phase, PhaseInput } from '../api';
import { phaseFormSchema, type ParsedPhaseForm, type PhaseFormValues } from '../schema';

type FormValues = PhaseFormValues;

/**
 * The save button lives OUTSIDE this form — in the page header (`PageShell` →
 * `BackHeader` on mobile, `PageHeaderV2` on desktop; `BackHeader` passes
 * `actions` through, so it works on both). A `<button form="…">` submits a form
 * it is not inside: that is the whole contract between the page and this file.
 */
export const PHASE_EDITOR_FORM_ID = 'phase-editor';

/** Uppercase micro-label that caps every card (the wave-5/6 editor pattern). */
const CARD_LABEL =
  'text-[10px] font-medium uppercase tracking-[0.05em] text-text-dim md:text-[10.5px]';

/**
 * The failed save, as the PAGE saw it. The page owns detection (`23P01` is a
 * PostgREST concern), this file owns the copy — so the message is localized
 * once, here, next to the fields it accuses.
 */
export type PhaseSubmitError =
  | { kind: 'overlap' }
  | { kind: 'unknown'; message: string };

/**
 * The form's live values, parsed — what the preview (`PhasePreview`) paints.
 * `fat_pct_of_kcal` is already the DB FRACTION (R-06's `pctToFraction` ran):
 * the preview must never see the UI percent, or it would feed 27.5 where the
 * macro maths expects 0.275. A field the user has half-typed (or blanked)
 * parses to `null` — never to 0, which would be a lie the preview then draws.
 */
export interface PhaseDraft {
  name: string;
  phase_type: PhaseType;
  start_date: string;
  end_date: string | null;
  kcal_mode: 'absolute' | 'tdee_delta';
  kcal_value: number | null;
  protein_g_per_kg: number | null;
  fat_pct_of_kcal: number | null;
  fiber_mode: 'fixed_g' | 'per_1000_kcal';
  fiber_value: number | null;
  notes: string | null;
}

/**
 * The four numeric fields are `NumberField`s (`type="text"`), so the form holds
 * their raw STRING. Prefill stays point-decimal `String(n)` — accept-both,
 * emit-point: the schema reads a `,` or a `.` back, so the round-trip is safe
 * whatever the locale.
 */
function toInput(value: number): string {
  return String(value);
}

/**
 * Stored fraction → the percent shown in the field (R-06's `fractionToPct`
 * still owns the conversion). Rounded to one decimal, which is the exact
 * precision `phases.fat_pct_of_kcal` — `numeric(4,3)` — can hold: it kills the
 * float dust (`0.275 * 100` is 27.500000000000004) without destroying the
 * decimal itself. It used to be `Math.round`, because the field was
 * integer-only (`step="1"`); rounding now would silently rewrite a stored
 * 27.5 % to 28 % on the next save.
 */
function fatPctToInput(fraction: number): string {
  return String(Number(fractionToPct(fraction).toFixed(1)));
}

function blankForm(): FormValues {
  return {
    name: '',
    phase_type: 'maintenance',
    start_date: todayInTZ(),
    end_date: '',
    kcal_mode: 'absolute',
    kcal_value: '2000',
    protein_g_per_kg: toInput(PHASE_PROTEIN_DEFAULTS_G_PER_KG_LBM.maintenance),
    fat_pct_input: '25',
    fiber_mode: 'fixed_g',
    fiber_value: '30',
    notes: '',
  };
}

/** The stored row → the strings the DOM holds. The R-06 percent is `fatPctToInput`'s. */
function phaseToForm(phase: Phase): FormValues {
  return {
    name: phase.name,
    phase_type: phase.phase_type as FormValues['phase_type'],
    start_date: phase.start_date,
    end_date: phase.end_date ?? '',
    kcal_mode: phase.kcal_mode as FormValues['kcal_mode'],
    kcal_value: toInput(phase.kcal_value),
    protein_g_per_kg: toInput(phase.protein_g_per_kg),
    fat_pct_input: fatPctToInput(phase.fat_pct_of_kcal),
    fiber_mode: phase.fiber_mode as FormValues['fiber_mode'],
    fiber_value: toInput(phase.fiber_value),
    notes: phase.notes ?? '',
  };
}

interface Props {
  /**
   * The stored row (edit), or nothing (create). ⚠️ Load-bearing beyond the
   * prefill: an existing phase NEVER re-anchors its protein from the phase-type
   * table (R-05), and its presence is what the page's `key` remounts on.
   */
  phase?: Phase | null;
  /**
   * R-02 notes-only: a phase frozen >7 days past its end. Every field but
   * `notes` renders DISABLED — disabled, not blanked: they keep their real
   * values, so the full schema still validates the notes-only save through this
   * same submit path (notes feed no computation — D-A5).
   */
  notesOnly?: boolean;
  /** A save that came back rejected — rendered where it belongs (dates / footer). */
  submitError?: PhaseSubmitError | null;
  onSubmit: (input: PhaseInput) => void;
  /**
   * The live preview slot (`PhasePreview`, task B2): right column on desktop,
   * inline card above the fields on mobile. A render prop, because only this
   * component can watch the fields as they are typed.
   */
  preview?: (
    draft: PhaseDraft,
    ctx: { openTdeeCalculator: () => void },
  ) => ReactNode;
  /**
   * R-37: everything the TDEE calculator needs, read by the PAGE and passed
   * through. The form itself calls no data hook — same division of labour as
   * the preview slot.
   */
  tdeeCalculator?: TdeeCalculatorData;
}

export function PhaseEditorForm({
  phase,
  notesOnly = false,
  submitError,
  onSubmit,
  preview,
  tdeeCalculator,
}: Props) {
  const { t } = useTranslation('objetivos');

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, dirtyFields },
  } = useForm<FormValues, unknown, ParsedPhaseForm>({
    resolver: zodResolver(phaseFormSchema),
    // A ROUTE, not a dialog: `PhaseDialog` seeded itself from an `open`-gated
    // `reset()` because the same mounted component was reused for every phase.
    // Here the page's own guards (it renders nothing while the row is loading,
    // and redirects when the id does not resolve) mean `phase` is already
    // settled at mount — so the seed IS the mount, and there is no `reset()`
    // that could fire again later and wipe what the user is typing. The page
    // additionally keys this component by phase id, so a different phase is a
    // different mount and therefore a fresh seed.
    defaultValues: phase ? phaseToForm(phase) : blankForm(),
  });

  const [tdeeOpen, setTdeeOpen] = useState(false);

  const values = watch();
  const { phase_type: phaseType, kcal_mode: kcalMode, fiber_mode: fiberMode } = values;

  // R-05: on phase_type change, pre-fill protein_g_per_kg from the phase-aware
  // lean-mass table (D-B1) — but never when the user has manually touched the
  // field (an explicit override is never clobbered), and never for a stored
  // phase (an existing phase is not retroactively re-anchored, even if its type
  // is changed: its stored value is a decision someone already made).
  const tableDefault = PHASE_PROTEIN_DEFAULTS_G_PER_KG_LBM[phaseType];
  useEffect(() => {
    if (notesOnly) return;
    if (phase) return; // never retroactively re-anchor an existing phase
    if (dirtyFields.protein_g_per_kg) return;
    setValue('protein_g_per_kg', toInput(tableDefault));
  }, [notesOnly, phase, phaseType, tableDefault, dirtyFields, setValue]);

  /**
   * Apply writes BOTH fields, together. In `tdee_delta` mode `kcal_value` is
   * the delta, so dropping a TDEE into it would be plain wrong — and the
   * situation that brings the user here is precisely "no adaptive TDEE, so
   * delta mode is unusable". The button's label names the consequence, so the
   * mode switch is disclosed rather than silent.
   */
  function applyTdee(tdeeKcal: number) {
    setValue('kcal_mode', 'absolute', { shouldDirty: true });
    setValue('kcal_value', String(tdeeKcal), { shouldDirty: true });
    setTdeeOpen(false);
  }

  // `parsed` is the PARSED form (numbers) — the schema turned each raw input
  // string into a number via `parseDecimalInput`. `pctToFraction` still owns the
  // R-06 percent → fraction conversion, downstream of the parse, never instead.
  function submit(parsed: ParsedPhaseForm) {
    onSubmit({
      name: parsed.name,
      phase_type: parsed.phase_type,
      start_date: parsed.start_date,
      end_date: parsed.end_date || null,
      kcal_mode: parsed.kcal_mode,
      kcal_value: parsed.kcal_value,
      protein_g_per_kg: parsed.protein_g_per_kg,
      fat_pct_of_kcal: pctToFraction(parsed.fat_pct_input),
      fiber_mode: parsed.fiber_mode,
      fiber_value: parsed.fiber_value,
      notes: parsed.notes || null,
    });
  }

  // The preview reads the form as it is BEING typed, so it cannot wait for the
  // schema: it parses the same strings through the same boundary
  // (`parseDecimalInput` → `pctToFraction`) and tolerates a half-typed field as
  // `null`.
  const fatPct = parseDecimalInput(values.fat_pct_input);
  const draft: PhaseDraft = {
    name: values.name,
    phase_type: phaseType,
    start_date: values.start_date,
    end_date: values.end_date || null,
    kcal_mode: kcalMode,
    kcal_value: parseDecimalInput(values.kcal_value),
    protein_g_per_kg: parseDecimalInput(values.protein_g_per_kg),
    fat_pct_of_kcal: fatPct === null ? null : pctToFraction(fatPct),
    fiber_mode: fiberMode,
    fiber_value: parseDecimalInput(values.fiber_value),
    notes: values.notes || null,
  };

  const kcalSuffix =
    kcalMode === 'absolute'
      ? t('phases.form.kcalValueFixed')
      : t('phases.form.kcalValueDelta');

  const fiberSuffix =
    fiberMode === 'fixed_g'
      ? t('phases.form.fiberValueFixed')
      : t('phases.form.fiberValuePer1000Kcal');

  return (
    <form
      id={PHASE_EDITOR_FORM_ID}
      onSubmit={handleSubmit(submit)}
      className="grid gap-3 md:grid-cols-[minmax(0,1fr)_320px] md:items-start md:gap-4"
    >
      {/* ── B2 slot — the live preview. First in the DOM so it sits ABOVE the
          fields on mobile (an inline card you can see while typing); `md:order-2`
          moves it into the right column on desktop, where it sticks. ── */}
      {preview && (
        <aside className="md:order-2 md:sticky md:top-4">
          {preview(draft, { openTdeeCalculator: () => setTdeeOpen(true) })}
        </aside>
      )}

      <div className="space-y-3 md:order-1 md:space-y-3.5">
        {notesOnly && (
          <p
            role="note"
            className="rounded-[12px] border border-amber-line bg-amber-soft px-3 py-2 text-[11.5px] leading-[1.45] text-amber-ink"
          >
            {t('phases.form.notesOnlyHint')}
          </p>
        )}

        {/* ── Identity ── */}
        <Card className="space-y-3 p-3.5 md:p-4">
          <p className={CARD_LABEL}>{t('phases.form.sections.identity')}</p>

          <div className="space-y-1.5">
            <Label htmlFor="ph-name">{t('phases.form.name')}</Label>
            <Input
              id="ph-name"
              placeholder={t('phases.form.namePlaceholder')}
              readOnly={notesOnly}
              disabled={notesOnly}
              {...register('name')}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{t('phases.form.errors.nameRequired')}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label id="ph-type-label">{t('phases.form.type')}</Label>
            <Controller
              control={control}
              name="phase_type"
              render={({ field }) => (
                <SegmentedControl
                  labelledBy="ph-type-label"
                  value={field.value}
                  onChange={field.onChange}
                  disabled={notesOnly}
                  className="flex w-full"
                  options={[
                    { value: 'cut', label: t('phases.type.cut') },
                    { value: 'maintenance', label: t('phases.type.maintenance') },
                    { value: 'bulk', label: t('phases.type.bulk') },
                  ]}
                />
              )}
            />
          </div>
        </Card>

        {/* ── Dates. The overlap (23P01) is anchored here: it is the dates that
            collided with another phase, and the form's own `end > start` refine
            knows nothing about other phases — only the server does. ── */}
        <Card className="space-y-3 p-3.5 md:p-4">
          <p className={CARD_LABEL}>{t('phases.form.sections.dates')}</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ph-start">{t('phases.form.startDate')}</Label>
              <Input
                type="date"
                id="ph-start"
                readOnly={notesOnly}
                disabled={notesOnly}
                {...register('start_date')}
              />
              {errors.start_date && (
                <p className="text-xs text-destructive">
                  {t('phases.form.errors.startDateRequired')}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ph-end">{t('phases.form.endDate')}</Label>
              <Input
                type="date"
                id="ph-end"
                readOnly={notesOnly}
                disabled={notesOnly}
                {...register('end_date')}
              />
              {errors.end_date && (
                <p className="text-xs text-destructive">{t('phases.form.errors.dateRange')}</p>
              )}
            </div>
          </div>

          {submitError?.kind === 'overlap' && (
            <p
              role="alert"
              className="rounded-[11px] border border-danger-line bg-danger-soft px-3 py-2 text-[11.5px] leading-[1.45] text-danger-ink"
            >
              {t('phases.form.errors.overlap')}
            </p>
          )}
        </Card>

        {/* ── Targets: the stored inputs of the macro maths. The GRAMS are
            derived (computeDailyMacroTargets) and live in the preview — they are
            deliberately not editable here. ── */}
        <Card className="space-y-3.5 p-3.5 md:p-4">
          <p className={CARD_LABEL}>{t('phases.form.sections.targets')}</p>

          {/* Calories */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label id="ph-kcal-mode-label">{t('phases.form.kcalMode')}</Label>
              <Controller
                control={control}
                name="kcal_mode"
                render={({ field }) => (
                  <SegmentedControl
                    labelledBy="ph-kcal-mode-label"
                    value={field.value}
                    onChange={field.onChange}
                    disabled={notesOnly}
                    options={[
                      { value: 'absolute', label: t('phases.kcalMode.absolute') },
                      { value: 'tdee_delta', label: t('phases.kcalMode.tdee_delta') },
                    ]}
                  />
                )}
              />
            </div>
            {/* Wraps: the delta suffix is long, and on a phone it and the
                calculator trigger do not fit on one line — unwrapped, the
                suffix was squeezed under the button. */}
            <div className="flex flex-wrap items-end gap-x-2 gap-y-1.5">
              <NumberField
                id="ph-kcal"
                label={t('phases.form.kcal')}
                className="w-28"
                readOnly={notesOnly}
                disabled={notesOnly}
                {...register('kcal_value')}
              />
              <span className="min-w-0 pb-2 text-xs text-muted-foreground">{kcalSuffix}</span>
              {/* Present in BOTH kcal modes: a new phase starts in `absolute`,
                  so a first-time user never meets the delta dead end and would
                  otherwise never find the tool. */}
              {tdeeCalculator && !notesOnly && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setTdeeOpen(true)}
                  data-testid="phase-open-tdee"
                  className="ml-auto h-9 shrink-0"
                >
                  <Calculator className="h-4 w-4" aria-hidden="true" />
                  {t('tdee.open')}
                </Button>
              )}
            </div>
            {errors.kcal_value && (
              <p className="text-xs text-destructive">{t('phases.form.errors.kcalValue')}</p>
            )}
          </div>

          {/* Protein */}
          <div className="space-y-1.5">
            <NumberField
              id="ph-protein"
              label={t('phases.form.protein')}
              dot="protein"
              readOnly={notesOnly}
              disabled={notesOnly}
              {...register('protein_g_per_kg')}
            />
            <p className="text-xs text-muted-foreground">
              {t('phases.form.proteinHelp', {
                type: t(`phases.type.${phaseType}`),
                default: tableDefault,
              })}
            </p>
            {errors.protein_g_per_kg && (
              <p className="text-xs text-destructive">{t('phases.form.errors.protein')}</p>
            )}
          </div>

          {/* Fat — a UI PERCENT (R-06). The column is a fraction; `pctToFraction`
              owns the conversion at the submit boundary, never an inline /100. */}
          <div className="space-y-1.5">
            <NumberField
              id="ph-fat"
              label={t('phases.form.fat')}
              dot="fat"
              readOnly={notesOnly}
              disabled={notesOnly}
              {...register('fat_pct_input')}
            />
            {errors.fat_pct_input && (
              <p className="text-xs text-destructive">{t('phases.form.errors.fat')}</p>
            )}
          </div>

          {/* Fiber */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label id="ph-fiber-mode-label">{t('phases.form.fiberMode')}</Label>
              <Controller
                control={control}
                name="fiber_mode"
                render={({ field }) => (
                  <SegmentedControl
                    labelledBy="ph-fiber-mode-label"
                    value={field.value}
                    onChange={field.onChange}
                    disabled={notesOnly}
                    options={[
                      { value: 'fixed_g', label: t('phases.fiberMode.fixed_g') },
                      { value: 'per_1000_kcal', label: t('phases.fiberMode.per_1000_kcal') },
                    ]}
                  />
                )}
              />
            </div>
            <div className="flex items-end gap-2">
              <NumberField
                id="ph-fiber"
                label={t('phases.form.fiber')}
                dot="fiber"
                className="w-28"
                readOnly={notesOnly}
                disabled={notesOnly}
                {...register('fiber_value')}
              />
              <span className="pb-2 text-xs text-muted-foreground">{fiberSuffix}</span>
            </div>
            {errors.fiber_value && (
              <p className="text-xs text-destructive">{t('phases.form.errors.fiberValue')}</p>
            )}
          </div>
        </Card>

        {/* ── Notes: editable forever, frozen phase or not (D-A5 / R-02). ── */}
        <Card className="space-y-3 p-3.5 md:p-4">
          <p className={CARD_LABEL}>{t('phases.form.sections.notes')}</p>
          <div className="space-y-1.5">
            <Label htmlFor="ph-notes">{t('phases.form.notes')}</Label>
            <Textarea id="ph-notes" rows={3} {...register('notes')} />
          </div>
        </Card>

        {/* Anything the server rejected that is NOT the overlap still speaks —
            swallowing it is the bug this wave fixes, not a pattern to keep. */}
        {submitError?.kind === 'unknown' && (
          <p role="alert" className="text-sm text-destructive">
            {submitError.message}
          </p>
        )}
      </div>

      {/* Both triggers open this one sheet. `variant="panel"` hands padding to
          the caller, and `ResponsiveDialog`'s `title` is sr-only — hence the
          wrapping div and the visible h2 (an h2: the page owns the h1). */}
      {tdeeCalculator && (
        <ResponsiveDialog
          open={tdeeOpen}
          onOpenChange={setTdeeOpen}
          title={t('tdee.title')}
          variant="panel"
        >
          <div className="overflow-y-auto p-4">
            <h2 className="mb-3 text-[15px] font-semibold">{t('tdee.title')}</h2>
            <TdeeCalculator data={tdeeCalculator} onApply={applyTdee} />
          </div>
        </ResponsiveDialog>
      )}
    </form>
  );
}
