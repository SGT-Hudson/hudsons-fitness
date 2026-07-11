import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CHIP_TONE } from '@/components/ui/PhaseChip';
import { PageShell } from '@/components/layout/PageShell';
import { TemplateCard } from '@/features/templates/components/TemplateCard';
import { toFilledGrid } from '@/features/templates/filledGrid';
import { useDeleteTemplate, useTemplates } from '@/features/templates/hooks';
import type { TemplatePhase } from '@/features/templates/api';
import { cn } from '@/lib/utils';

const PHASES: TemplatePhase[] = ['cut', 'bulk', 'maintenance'];
type Filter = TemplatePhase | 'all';

const RING_TONE: Record<TemplatePhase, string> = {
  cut: 'ring-phase-cut',
  bulk: 'ring-phase-bulk',
  maintenance: 'ring-phase-maint',
};

export function PlantillasPage() {
  const { t } = useTranslation('planning');
  const { t: tObjetivos } = useTranslation('objetivos');
  const navigate = useNavigate();
  const templates = useTemplates();
  const del = useDeleteTemplate();
  const [filter, setFilter] = useState<Filter>('all');

  const all = useMemo(() => templates.data ?? [], [templates.data]);
  // Untagged templates carry no phase, so they only ever show under "Todas".
  const shown = useMemo(
    () => (filter === 'all' ? all : all.filter((tpl) => tpl.phase_type === filter)),
    [all, filter],
  );

  function handleDelete(id: string, name: string) {
    if (!window.confirm(t('list.deleteConfirm', { name }))) return;
    del.mutate(id);
  }

  return (
    <PageShell
      title={t('list.pageTitle')}
      subtitle={all.length > 0 ? t('list.saved', { count: all.length }) : undefined}
      back={true}
      actions={
        <Button onClick={() => navigate('/templates/new')}>
          <Plus className="h-4 w-4" />
          {t('list.newTemplate')}
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('list.description')}</p>

        {templates.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="space-y-2 py-4">
                  <Skeleton className="h-5 w-1/2" />
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : all.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              {t('list.empty')}
            </CardContent>
          </Card>
        ) : (
          <>
            <div role="radiogroup" aria-label={t('list.filterLabel')} className="flex flex-wrap gap-2">
              <button
                type="button"
                role="radio"
                aria-checked={filter === 'all'}
                onClick={() => setFilter('all')}
                className={cn(
                  'rounded-full border border-border bg-muted px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors',
                  filter === 'all'
                    ? 'ring-2 ring-ring ring-offset-1 ring-offset-background'
                    : 'opacity-60',
                )}
              >
                {t('list.filterAll')}
              </button>
              {PHASES.map((phase) => (
                <button
                  key={phase}
                  type="button"
                  role="radio"
                  aria-checked={filter === phase}
                  onClick={() => setFilter(phase)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors',
                    CHIP_TONE[phase],
                    filter === phase
                      ? cn('ring-2 ring-offset-1 ring-offset-background', RING_TONE[phase])
                      : 'opacity-60',
                  )}
                >
                  {tObjetivos(`phases.type.${phase}`)}
                </button>
              ))}
            </div>

            {shown.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  {t('list.emptyFilter')}
                </CardContent>
              </Card>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {shown.map((tpl) => (
                  <li key={tpl.id} className="min-h-[196px]">
                    <TemplateCard
                      template={tpl}
                      filled={toFilledGrid(tpl.slots, tpl.default_meal_times.length)}
                      onDelete={() => handleDelete(tpl.id, tpl.name)}
                    />
                  </li>
                ))}
                <li className="min-h-[196px]">
                  <Link
                    to="/templates/new"
                    className="flex h-full min-h-[196px] flex-col items-center justify-center gap-2.5 rounded-lg border-[1.5px] border-dashed bg-muted/40 text-muted-foreground transition-colors hover:bg-muted"
                  >
                    <span className="grid h-10 w-10 place-items-center rounded-xl border bg-card text-primary">
                      <Plus className="h-5 w-5" />
                    </span>
                    <span className="text-[13.5px] font-semibold">{t('list.newTemplate')}</span>
                    <span className="text-[11.5px]">{t('list.newTemplateHint')}</span>
                  </Link>
                </li>
              </ul>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}
