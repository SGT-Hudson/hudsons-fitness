import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
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
import { NumberField } from '@/components/ui/NumberField';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { parseDecimalInput } from '@/lib/number';
import {
  EQUIPMENT_VALUES,
  suggestIncrementForEquipment,
  type Equipment,
  type Exercise,
  type PrimaryMuscle,
  type SecondaryMuscle,
} from '../exercises/api';
import { useCreateExercise } from '../exercises/hooks';
import { MuscleTagField } from './MuscleTagField';

const SENTINEL_NONE = '__none__';

const formSchema = z.object({
  name_es: z.string().trim().min(1),
  name_en: z.string().trim().optional().transform((v) => (v && v.length > 0 ? v : null)),
  primary_muscles: z.array(z.string()).optional().transform((v) => v ?? []),
  secondary_muscles: z
    .array(z.string())
    .optional()
    .transform((v) => v ?? []),
  equipment: z.string().optional().transform((v) => (v && v !== SENTINEL_NONE ? v : null)),
  default_increment_kg: z
    .string()
    .optional()
    .transform((v) => {
      if (!v || v.trim() === '') return null;
      // DB CHECK: `default_increment_kg is null or default_increment_kg > 0`,
      // so 0 / negatives / non-numeric all collapse to null (bodyweight
      // exercises use null per the system seed pattern).
      //
      // This field was the app's ONLY comma-aware input — a one-off
      // `Number(v.replace(',', '.'))` that only ever replaced the first comma.
      // Its behaviour is what `parseDecimalInput` generalises, so it now calls
      // the shared boundary instead of being a special case.
      const n = parseDecimalInput(v);
      return n !== null && n > 0 ? n : null;
    }),
});

// zod transforms make the input shape (what the form fields contain
// at typing-time, mostly `string | undefined`) and the output shape
// (post-validation, e.g. `string | null` or `number | null`) diverge.
// RHF's resolver typing needs both spelled out via z.input / z.output.
type FormIn = z.input<typeof formSchema>;
type FormOut = z.output<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName?: string;
  onCreated?: (exercise: Exercise) => void;
}

export function ExerciseDialog({ open, onOpenChange, defaultName, onCreated }: Props) {
  const { t } = useTranslation('entrenamiento');
  const { t: tCommon } = useTranslation('common');
  const create = useCreateExercise();
  const [error, setError] = useState<string | null>(null);
  const [incrementTouched, setIncrementTouched] = useState(false);

  const {
    handleSubmit,
    register,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name_es: '',
      name_en: '',
      primary_muscles: [],
      secondary_muscles: [],
      equipment: SENTINEL_NONE,
      default_increment_kg: '',
    },
  });

  const equipment = watch('equipment');
  const incrementValue = watch('default_increment_kg');

  useEffect(() => {
    if (!open) return;
    setError(null);
    setIncrementTouched(false);
    reset({
      name_es: defaultName?.trim() ?? '',
      name_en: '',
      primary_muscles: [],
      secondary_muscles: [],
      equipment: SENTINEL_NONE,
      default_increment_kg: '',
    });
  }, [open, defaultName, reset]);

  // Auto-suggest default_increment_kg from equipment unless the user has
  // already typed in the increment field. Matches spec §0.14.
  useEffect(() => {
    if (incrementTouched) return;
    if (!equipment || equipment === SENTINEL_NONE) {
      setValue('default_increment_kg', '');
      return;
    }
    const suggested = suggestIncrementForEquipment(equipment as Equipment);
    setValue('default_increment_kg', suggested === 0 ? '' : String(suggested));
  }, [equipment, incrementTouched, setValue]);

  const submitting = create.isPending;

  async function onValid(values: FormOut) {
    setError(null);
    try {
      const saved = await create.mutateAsync({
        name_es: values.name_es,
        name_en: values.name_en,
        primary_muscles: values.primary_muscles as PrimaryMuscle[],
        secondary_muscles: values.secondary_muscles as SecondaryMuscle[],
        equipment: values.equipment as Equipment | null,
        default_increment_kg: values.default_increment_kg,
      });
      onCreated?.(saved);
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('exerciseDialog.title')}</DialogTitle>
          <DialogDescription>{t('exerciseDialog.subtitle')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onValid)} className="space-y-4">
          <p className="text-xs text-muted-foreground rounded-md border border-dashed p-2">
            {t('exerciseDialog.libraryHint')}
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="ex-name-es">{t('exerciseDialog.fields.nameEs')}</Label>
            <Input
              id="ex-name-es"
              {...register('name_es')}
              placeholder={t('exerciseDialog.fields.nameEsPlaceholder')}
            />
            {errors.name_es && (
              <p className="text-xs text-destructive">{t('exerciseDialog.errors.nameEsRequired')}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ex-name-en">{t('exerciseDialog.fields.nameEn')}</Label>
            <Input
              id="ex-name-en"
              {...register('name_en')}
              placeholder={t('exerciseDialog.fields.nameEnPlaceholder')}
            />
            <p className="text-xs text-muted-foreground">{t('exerciseDialog.fields.namesHelp')}</p>
          </div>

          <MuscleTagField
            value={{
              primary: watch('primary_muscles') ?? [],
              secondary: watch('secondary_muscles') ?? [],
            }}
            onChange={(next) => {
              setValue('primary_muscles', next.primary, { shouldDirty: true });
              setValue('secondary_muscles', next.secondary, { shouldDirty: true });
            }}
          />

          <div className="space-y-1.5">
            <Label htmlFor="ex-equipment">{t('exerciseDialog.fields.equipment')}</Label>
            <Select
              value={equipment || SENTINEL_NONE}
              onValueChange={(v) => setValue('equipment', v)}
            >
              <SelectTrigger id="ex-equipment">
                <SelectValue placeholder={t('exerciseDialog.fields.equipmentPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SENTINEL_NONE}>
                  {t('exerciseDialog.fields.equipmentNone')}
                </SelectItem>
                {EQUIPMENT_VALUES.map((e) => (
                  <SelectItem key={e} value={e}>
                    {t(`exerciseDialog.equipment.${e}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ex-increment">{t('exerciseDialog.fields.defaultIncrementKg')}</Label>
            <NumberField
              id="ex-increment"
              {...register('default_increment_kg')}
              value={incrementValue}
              onChange={(e) => {
                setIncrementTouched(true);
                setValue('default_increment_kg', e.target.value);
              }}
              placeholder="2.5"
            />
            <p className="text-xs text-muted-foreground">
              {t('exerciseDialog.fields.defaultIncrementKgHelp')}
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? tCommon('loading') : tCommon('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
