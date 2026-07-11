import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PhaseChip } from '@/components/ui/PhaseChip';
import { cn } from '@/lib/utils';
import { formatDate, type Locale } from '@/lib/dates';
import type { TemplateListItem, TemplatePhase } from '../api';
import { TemplateDotGrid } from './TemplateDotGrid';

/** Phase → the card's top strip. Untagged templates get the neutral strip. */
const PHASE_STRIP: Record<TemplatePhase, string> = {
  cut: 'bg-phase-cut',
  bulk: 'bg-phase-bulk',
  maintenance: 'bg-phase-maint',
};

/** Everything the card draws — a `TemplateListItem` satisfies it. */
export type TemplateCardItem = Pick<
  TemplateListItem,
  'id' | 'name' | 'phase_type' | 'default_meal_times' | 'slot_count' | 'updated_at'
>;

/** The same card for a template that does not exist yet — hence no `id`. */
export type TemplateCardPreviewItem = Omit<TemplateCardItem, 'id'>;

interface BaseProps {
  /** `filled[dayOfWeek][mealIndex]` — build it with `toFilledGrid`. */
  filled: boolean[][];
  className?: string;
}

interface InteractiveProps extends BaseProps {
  template: TemplateCardItem;
  interactive?: true;
  onDelete: () => void;
}

interface PreviewProps extends BaseProps {
  template: TemplateCardPreviewItem;
  interactive: false;
  onDelete?: never;
}

type Props = InteractiveProps | PreviewProps;

/**
 * Library card (canvas `TemplateCardPhase`): a phase-coloured top strip, the
 * name + phase chip, the week dot-grid, and a footer with the counts, the last
 * edit and the edit/delete affordances.
 *
 * `phase_type` is nullable and null is first-class: an untagged template renders
 * with no chip and no tint — never with the user's active phase.
 *
 * `interactive={false}` draws the same card as a picture (the save-as-template
 * preview): the name is plain text and the edit/delete row is gone. The card
 * has no template to link to or delete yet, and a dead control that is still
 * keyboard-reachable is worse than no control — `pointer-events-none` stops the
 * mouse but not Tab + Enter.
 */
export function TemplateCard(props: Props) {
  const { template, filled, className } = props;
  const { t, i18n } = useTranslation('planning');
  const { t: tCommon } = useTranslation('common');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;
  const phase = template.phase_type;
  const mealCount = template.default_meal_times.length;

  return (
    <Card
      data-template-card={props.interactive === false ? undefined : props.template.id}
      className={cn('flex h-full flex-col overflow-hidden transition-shadow hover:shadow-md', className)}
    >
      <div
        data-phase-strip={phase ?? 'none'}
        className={cn('h-1.5 shrink-0', phase ? PHASE_STRIP[phase] : 'bg-border')}
      />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          {props.interactive === false ? (
            <span className="min-w-0 truncate text-sm font-semibold leading-tight">
              {template.name}
            </span>
          ) : (
            <Link
              to={`/templates/${props.template.id}`}
              className="min-w-0 truncate text-sm font-semibold leading-tight hover:underline"
            >
              {template.name}
            </Link>
          )}
          {phase && <PhaseChip phase={phase} />}
        </div>

        <TemplateDotGrid mealCount={mealCount} filled={filled} phase={phase} className="py-1" />

        <div className="mt-auto flex items-center justify-between gap-2 border-t pt-2.5">
          <div className="min-w-0 text-[11px] text-muted-foreground">
            <div className="tnum truncate">
              {t('list.slots', { count: template.slot_count })}
              {mealCount > 0 && <> · {t('list.meals', { count: mealCount })}</>}
            </div>
            <div className="tnum truncate">
              {t('list.updated', {
                date: formatDate(template.updated_at, 'd MMM yyyy', locale),
              })}
            </div>
          </div>
          {props.interactive !== false && (
            <div className="flex shrink-0 gap-0.5">
              <Button asChild variant="ghost" size="icon" aria-label={tCommon('edit')}>
                <Link to={`/templates/${props.template.id}`}>
                  <Pencil className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={tCommon('delete')}
                onClick={props.onDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
