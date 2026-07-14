import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ProgressTabs } from './ProgressTabs';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageShell } from '@/components/layout/PageShell';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { NumberField } from '@/components/ui/NumberField';
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
import { PhaseHeroCard } from '@/features/phases/components/PhaseHeroCard';
import { PhaseRow } from '@/features/phases/components/PhaseRow';
import type { Phase, PhaseInput } from '@/features/phases/api';
import {
  goalFormSchema,
  type GoalFormValues,
  type ParsedGoalForm,
} from '@/features/objetivos/schema';
import { daysBetween, isoDate } from '@/lib/dates';

type GoalForm = GoalFormValues;

/** Default target body-fat % when no goal is stored yet. */
const DEFAULT_TARGET_BF = 15;

function phaseStatus(phase: Phase, today: string): 'active' | 'past' | 'upcoming' {
  if (phase.start_date > today) return 'upcoming';
  if (phase.end_date && phase.end_date < today) return 'past';
  return 'active';
}

/**
 * Grace window after a phase's `end_date` during which it stays fully
 * editable and deletable. Past phases are computationally inert (no code
 * reconstructs which phase was active on a historical date — see D-A5), so
 * the freeze is a UX stance ("history is closed"), not a data invariant.
 * That justifies a forgiving late-correction window before the card freezes.
 */
const PHASE_EDIT_GRACE_DAYS = 7;

/**
 * A phase is frozen only once it ended more than PHASE_EDIT_GRACE_DAYS ago.
 * Frozen → edit/delete affordances hidden + card dimmed. The status badge
 * stays `end_date`-based (a frozen phase still reads "past"); only the
 * freeze/dim is grace-based. Notes stay editable forever regardless (D-A5).
 */
function isPhaseFrozen(phase: Phase, today: string): boolean {
  if (!phase.end_date || phase.end_date >= today) return false;
  return daysBetween(phase.end_date, today) > PHASE_EDIT_GRACE_DAYS;
}

export function ObjetivosPage() {
  const { t } = useTranslation('objetivos');
  const today = isoDate();

  // ── Goal ──────────────────────────────────────────────────────────────────
  const goal = useGoal();
  const upsertGoal = useUpsertGoal();
  const [goalOpen, setGoalOpen] = useState(false);

  const goalForm = useForm<GoalForm, unknown, ParsedGoalForm>({
    resolver: zodResolver(goalFormSchema),
    // The field is a `NumberField` (`type="text"`), so the form holds its raw
    // string; the schema parses it. Prefill stays point-decimal `String(n)`.
    defaultValues: { target_body_fat_pct: String(DEFAULT_TARGET_BF), notes: '' },
  });

  function openGoalDialog() {
    goalForm.reset({
      target_body_fat_pct: String(goal.data?.target_body_fat_pct ?? DEFAULT_TARGET_BF),
      notes: goal.data?.notes ?? '',
    });
    setGoalOpen(true);
  }

  async function handleGoalSave(values: ParsedGoalForm) {
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
  // Notes-only mode: used for frozen (post-grace) phases — every field but
  // `notes` is read-only in the dialog (D-A5: notes editable forever).
  const [notesOnly, setNotesOnly] = useState(false);

  function openNewPhase() {
    setEditingPhase(null);
    setNotesOnly(false);
    setPhaseOpen(true);
  }

  function openEditPhase(phase: Phase) {
    setEditingPhase(phase);
    setNotesOnly(false);
    setPhaseOpen(true);
  }

  function openNotesEditor(phase: Phase) {
    setEditingPhase(phase);
    setNotesOnly(true);
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
    <PageShell title={t('pageTitle')} back="/progress">
    <div className="space-y-8">
      <ProgressTabs />

      {/* ── Active phase hero ── */}
      <PhaseHeroCard onEdit={openEditPhase} />

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
            {sortedPhases.map((phase) => (
              <PhaseRow
                key={phase.id}
                phase={phase}
                status={phaseStatus(phase, today)}
                frozen={isPhaseFrozen(phase, today)}
                onEdit={openEditPhase}
                onEditNotes={openNotesEditor}
                onDelete={(p) => void handlePhaseDelete(p)}
                deleting={deletePhase.isPending}
              />
            ))}
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
              <NumberField
                id="goal-bf"
                {...goalForm.register('target_body_fat_pct')}
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
        notesOnly={notesOnly}
      />
    </div>
    </PageShell>
  );
}
