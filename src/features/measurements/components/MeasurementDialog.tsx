import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { PencilLine, X } from 'lucide-react';
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberField } from '@/components/ui/NumberField';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatDecimal } from '@/lib/number';
import { useUpsertMeasurement } from '../hooks';
import {
  measurementFormSchema,
  type MeasurementFormValues,
  type ParsedMeasurementForm,
} from '../schema';
import { formatDate, todayInTZ, type Locale } from '@/lib/dates';
import { parseDecimalInput } from '@/lib/number';
import type { BodyMeasurement } from '../api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate: string;
  existing?: BodyMeasurement | null;
  prefillFrom?: BodyMeasurement | null;
}

/** Uppercase micro-label capping a card (the canvas `FieldLabel`, as `IngredientEditorForm`). */
const CARD_LABEL = 'text-[10px] font-medium uppercase tracking-[0.05em] text-text-dim md:text-[10.5px]';
/** The framed fields' own caption. */
const FIELD_LABEL = 'text-[9.5px] font-medium uppercase tracking-[0.04em] text-muted-foreground md:text-[10.5px]';

function toInput(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

/**
 * The delta's arrow, the same ↑ / ↓ / · vocabulary the Diario body card uses for
 * its weekly rate. One decimal — a body scale's own resolution.
 */
function signedKg(n: number, lang: string): string {
  const v = formatDecimal(Math.abs(n), { lang, digits: 1 });
  // Zero check stays on the number, not the localised string: `Number('0,0')`
  // is NaN. The arrow carries the sign, so the value is formatted unsigned.
  if (Number(Math.abs(n).toFixed(1)) === 0) return `± ${v}`;
  return `${n < 0 ? '↓' : '↑'} ${v}`;
}

/**
 * The measurement entry form, on the shared `ResponsiveDialog` (R-33 wave 7):
 * a vaul bottom sheet on mobile, a centred dialog on desktop — the canvas's
 * `MedicionSheet` / `MedicionOverlay`.
 *
 * ⚠️ Two callers: Progreso and Diario's `BodyQuickMeasureCard` (the right-rail
 * "Cuerpo" card). The props contract is shared — do not make one caller's
 * concern a required prop.
 *
 * The canvas's báscula/manual source toggle, photo attach and streak chip are
 * NOT built: no such data exists (R-33 wave-7 strip-list, R-39).
 *
 * Fields, the zod schema and its error codes are untouched by this migration —
 * in particular `NumberField`'s `type="text" inputMode="decimal"` boundary,
 * which is what lets a Spanish keyboard's `82,4` survive to the parser.
 */
export function MeasurementDialog({
  open,
  onOpenChange,
  defaultDate,
  existing,
  prefillFrom,
}: Props) {
  const { t, i18n } = useTranslation('metricas');
  const { t: tCommon } = useTranslation('common');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;
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
    watch,
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

  const title = existing ? t('dialog.editTitle') : t('dialog.newTitle');
  const hint = prefillFrom && !existing ? t('dialog.prefillHint') : t('dialog.subtitle');

  // "↓ 0,3 kg desde la última · 27 may" — the canvas's line under the weight
  // field. NOT a trend and NOT a new piece of maths: it is the plain difference
  // between what is typed in the field right now and the weight of the previous
  // measurement the caller already handed us (`prefillFrom` — Progreso and the
  // Diario card both pass the latest row). No previous row, nothing typed, or
  // an EDIT (where the row before this one is not in scope here) ⇒ no line at
  // all, rather than a number we would have to invent.
  const previous = existing ? null : (prefillFrom ?? null);
  const typedWeight = parseDecimalInput(watch('weight_kg') ?? '');
  const delta =
    previous?.weight_kg != null && typedWeight != null
      ? typedWeight - previous.weight_kg
      : null;

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={title} variant="centered">
      {({ isMobile }) => (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3.5">
          {/* Head — the title, and the date as the line under it. The canvas
              prints that line as static text because its scale stamps the date;
              here the date is a real (schema-backed) field, so it stays an input. */}
          <div className="flex items-start gap-3">
            <span
              className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent-ink"
              aria-hidden="true"
            >
              <PencilLine className="size-4" />
            </span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <h2 className="text-title-sheet">{title}</h2>
              <div className="flex items-center gap-2">
                <Label htmlFor="measuredOn" className={FIELD_LABEL}>
                  {t('fields.date')}
                </Label>
                <Input
                  id="measuredOn"
                  type="date"
                  max={todayInTZ()}
                  disabled={!!existing}
                  className="tnum h-8 w-auto rounded-[9px] px-2 text-[12.5px]"
                  {...register('measured_on')}
                />
              </div>
            </div>
            {/* Radix's DialogContent draws its own X; vaul's DrawerContent draws none. */}
            {isMobile && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-[30px] shrink-0 rounded-[9px] text-text-dim"
                aria-label={tCommon('cancel')}
                onClick={() => onOpenChange(false)}
              >
                <X className="size-3.5" aria-hidden="true" />
              </Button>
            )}
          </div>

          <p className="text-[11.5px] leading-snug text-text-dim">{hint}</p>

          {/* Peso — el protagonista. */}
          <div className="rounded-[14px] border bg-card p-3.5">
            <NumberField
              id="weightKg"
              label={t('dialog.weightLabel')}
              labelClassName={FIELD_LABEL}
              suffix="kg"
              className="h-[52px] pr-8 text-[26px] font-semibold tracking-tight"
              {...register('weight_kg')}
            />
            {delta != null && previous?.measured_on && (
              <p className="tnum mt-1.5 text-[11px] font-medium text-text-dim">
                {t('dialog.sinceLast', {
                  delta: signedKg(delta, locale),
                  date: formatDate(previous.measured_on, 'd MMM', locale),
                })}
              </p>
            )}
            {errors.weight_kg && (
              <p className="mt-1.5 text-xs text-destructive">
                {fieldError(errors.weight_kg.message, 20, 400)}
              </p>
            )}
          </div>

          {/* Composición — opcional. */}
          <div className="space-y-3 rounded-[14px] border bg-card p-3.5">
            <div className="flex items-center gap-2">
              <span className={CARD_LABEL}>{t('composition.title')}</span>
              <span className="ml-auto text-[11px] text-text-dim">{t('dialog.optional')}</span>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <NumberField
                  id="bodyFatPct"
                  label={t('composition.fat')}
                  labelClassName={FIELD_LABEL}
                  suffix="%"
                  {...register('body_fat_pct')}
                />
                {errors.body_fat_pct && (
                  <p className="mt-1.5 text-xs text-destructive">
                    {fieldError(errors.body_fat_pct.message, 0, 70)}
                  </p>
                )}
              </div>
              <div>
                <NumberField
                  id="musclePct"
                  label={t('composition.muscle')}
                  labelClassName={FIELD_LABEL}
                  suffix="%"
                  {...register('muscle_pct')}
                />
                {errors.muscle_pct && (
                  <p className="mt-1.5 text-xs text-destructive">
                    {fieldError(errors.muscle_pct.message, 0, 100)}
                  </p>
                )}
              </div>
              <div>
                <NumberField
                  id="waterPct"
                  label={t('composition.water')}
                  labelClassName={FIELD_LABEL}
                  suffix="%"
                  {...register('water_pct')}
                />
                {errors.water_pct && (
                  <p className="mt-1.5 text-xs text-destructive">
                    {fieldError(errors.water_pct.message, 0, 100)}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Nota. */}
          <div className="space-y-2 rounded-[14px] border bg-card p-3.5">
            <Label htmlFor="notes" className={CARD_LABEL}>
              {t('fields.notes')}
            </Label>
            <Textarea
              id="notes"
              rows={3}
              placeholder={t('dialog.notePlaceholder')}
              className="resize-none text-[13px]"
              {...register('notes')}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center justify-end gap-2 border-t pt-3.5">
            {!isMobile && (
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {tCommon('cancel')}
              </Button>
            )}
            <Button
              type="submit"
              disabled={upsert.isPending}
              className={isMobile ? 'h-11 flex-1' : undefined}
            >
              {upsert.isPending ? tCommon('loading') : tCommon('save')}
            </Button>
          </div>
        </form>
      )}
    </ResponsiveDialog>
  );
}
