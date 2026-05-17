import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useUpsertMeasurement } from '../hooks';
import {
  measurementFormSchema,
  type MeasurementFormValues,
  type ParsedMeasurementForm,
} from '../schema';
import { todayInTZ } from '@/lib/dates';
import type { BodyMeasurement } from '../api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate: string;
  existing?: BodyMeasurement | null;
  prefillFrom?: BodyMeasurement | null;
}

function toInput(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

export function MeasurementDialog({
  open,
  onOpenChange,
  defaultDate,
  existing,
  prefillFrom,
}: Props) {
  const { t } = useTranslation('metricas');
  const { t: tCommon } = useTranslation('common');
  const upsert = useUpsertMeasurement();
  const [error, setError] = useState<string | null>(null);

  // The schema emits a stable issue code (R-09 convention): 'weightRequired'
  // for a blank required field, 'range' for a non-empty out-of-bound value.
  // Map each to its localized message so an out-of-range value no longer
  // surfaces the misleading "weight is required" copy.
  function fieldError(
    code: string | undefined,
    min: number,
    max: number,
  ): string | null {
    if (!code) return null;
    if (code === 'range') return t('errors.outOfRange', { min, max });
    return t(`errors.${code}`);
  }

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MeasurementFormValues, unknown, ParsedMeasurementForm>({
    resolver: zodResolver(measurementFormSchema),
    defaultValues: {
      measured_on: defaultDate,
      weight_kg: '',
      body_fat_pct: '',
      muscle_pct: '',
      water_pct: '',
      notes: '',
    },
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    const source = existing ?? prefillFrom ?? null;
    reset({
      measured_on: existing?.measured_on ?? defaultDate,
      // Inputs are strings; the schema coerces weight and turns blank optional
      // fields → null at parse time (matching the old parseOptional behavior).
      weight_kg: toInput(source?.weight_kg),
      body_fat_pct: toInput(source?.body_fat_pct),
      muscle_pct: toInput(source?.muscle_pct),
      water_pct: toInput(source?.water_pct),
      notes: existing?.notes ?? '',
    });
  }, [open, existing, prefillFrom, defaultDate, reset]);

  async function onSubmit(values: ParsedMeasurementForm) {
    setError(null);
    try {
      await upsert.mutateAsync({
        measured_on: values.measured_on,
        weight_kg: values.weight_kg,
        body_fat_pct: values.body_fat_pct,
        muscle_pct: values.muscle_pct,
        water_pct: values.water_pct,
        notes: values.notes.trim() === '' ? null : values.notes.trim(),
      });
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? t('dialog.editTitle') : t('dialog.newTitle')}</DialogTitle>
          <DialogDescription>
            {prefillFrom && !existing ? t('dialog.prefillHint') : t('dialog.subtitle')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="measuredOn">{t('fields.date')}</Label>
            <Input
              id="measuredOn"
              type="date"
              max={todayInTZ()}
              disabled={!!existing}
              {...register('measured_on')}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="weightKg">{t('fields.weightKg')}</Label>
              <Input
                id="weightKg"
                type="number"
                inputMode="decimal"
                min={20}
                max={400}
                step="0.1"
                {...register('weight_kg')}
              />
              {errors.weight_kg && (
                <p className="text-xs text-destructive">
                  {fieldError(errors.weight_kg.message, 20, 400)}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="bodyFatPct">{t('fields.bodyFatPct')}</Label>
              <Input
                id="bodyFatPct"
                type="number"
                inputMode="decimal"
                min={0}
                max={70}
                step="0.1"
                {...register('body_fat_pct')}
              />
              {errors.body_fat_pct && (
                <p className="text-xs text-destructive">
                  {fieldError(errors.body_fat_pct.message, 0, 70)}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="musclePct">{t('fields.musclePct')}</Label>
              <Input
                id="musclePct"
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step="0.1"
                {...register('muscle_pct')}
              />
              {errors.muscle_pct && (
                <p className="text-xs text-destructive">
                  {fieldError(errors.muscle_pct.message, 0, 100)}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="waterPct">{t('fields.waterPct')}</Label>
              <Input
                id="waterPct"
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step="0.1"
                {...register('water_pct')}
              />
              {errors.water_pct && (
                <p className="text-xs text-destructive">
                  {fieldError(errors.water_pct.message, 0, 100)}
                </p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">{t('fields.notes')}</Label>
            <Textarea id="notes" rows={3} {...register('notes')} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={upsert.isPending}>
              {upsert.isPending ? tCommon('loading') : tCommon('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
