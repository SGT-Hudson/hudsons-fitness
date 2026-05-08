import { type FormEvent, useEffect, useState } from 'react';
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

function parseOptional(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
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

  const [measuredOn, setMeasuredOn] = useState(defaultDate);
  const [weightKg, setWeightKg] = useState('');
  const [bodyFatPct, setBodyFatPct] = useState('');
  const [musclePct, setMusclePct] = useState('');
  const [waterPct, setWaterPct] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const source = existing ?? prefillFrom ?? null;
    setMeasuredOn(existing?.measured_on ?? defaultDate);
    setWeightKg(toInput(source?.weight_kg));
    setBodyFatPct(toInput(source?.body_fat_pct));
    setMusclePct(toInput(source?.muscle_pct));
    setWaterPct(toInput(source?.water_pct));
    setNotes(existing?.notes ?? '');
  }, [open, existing, prefillFrom, defaultDate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const weight = parseOptional(weightKg);
    if (weight === null) {
      setError(t('errors.weightRequired'));
      return;
    }
    try {
      await upsert.mutateAsync({
        measured_on: measuredOn,
        weight_kg: weight,
        body_fat_pct: parseOptional(bodyFatPct),
        muscle_pct: parseOptional(musclePct),
        water_pct: parseOptional(waterPct),
        notes: notes.trim() === '' ? null : notes.trim(),
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
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="measuredOn">{t('fields.date')}</Label>
            <Input
              id="measuredOn"
              type="date"
              required
              max={new Date().toISOString().slice(0, 10)}
              value={measuredOn}
              onChange={(e) => setMeasuredOn(e.target.value)}
              disabled={!!existing}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="weightKg">{t('fields.weightKg')}</Label>
              <Input
                id="weightKg"
                type="number"
                inputMode="decimal"
                required
                min={20}
                max={400}
                step="0.1"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
              />
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
                value={bodyFatPct}
                onChange={(e) => setBodyFatPct(e.target.value)}
              />
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
                value={musclePct}
                onChange={(e) => setMusclePct(e.target.value)}
              />
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
                value={waterPct}
                onChange={(e) => setWaterPct(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">{t('fields.notes')}</Label>
            <Textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
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
