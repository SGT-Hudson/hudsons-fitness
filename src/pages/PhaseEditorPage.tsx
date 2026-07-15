import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/layout/PageShell';
import {
  PhaseEditorForm,
  PHASE_EDITOR_FORM_ID,
  type PhaseSubmitError,
} from '@/features/phases/components/PhaseEditorForm';
import { PhasePreview } from '@/features/phases/components/PhasePreview';
import {
  useCreatePhase,
  useDeletePhase,
  usePhases,
  useUpdatePhase,
} from '@/features/phases/hooks';
import { useLatestMeasurement } from '@/features/measurements/hooks';
import { useLatestTdee } from '@/features/tdee/hooks';
import { isPhaseOverlapError, type PhaseInput } from '@/features/phases/api';
import { OBJETIVOS_LIST } from '@/features/phases/editorRoute';
import { isPhaseFrozen } from '@/features/phases/status';
import { isoDate } from '@/lib/dates';

/**
 * The phase editor as a PAGE — one component behind two routes
 * (`/progress/goals/phases/new`, `/progress/goals/phases/:id/edit`), replacing
 * the `PhaseDialog` modal. Same division of labour as `RecetaEditorPage` /
 * `IngredientEditorPage`: the page owns the params, the row, the guard, the
 * mutations and where you land; `PhaseEditorForm` owns the fields, and the save
 * button sits in the header and submits it by `form={PHASE_EDITOR_FORM_ID}`.
 *
 * `PageShell` renders a `BackHeader` here (a `back` is passed) — and BackHeader
 * DOES pass `actions` through on mobile, unlike a root page's `MobileTopBar`.
 * So the header save works on both breakpoints and is NOT re-created in the body.
 */
