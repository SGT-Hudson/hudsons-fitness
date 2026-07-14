import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NumberField } from '@/components/ui/NumberField';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { todayInTZ } from '@/lib/dates';
import {
  fractionToPct,
  pctToFraction,
  PHASE_PROTEIN_DEFAULTS_G_PER_KG_LBM,
} from '@/lib/macros';
import type { Phase, PhaseInput } from '../api';
import { phaseFormSchema, type ParsedPhaseForm, type PhaseFormValues } from '../schema';

type FormValues = PhaseFormValues;

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

const DEFAULTS: FormValues = {
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phase?: Phase | null;
  onSave: (input: PhaseInput) => Promise<void>;
  busy?: boolean;
  /**
   * Notes-only mode: used for frozen (post-grace) past phases. Every field
   * except `notes` is disabled/read-only; only the notes annotation can be
   * changed and saved (notes feed no computation — see D-A5).
   */
  notesOnly?: boolean;
}

export function PhaseDialog({
  open,
  onOpenChange,
  phase,
  onSave,
  busy,
  notesOnly = false,
}: Props) {
  const { t } = useTranslation('objetivos');

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors, dirtyFields },
  } = useForm<FormValues, unknown, ParsedPhaseForm>({
    resolver: zodResolver(phaseFormSchema),
    defaultValues: DEFAULTS,
  });

  const kcalMode = watch('kcal_mode');
  const fiberMode = watch('fiber_mode');
  const phaseType = watch('phase_type');

  // On phase_type change, pre-fill protein_g_per_kg from the phase-aware
  // lean-mass table (D-B1) — but only when the user has NOT manually touched
  // the protein field, so an explicit override is never clobbered. Existing
  // phases keep their stored value: editing one marks no field dirty until
  // touched, but `reset()` below seeds `protein_g_per_kg` from the row, so
  // `dirtyFields.protein_g_per_kg` stays false and the table does not
  // overwrite a stored override unless the user changes the type themselves.
  const tableDefault = PHASE_PROTEIN_DEFAULTS_G_PER_KG_LBM[phaseType];
  useEffect(() => {
    if (!open || notesOnly) return;
    if (dirtyFields.protein_g_per_kg) return;
    if (phase) return; // never retroactively re-anchor an existing phase
    setValue('protein_g_per_kg', toInput(tableDefault));
  }, [open, notesOnly, phase, phaseType, tableDefault, dirtyFields, setValue]);

  useEffect(() => {
    if (!open) return;
    if (phase) {
      reset({
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
      });
    } else {
      reset({ ...DEFAULTS, start_date: todayInTZ() });
    }
  }, [open, phase, reset]);

  // `values` is the PARSED form (numbers) — the schema turned each raw input
  // string into a number via `parseDecimalInput`. `pctToFraction` still owns
  // the R-06 percent → fraction conversion, downstream of the parse.
  async function onSubmit(values: ParsedPhaseForm) {
    await onSave({
      name: values.name,
      phase_type: values.phase_type,
      start_date: values.start_date,
      end_date: values.end_date || null,
      kcal_mode: values.kcal_mode,
      kcal_value: values.kcal_value,
      protein_g_per_kg: values.protein_g_per_kg,
      fat_pct_of_kcal: pctToFraction(values.fat_pct_input),
      fiber_mode: values.fiber_mode,
      fiber_value: values.fiber_value,
      notes: values.notes || null,
    });
    onOpenChange(false);
  }

  const kcalSuffix =
    kcalMode === 'absolute'
      ? t('phases.form.kcalValueFixed')
      : t('phases.form.kcalValueDelta');

  const fiberSuffix =
    fiberMode === 'fixed_g'
      ? t('phases.form.fiberValueFixed')
      : t('phases.form.fiberValuePer1000Kcal');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {notesOnly
              ? t('phases.form.notesOnlyTitle')
              : phase
                ? t('phases.form.editTitle')
                : t('phases.form.newTitle')}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-1">
          {notesOnly && (
            <p
              role="note"
              className="text-xs rounded-md bg-amber-soft text-amber-ink px-3 py-2"
            >
              {t('phases.form.notesOnlyHint')}
            </p>
          )}
          {/* Name */}
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

          {/* Type */}
          <div className="space-y-1.5">
            <Label>{t('phases.form.type')}</Label>
            <Controller
              control={control}
              name="phase_type"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={notesOnly}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cut">{t('phases.type.cut')}</SelectItem>
                    <SelectItem value="maintenance">{t('phases.type.maintenance')}</SelectItem>
                    <SelectItem value="bulk">{t('phases.type.bulk')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* Dates */}
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

          {/* Calories */}
          <div className="space-y-1.5">
            <Label htmlFor="ph-kcal">{t('phases.form.kcal')}</Label>
            <div className="flex gap-2 items-center">
              <div className="w-40 shrink-0">
                <Controller
                  control={control}
                  name="kcal_mode"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={notesOnly}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="absolute">{t('phases.kcalMode.absolute')}</SelectItem>
                        <SelectItem value="tdee_delta">
                          {t('phases.kcalMode.tdee_delta')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="w-24 shrink-0">
                <NumberField
                  id="ph-kcal"
                  className="w-full"
                  readOnly={notesOnly}
                  disabled={notesOnly}
                  {...register('kcal_value')}
                />
              </div>
              <span className="text-sm text-muted-foreground">{kcalSuffix}</span>
            </div>
            {errors.kcal_value && (
              <p className="text-xs text-destructive">{t('phases.form.errors.kcalValue')}</p>
            )}
          </div>

          {/* Protein */}
          <div className="space-y-1.5">
            <Label htmlFor="ph-protein">{t('phases.form.protein')}</Label>
            <NumberField
              id="ph-protein"
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

          {/* Fat */}
          <div className="space-y-1.5">
            <Label htmlFor="ph-fat">{t('phases.form.fat')}</Label>
            <NumberField
              id="ph-fat"
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
            <Label htmlFor="ph-fiber">{t('phases.form.fiber')}</Label>
            <div className="flex gap-2 items-center">
              <div className="w-40 shrink-0">
                <Controller
                  control={control}
                  name="fiber_mode"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={notesOnly}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed_g">{t('phases.fiberMode.fixed_g')}</SelectItem>
                        <SelectItem value="per_1000_kcal">
                          {t('phases.fiberMode.per_1000_kcal')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="w-24 shrink-0">
                <NumberField
                  id="ph-fiber"
                  className="w-full"
                  readOnly={notesOnly}
                  disabled={notesOnly}
                  {...register('fiber_value')}
                />
              </div>
              <span className="text-sm text-muted-foreground">{fiberSuffix}</span>
            </div>
            {errors.fiber_value && (
              <p className="text-xs text-destructive">{t('phases.form.errors.fiberValue')}</p>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="ph-notes">{t('phases.form.notes')}</Label>
            <Textarea id="ph-notes" rows={2} {...register('notes')} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {t('phases.form.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
