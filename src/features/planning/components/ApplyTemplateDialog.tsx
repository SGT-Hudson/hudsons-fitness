import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, parseISO } from 'date-fns';
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PhaseChip } from '@/components/ui/PhaseChip';
import { cn } from '@/lib/utils';
import { useTemplates } from '@/features/templates/hooks';
import { formatDate, isoDate, mondayOf, type Locale } from '@/lib/dates';
import { WeekStrip, type WeekStripDay } from './WeekStrip';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetDate: string;
  onApply: (templateId: string) => Promise<void>;
  busy?: boolean;
}

/**
 * The apply-confirm. Two things it must get right:
 *
 * 1. Which template — shown with its phase (`PhaseChip`), because a bulk
 *    template dropped onto a cut week is the mistake this dialog exists to
 *    prevent. A template with no phase shows no chip: `phase_type` is nullable
 *    and "no phase" is a real answer, never guessed at.
 * 2. Which days it overwrites. `apply_template_to_week` computes the Monday of
 *    the week containing `p_target_date`, deletes that week's slots from
 *    `p_target_date` onward and refills through the Sunday of the SAME week. It
 *    never touches next week and never touches days earlier in the week. The
 *    strip draws exactly that — this week only, earlier days locked.
 */
export function ApplyTemplateDialog({
  open,
  onOpenChange,
  targetDate,
  onApply,
  busy,
}: Props) {
  const { t, i18n } = useTranslation('planning');
  const { t: tCommon } = useTranslation('common');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;
  const templates = useTemplates();
  const [templateId, setTemplateId] = useState<string>('');
  const [pickError, setPickError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTemplateId('');
      setPickError(false);
      setError(null);
    }
  }, [open]);

  const days = useMemo<WeekStripDay[]>(() => {
    const monday = mondayOf(parseISO(targetDate));
    const today = isoDate();
    return Array.from({ length: 7 }, (_, i) => {
      const date = isoDate(addDays(monday, i));
      return { date, isToday: date === today };
    });
  }, [targetDate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!templateId) {
      setPickError(true);
      return;
    }
    setError(null);
    try {
      await onApply(templateId);
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const list = templates.data ?? [];

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('apply.title')}
      variant="centered"
    >
      {({ isMobile }) => (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">{t('apply.title')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('apply.subtitle', { date: formatDate(targetDate, 'd MMM yyyy', locale) })}
            </p>
          </div>

          <div className="space-y-2">
            <Label>{t('apply.template')}</Label>
            {list.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('apply.noTemplates')}</p>
            ) : (
              <div
                role="radiogroup"
                aria-label={t('apply.template')}
                className="max-h-56 space-y-2 overflow-y-auto"
              >
                {list.map((tpl) => {
                  const checked = tpl.id === templateId;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      data-template={tpl.id}
                      onClick={() => {
                        setTemplateId(tpl.id);
                        setPickError(false);
                      }}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-xl border p-3 text-left transition-colors',
                        checked
                          ? 'border-accent-line bg-accent-soft'
                          : 'border-border bg-card hover:bg-muted',
                      )}
                    >
                      <span className="min-w-0 truncate text-sm font-medium">{tpl.name}</span>
                      {/* No chip for an untagged template — never guess a phase. */}
                      {tpl.phase_type && <PhaseChip phase={tpl.phase_type} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>{t('apply.willFillLabel')}</Label>
            <WeekStrip variant="fill" days={days} fillFrom={targetDate} />
            <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
                {t('weekStrip.willFill')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/30" aria-hidden="true" />
                {t('weekStrip.untouched')}
              </span>
            </div>
          </div>

          {(pickError || error) && (
            <p className="text-sm text-destructive">
              {pickError ? t('apply.errors.pickTemplate') : error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? tCommon('loading') : t('apply.submit')}
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
