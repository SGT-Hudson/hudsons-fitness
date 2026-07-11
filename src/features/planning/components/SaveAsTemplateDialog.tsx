import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhasePicker } from '@/components/ui/PhasePicker';
import {
  TemplateCard,
  type TemplateCardPreviewItem,
} from '@/features/templates/components/TemplateCard';
import { toFilledGrid } from '@/features/templates/filledGrid';
import type { TemplatePhase } from '@/features/templates/api';
import {
  saveAsTemplateFormSchema,
  type SaveAsTemplateFormValues,
} from '../schema';
import { previewMealTimes, type PreviewSlot } from '../templatePreview';
import { formatDate, type Locale } from '@/lib/dates';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekStart: string;
  /**
   * The week's slots, reduced to `{ day_of_week, meal_index, meal_time }`. The
   * preview's meal times are derived from them exactly as the RPC does — the
   * week's own `meal_times` (the source template's) would misreport the card.
   */
  slots: PreviewSlot[];
  /**
   * The user's currently active phase (from `useDailyTarget`), offered as the
   * picker's default — a sensible starting point, not a value baked into the
   * data. The user is free to change it, including clearing it to "sin fase".
   */
  activePhase: TemplatePhase | null;
  onSave: (name: string, phaseType: TemplatePhase | null) => Promise<void>;
  busy?: boolean;
}

export function SaveAsTemplateDialog({
  open,
  onOpenChange,
  weekStart,
  slots,
  activePhase,
  onSave,
  busy,
}: Props) {
  const { t, i18n } = useTranslation('planning');
  const { t: tCommon } = useTranslation('common');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<TemplatePhase | null>(activePhase);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<SaveAsTemplateFormValues>({
    resolver: zodResolver(saveAsTemplateFormSchema),
    defaultValues: { name: '' },
  });

  useEffect(() => {
    if (open) {
      const suggestion = t('save.defaultName', {
        date: formatDate(weekStart, 'd MMM yyyy', locale),
      });
      reset({ name: suggestion });
      setPhase(activePhase);
      setError(null);
    }
  }, [open, weekStart, t, locale, reset, activePhase]);

  async function onValid(values: SaveAsTemplateFormValues) {
    setError(null);
    try {
      await onSave(values.name.trim(), phase);
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // Parity: prior code showed t('save.errors.nameRequired') on blank name.
  const nameError = errors.name ? t('save.errors.nameRequired') : null;

  const name = watch('name');
  // What `save_week_as_template` will actually store as the template's
  // default_meal_times — the preview promises exactly the card it will create.
  const mealTimes = previewMealTimes(slots);
  const filled = toFilledGrid(slots, mealTimes.length);
  // Not a real template yet: no id, and the card is drawn non-interactively —
  // it has nothing to link to, edit or delete.
  const previewTemplate: TemplateCardPreviewItem = {
    name: name?.trim() || t('save.name'),
    phase_type: phase,
    default_meal_times: mealTimes,
    slot_count: slots.length,
    updated_at: new Date().toISOString(),
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('save.title')}
      variant="centered"
    >
      {({ isMobile }) => (
        <form onSubmit={handleSubmit(onValid)} className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">{t('save.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('save.subtitle')}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="save-tpl-name">{t('save.name')}</Label>
            <Input id="save-tpl-name" {...register('name')} />
          </div>

          <div className="space-y-2">
            <Label>{t('phase.pick')}</Label>
            <PhasePicker value={phase} onChange={setPhase} />
          </div>

          {(nameError || error) && (
            <p className="text-sm text-destructive">{nameError ?? error}</p>
          )}

          <div className="space-y-2">
            <Label>{t('save.previewLabel')}</Label>
            {/* A picture of the card being created: `interactive={false}` keeps
                its dead Link/edit/delete out of the DOM entirely, so there is
                nothing to hide from the mouse, the tab order or the a11y tree. */}
            <div data-testid="save-template-preview">
              <TemplateCard template={previewTemplate} filled={filled} interactive={false} />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? tCommon('loading') : tCommon('save')}
          </Button>

          {/* Desktop's DialogContent draws its own X; vaul's drawer draws none,
              so mobile would otherwise only be dismissible by dragging it. */}
          {isMobile && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => onOpenChange(false)}
            >
              {tCommon('cancel')}
            </Button>
          )}
        </form>
      )}
    </ResponsiveDialog>
  );
}
