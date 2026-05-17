import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { isoDate } from '@/lib/dates';
import type { Phase, PhaseInput } from '../api';

type FormValues = {
  name: string;
  phase_type: 'cut' | 'maintenance' | 'bulk';
  start_date: string;
  end_date: string;
  kcal_mode: 'absolute' | 'tdee_delta';
  kcal_value: number;
  protein_g_per_kg: number;
  fat_pct_input: number; // percent in UI (10–60); stored as fraction in DB
  fiber_mode: 'fixed_g' | 'per_1000_kcal';
  fiber_value: number;
  notes: string;
};

const DEFAULTS: FormValues = {
  name: '',
  phase_type: 'maintenance',
  start_date: isoDate(),
  end_date: '',
  kcal_mode: 'absolute',
  kcal_value: 2000,
  protein_g_per_kg: 1.6,
  fat_pct_input: 25,
  fiber_mode: 'fixed_g',
  fiber_value: 30,
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
    getValues,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: DEFAULTS });

  const kcalMode = watch('kcal_mode');
  const fiberMode = watch('fiber_mode');

  useEffect(() => {
    if (!open) return;
    if (phase) {
      reset({
        name: phase.name,
        phase_type: phase.phase_type as FormValues['phase_type'],
        start_date: phase.start_date,
        end_date: phase.end_date ?? '',
        kcal_mode: phase.kcal_mode as FormValues['kcal_mode'],
        kcal_value: phase.kcal_value,
        protein_g_per_kg: phase.protein_g_per_kg,
        fat_pct_input: Math.round(phase.fat_pct_of_kcal * 100),
        fiber_mode: phase.fiber_mode as FormValues['fiber_mode'],
        fiber_value: phase.fiber_value,
        notes: phase.notes ?? '',
      });
    } else {
      reset({ ...DEFAULTS, start_date: isoDate() });
    }
  }, [open, phase, reset]);

  async function onSubmit(values: FormValues) {
    await onSave({
      name: values.name,
      phase_type: values.phase_type,
      start_date: values.start_date,
      end_date: values.end_date || null,
      kcal_mode: values.kcal_mode,
      kcal_value: values.kcal_value,
      protein_g_per_kg: values.protein_g_per_kg,
      fat_pct_of_kcal: values.fat_pct_input / 100,
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
              className="text-xs rounded-md bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 px-3 py-2"
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
              {...register('name', { required: true })}
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
                {...register('start_date', { required: true })}
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
                {...register('end_date', {
                  validate: (v) => {
                    if (!v) return true;
                    return v > getValues('start_date') || t('phases.form.errors.dateRange');
                  },
                })}
              />
              {errors.end_date && (
                <p className="text-xs text-destructive">{t('phases.form.errors.dateRange')}</p>
              )}
            </div>
          </div>

          {/* Calories */}
          <div className="space-y-1.5">
            <Label>{t('phases.form.kcal')}</Label>
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
              <Input
                type="number"
                step="any"
                className="w-24 shrink-0"
                readOnly={notesOnly}
                disabled={notesOnly}
                {...register('kcal_value', {
                  valueAsNumber: true,
                  validate: (v) =>
                    getValues('kcal_mode') === 'tdee_delta' ||
                    v > 0 ||
                    t('phases.form.errors.kcalValue'),
                })}
              />
              <span className="text-sm text-muted-foreground">{kcalSuffix}</span>
            </div>
            {errors.kcal_value && (
              <p className="text-xs text-destructive">{t('phases.form.errors.kcalValue')}</p>
            )}
          </div>

          {/* Protein */}
          <div className="space-y-1.5">
            <Label htmlFor="ph-protein">{t('phases.form.protein')}</Label>
            <Input
              type="number"
              id="ph-protein"
              step="0.1"
              min="0.1"
              max="4"
              readOnly={notesOnly}
              disabled={notesOnly}
              {...register('protein_g_per_kg', {
                valueAsNumber: true,
                min: { value: 0.1, message: t('phases.form.errors.protein') },
              })}
            />
            <p className="text-xs text-muted-foreground">{t('phases.form.proteinHelp')}</p>
            {errors.protein_g_per_kg && (
              <p className="text-xs text-destructive">{t('phases.form.errors.protein')}</p>
            )}
          </div>

          {/* Fat */}
          <div className="space-y-1.5">
            <Label htmlFor="ph-fat">{t('phases.form.fat')}</Label>
            <Input
              type="number"
              id="ph-fat"
              step="1"
              min="10"
              max="60"
              readOnly={notesOnly}
              disabled={notesOnly}
              {...register('fat_pct_input', {
                valueAsNumber: true,
                min: { value: 10, message: t('phases.form.errors.fat') },
                max: { value: 60, message: t('phases.form.errors.fat') },
              })}
            />
            {errors.fat_pct_input && (
              <p className="text-xs text-destructive">{t('phases.form.errors.fat')}</p>
            )}
          </div>

          {/* Fiber */}
          <div className="space-y-1.5">
            <Label>{t('phases.form.fiber')}</Label>
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
              <Input
                type="number"
                step="any"
                min="0.1"
                className="w-24 shrink-0"
                readOnly={notesOnly}
                disabled={notesOnly}
                {...register('fiber_value', {
                  valueAsNumber: true,
                  min: { value: 0.1, message: t('phases.form.errors.fiberValue') },
                })}
              />
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
