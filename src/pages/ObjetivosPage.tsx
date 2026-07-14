import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ProgressTabs } from './ProgressTabs';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Pencil, Plus, Target } from 'lucide-react';
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
import { PhaseHistoryBar } from '@/features/phases/components/PhaseHistoryBar';
import { PhaseRow } from '@/features/phases/components/PhaseRow';
import { isPhaseFrozen, phaseStatus } from '@/features/phases/status';
import type { Phase, PhaseInput } from '@/features/phases/api';
import {
  goalFormSchema,
  type GoalFormValues,
  type ParsedGoalForm,
} from '@/features/objetivos/schema';
import { isoDate } from '@/lib/dates';

type GoalForm = GoalFormValues;

/** Default target body-fat % when no goal is stored yet. */
const DEFAULT_TARGET_BF = 15;

/** The region the history bar expands, for `aria-controls`. */
const HISTORY_REGION_ID = 'phase-history-list';

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
  // History is collapsed by default. Local state on purpose: which phases you
  // are peeking at is a browsing detail, not something a URL should carry.
  const [historyOpen, setHistoryOpen] = useState(false);

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

  /**
   * Option-B grouping (the registered artboard): what is running, what is
   * scheduled, and what is over. `phaseStatus` is the feature's rule, not the
   * page's — the page only decides the reading order inside each group.
   */
  const groups = useMemo(() => {
    const all = phases.data ?? [];
    const byStartDesc = (a: Phase, b: Phase) => b.start_date.localeCompare(a.start_date);
    const byStartAsc = (a: Phase, b: Phase) => a.start_date.localeCompare(b.start_date);
    return {
      // Only one phase can be active (the DB's exclusion constraint), but the
      // list stays an array so a bad row never crashes the page.
      active: all.filter((p) => phaseStatus(p, today) === 'active').sort(byStartDesc),
      // Scheduled reads forwards: the one you start next comes first.
      upcoming: all.filter((p) => phaseStatus(p, today) === 'upcoming').sort(byStartAsc),
      // History reads backwards: the most recent phase first.
      past: all.filter((p) => phaseStatus(p, today) === 'past').sort(byStartDesc),
    };
  }, [phases.data, today]);

  const totalPhases =
    groups.active.length + groups.upcoming.length + groups.past.length;
  const phaseBusy = createPhase.isPending || updatePhase.isPending;

  function renderRow(phase: Phase) {
    return (
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
    );
  }

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
            <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {goal.data ? t('goal.edit') : t('goal.setGoal')}
          </Button>
        </div>

        <Card className="p-4 md:p-5">
          {goal.data ? (
            <div className="flex items-center gap-4">
              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-accent-line bg-accent-soft text-accent-ink"
                aria-hidden="true"
              >
                <Target className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <span className="text-cap-label">{t('goal.targetBf')}</span>
                <p className="tnum mt-0.5 text-[30px] font-semibold leading-none tracking-[-0.03em] md:text-[32px]">
                  {goal.data.target_body_fat_pct}
                  <span className="ml-1 text-base font-normal text-muted-foreground">%</span>
                </p>
              </div>
              {goal.data.notes && (
                <p className="ml-2 min-w-0 self-center border-l pl-4 text-xs text-text-dim">
                  {goal.data.notes}
                </p>
              )}
            </div>
          ) : (
            <p className="py-2 text-sm text-muted-foreground">{t('goal.noGoalHint')}</p>
          )}
        </Card>
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

        {phases.isLoading ? null : totalPhases === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-sm text-muted-foreground">{t('phases.empty')}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {groups.active.map(renderRow)}

            {/* ── Programadas: always expanded, above the history ── */}
            {groups.upcoming.length > 0 && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full border border-accent-line bg-accent-soft px-2 text-[10.5px] font-medium text-accent-ink">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                    {t('phases.scheduled.label')}
                  </span>
                  <span className="truncate text-xs font-medium text-muted-foreground">
                    {t('phases.scheduled.subtitle')}
                  </span>
                  <span className="h-px flex-1 bg-border" aria-hidden="true" />
                  <span className="tnum shrink-0 text-[11px] text-text-dim">
                    {t('phases.scheduled.count', { count: groups.upcoming.length })}
                  </span>
                </div>
                {groups.upcoming.map(renderRow)}
              </div>
            )}

            {/* ── Historial: collapsed behind the bar ── */}
            {groups.past.length > 0 && (
              <div className="space-y-3 pt-1">
                <PhaseHistoryBar
                  phases={groups.past}
                  open={historyOpen}
                  onToggle={() => setHistoryOpen((o) => !o)}
                  controls={HISTORY_REGION_ID}
                />
                {historyOpen && (
                  <div id={HISTORY_REGION_ID} className="space-y-3">
                    {groups.past.map(renderRow)}
                  </div>
                )}
              </div>
            )}
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
