import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useGoal, useUpsertGoal } from '@/features/objetivos/hooks';
import {
  useCreatePhase,
  useDeletePhase,
  usePhases,
  useUpdatePhase,
} from '@/features/phases/hooks';
import { PhaseDialog } from '@/features/phases/components/PhaseDialog';
import type { Phase, PhaseInput } from '@/features/phases/api';
import { formatDate, isoDate, type Locale } from '@/lib/dates';

type GoalForm = {
  target_body_fat_pct: number;
  notes: string;
};

function badgeCls(variant: 'primary' | 'secondary' | 'outline'): string {
  const base = 'inline-flex items-center text-xs px-1.5 py-0.5 rounded-md font-medium';
  if (variant === 'primary') return `${base} bg-primary text-primary-foreground`;
  if (variant === 'secondary') return `${base} bg-secondary text-secondary-foreground`;
  return `${base} border border-border text-muted-foreground`;
}

function phaseStatus(phase: Phase, today: string): 'active' | 'past' | 'upcoming' {
  if (phase.start_date > today) return 'upcoming';
  if (phase.end_date && phase.end_date < today) return 'past';
  return 'active';
}

export function ObjetivosPage() {
  const { t, i18n } = useTranslation('objetivos');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;
  const today = isoDate();

  // ── Goal ──────────────────────────────────────────────────────────────────
  const goal = useGoal();
  const upsertGoal = useUpsertGoal();
  const [goalOpen, setGoalOpen] = useState(false);

  const goalForm = useForm<GoalForm>({
    defaultValues: { target_body_fat_pct: 15, notes: '' },
  });

  function openGoalDialog() {
    goalForm.reset({
      target_body_fat_pct: goal.data?.target_body_fat_pct ?? 15,
      notes: goal.data?.notes ?? '',
    });
    setGoalOpen(true);
  }

  async function handleGoalSave(values: GoalForm) {
    await upsertGoal.mutateAsync({
      target_body_fat_pct: values.target_body_fat_pct,
      notes: values.notes || null,
    });
    setGoalOpen(false);
  }

  // ── Phases ─────────────────────────────────────────────────────────────────
  const phases = usePhases();
  const createPhase = useCreatePhase();
  const updatePhase = useUpdatePhase();
  const deletePhase = useDeletePhase();

  const [phaseOpen, setPhaseOpen] = useState(false);
  const [editingPhase, setEditingPhase] = useState<Phase | null>(null);

  function openNewPhase() {
    setEditingPhase(null);
    setPhaseOpen(true);
  }

  function openEditPhase(phase: Phase) {
    setEditingPhase(phase);
    setPhaseOpen(true);
  }

  async function handlePhaseSave(input: PhaseInput) {
    if (editingPhase) {
      await updatePhase.mutateAsync({ id: editingPhase.id, patch: input });
    } else {
      await createPhase.mutateAsync(input);
    }
  }

  async function handlePhaseDelete(phase: Phase) {
    if (!confirm(t('phases.deleteConfirm', { name: phase.name }))) return;
    await deletePhase.mutateAsync(phase.id);
  }

  const sortedPhases = useMemo(() => {
    const order = { active: 0, upcoming: 1, past: 2 };
    return [...(phases.data ?? [])].sort((a, b) => {
      const sa = phaseStatus(a, today);
      const sb = phaseStatus(b, today);
      return order[sa] - order[sb] || b.start_date.localeCompare(a.start_date);
    });
  }, [phases.data, today]);

  const phaseBusy = createPhase.isPending || updatePhase.isPending;

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">{t('pageTitle')}</h1>

      {/* ── Goal ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{t('goal.title')}</h2>
          <Button variant="outline" size="sm" onClick={openGoalDialog}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            {goal.data ? t('goal.edit') : t('goal.setGoal')}
          </Button>
        </div>

        {goal.data ? (
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start gap-6">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    {t('goal.targetBf')}
                  </p>
                  <p className="text-4xl font-bold tabular-nums">
                    {goal.data.target_body_fat_pct}
                    <span className="text-lg font-normal text-muted-foreground ml-1">%</span>
                  </p>
                </div>
                {goal.data.notes && (
                  <p className="text-sm text-muted-foreground border-l pl-5 py-1 self-center">
                    {goal.data.notes}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-6">
              <p className="text-sm text-muted-foreground">{t('goal.noGoalHint')}</p>
            </CardContent>
          </Card>
        )}
      </section>

      {/* ── Phases ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{t('phases.title')}</h2>
          <Button size="sm" onClick={openNewPhase}>
            <Plus className="h-4 w-4 mr-1" />
            {t('phases.new')}
          </Button>
        </div>

        {phases.isLoading ? null : sortedPhases.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-sm text-muted-foreground">{t('phases.empty')}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {sortedPhases.map((phase) => {
              const status = phaseStatus(phase, today);
              const isPast = status === 'past';
              return (
                <Card key={phase.id} className={isPast ? 'opacity-60' : undefined}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{phase.name}</span>
                          <span
                            className={badgeCls(
                              status === 'active'
                                ? 'primary'
                                : status === 'upcoming'
                                  ? 'secondary'
                                  : 'outline',
                            )}
                          >
                            {t(`phases.${status}`)}
                          </span>
                          <span className={badgeCls('secondary')}>
                            {t(`phases.type.${phase.phase_type}`)}
                          </span>
                        </div>

                        <p className="text-sm text-muted-foreground">
                          {formatDate(phase.start_date, 'd MMM yyyy', locale)}
                          {' → '}
                          {phase.end_date
                            ? formatDate(phase.end_date, 'd MMM yyyy', locale)
                            : '∞'}
                        </p>

                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
                          <span>
                            {phase.kcal_mode === 'absolute' && `${phase.kcal_value} kcal`}
                            {phase.kcal_mode === 'tdee_delta' &&
                              `${t('phases.summary.tdeePrefix')} ${phase.kcal_value > 0 ? '+' : ''}${phase.kcal_value} kcal`}
                          </span>
                          <span>
                            {phase.protein_g_per_kg} g/kg {t('phases.summary.protein')}
                          </span>
                          <span>
                            {Math.round(phase.fat_pct_of_kcal * 100)}% {t('phases.summary.fat')}
                          </span>
                          <span>
                            {phase.fiber_value}
                            {phase.fiber_mode === 'per_1000_kcal' ? 'g/1000kcal' : 'g'}{' '}
                            {t('phases.summary.fiber')}
                          </span>
                        </div>

                        {phase.notes && (
                          <p className="text-sm text-muted-foreground">{phase.notes}</p>
                        )}
                      </div>

                      {!isPast && (
                        <div className="flex gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditPhase(phase)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handlePhaseDelete(phase)}
                            disabled={deletePhase.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Goal dialog ── */}
      <Dialog open={goalOpen} onOpenChange={setGoalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('goal.dialog.title')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={goalForm.handleSubmit(handleGoalSave)} className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="goal-bf">{t('goal.dialog.targetBf')}</Label>
              <Input
                type="number"
                id="goal-bf"
                step="0.1"
                min="3"
                max="50"
                {...goalForm.register('target_body_fat_pct', {
                  valueAsNumber: true,
                  min: { value: 3, message: t('goal.errors.targetBf') },
                  max: { value: 50, message: t('goal.errors.targetBf') },
                  required: true,
                })}
              />
              {goalForm.formState.errors.target_body_fat_pct && (
                <p className="text-xs text-destructive">{t('goal.errors.targetBf')}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-notes">{t('goal.dialog.notes')}</Label>
              <Controller
                control={goalForm.control}
                name="notes"
                render={({ field }) => <Textarea id="goal-notes" rows={2} {...field} />}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={upsertGoal.isPending}>
                {t('goal.dialog.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Phase dialog ── */}
      <PhaseDialog
        open={phaseOpen}
        onOpenChange={setPhaseOpen}
        phase={editingPhase}
        onSave={handlePhaseSave}
        busy={phaseBusy}
      />
    </div>
  );
}