export function PhaseEditorPage() {
  const { id } = useParams<{ id?: string }>();
  const isNew = !id;
  const navigate = useNavigate();
  const { t } = useTranslation('objetivos');
  const { t: tCommon } = useTranslation('common');

  // The row comes off the LIST query, not a per-row fetch: `/progress/goals`
  // has already loaded it (this route is only reachable from there), the table
  // is tiny, and it keeps the editor and the list reading the exact same object
  // — one cache entry, one invalidation.
  const phases = usePhases();
  const phase = isNew ? undefined : phases.data?.find((p) => p.id === id);

  // The preview's wiring — the same three inputs `useDailyTarget` feeds the
  // hero: latest scale weight, latest body fat, latest TDEE estimate.
  const latestMeasurement = useLatestMeasurement();
  const latestTdee = useLatestTdee();

  const createPhase = useCreatePhase();
  const updatePhase = useUpdatePhase();
  const deletePhase = useDeletePhase();
  const [submitError, setSubmitError] = useState<PhaseSubmitError | null>(null);

  const today = isoDate();
  // R-02 as a PAGE MODE, not a prop the caller may forget: a phase frozen past
  // the grace window is notes-only because the freeze RULE says so, wherever the
  // user came from (the row's "editar notas", a bookmark, a typed URL).
  const notesOnly = !!phase && isPhaseFrozen(phase, today);

  if (!isNew && phases.isLoading) {
    return <div className="text-muted-foreground">{tCommon('loading')}</div>;
  }
  // No row behind the id: the fetch failed, the phase was deleted, or the query
  // is paused (offline). Falling through would mount a CREATE form at an edit
  // URL, whose save would INSERT a second phase instead of updating the one the
  // user opened — and, with an exclusion constraint on the dates, that insert
  // would then collide with the very phase it was meant to edit.
  if (!isNew && !phase) {
    return <Navigate to={OBJETIVOS_LIST} replace />;
  }

  const busy = createPhase.isPending || updatePhase.isPending;

  async function handleSubmit(input: PhaseInput) {
    setSubmitError(null);
    try {
      if (phase) {
        await updatePhase.mutateAsync({ id: phase.id, patch: input });
      } else {
        await createPhase.mutateAsync(input);
      }
      navigate(OBJETIVOS_LIST, { replace: true });
    } catch (err) {
      // The bug this wave owes (spec §2). `PhaseDialog` awaited the rejected
      // promise and did nothing with it: the dialog sat there, said nothing, and
      // the rejection escaped unhandled — the user was simply stuck. A save that
      // failed must SAY SO, and an overlap must say WHY.
      setSubmitError(
        isPhaseOverlapError(err)
          ? { kind: 'overlap' }
          : { kind: 'unknown', message: errorMessage(err) ?? tCommon('errors.generic') },
      );
    }
  }

  async function handleDelete() {
    if (!phase) return;
    if (!confirm(t('phases.deleteConfirm', { name: phase.name }))) return;
    try {
      await deletePhase.mutateAsync(phase.id);
      navigate(OBJETIVOS_LIST, { replace: true });
    } catch {
      // `useDeletePhase` already toasted it; stay in the editor.
    }
  }

  const title = notesOnly
    ? t('phases.form.notesOnlyTitle')
    : isNew
      ? t('phases.form.newTitle')
      : t('phases.form.editTitle');

  const actions = (
    <>
      {phase && !notesOnly && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void handleDelete()}
          disabled={deletePhase.isPending}
          className="hidden border-danger-line text-danger-ink hover:bg-danger-soft md:inline-flex"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {t('phases.delete')}
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => navigate(OBJETIVOS_LIST)}
        className="hidden md:inline-flex"
      >
        {tCommon('cancel')}
      </Button>
      <Button
        type="submit"
        form={PHASE_EDITOR_FORM_ID}
        size="sm"
        disabled={busy}
        className="md:h-9 md:px-3.5"
      >
        <Save className="h-4 w-4" aria-hidden="true" />
        {busy ? tCommon('loading') : tCommon('save')}
      </Button>
    </>
  );

  return (
    <PageShell title={title} subtitle={isNew ? undefined : phase?.name} actions={actions} back={OBJETIVOS_LIST}>
      <div className="space-y-3 md:space-y-3.5">
        <PhaseEditorForm
          // A different phase is a different mount, so the mount-time seed
          // re-runs. (Nothing in the UI navigates edit → edit, but a remount is
          // the only thing that keeps that from silently showing phase A's
          // values under phase B's id.)
          key={phase?.id ?? 'new'}
          phase={phase}
          notesOnly={notesOnly}
          submitError={submitError}
          onSubmit={(input) => void handleSubmit(input)}
          // B2 — the live phase-tinted preview. Hidden in notes-only mode: a
          // frozen phase's targets are history, and today's weight would
          // repaint them as if they were live.
          preview={
            notesOnly
              ? undefined
              : (draft) => (
                  <PhasePreview
                    draft={draft}
                    weightKg={latestMeasurement.data?.weight_kg}
                    bodyFatPct={latestMeasurement.data?.body_fat_pct}
                    estimatedTdeeKcal={latestTdee.data?.estimated_tdee_kcal ?? null}
                  />
                )
          }
        />

        {/* Mobile's danger action — desktop's lives in the header (the wave-5
            editor's division of labour). */}
        {phase && !notesOnly && (
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleDelete()}
            disabled={deletePhase.isPending}
            className="h-11 w-full rounded-[13px] border-danger-line text-danger-ink hover:bg-danger-soft md:hidden"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {t('phases.delete')}
          </Button>
        )}
      </div>
    </PageShell>
  );
}

/**
 * PostgREST rejects with a plain object (`{ code, message, … }`), not an
 * `Error` — so `(err as Error).message` is not safe to assume. Reads a message
 * off either shape; the caller falls back to the generic copy when there is none.
 */
function errorMessage(err: unknown): string | null {
  if (err instanceof Error) return err.message || null;
  if (typeof err === 'object' && err !== null) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return null;
}
