import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageShell } from '@/components/layout/PageShell';
import { useRoutines, useDeleteRoutine } from '@/features/training/routines/hooks';
import { usePrograms, useDeleteProgram, useSetActiveProgram } from '@/features/training/programs/hooks';
import { todayInTZ } from '@/lib/dates';

export function RoutinePage() {
  const { t } = useTranslation('entrenamiento');
  const navigate = useNavigate();
  const routines = useRoutines();
  const programs = usePrograms();
  const deleteRoutine = useDeleteRoutine();
  const deleteProgram = useDeleteProgram();
  const setActive = useSetActiveProgram();

  // Local state for the activate anchor date prompt
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [anchorDate, setAnchorDate] = useState<string>(todayInTZ());

  function handleActivate(programId: string) {
    setActivatingId(programId);
    setAnchorDate(todayInTZ());
  }

  function confirmActivate() {
    if (!activatingId) return;
    setActive.mutate({ programId: activatingId, anchorDateISO: anchorDate });
    setActivatingId(null);
  }

  return (
    <PageShell title={t('routine.pageTitle')}>
    <div className="space-y-4">
      <Tabs defaultValue="routines">
        <TabsList>
          <TabsTrigger value="routines">{t('tabs.routines')}</TabsTrigger>
          <TabsTrigger value="programs">{t('tabs.programs')}</TabsTrigger>
        </TabsList>

        {/* ── Rutinas tab ── */}
        <TabsContent value="routines" className="space-y-3 pt-2">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => navigate('/routine/rutinas/nueva')}>
              <Plus className="h-4 w-4 mr-1" />
              {t('routine.create')}
            </Button>
          </div>

          {routines.data && routines.data.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('routine.listEmpty')}</p>
          )}

          <div className="space-y-2">
            {(routines.data ?? []).map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-lg border bg-card px-4 py-3"
              >
                <button
                  className="flex flex-col items-start gap-0.5 flex-1 text-left"
                  onClick={() => navigate(`/routine/rutinas/${r.id}`)}
                >
                  <span className="font-medium">{r.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {t('routine.exerciseCount', { count: r.routine_exercises.length })}
                  </span>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-label={t('routine.editTitle')}
                    onClick={() => navigate(`/routine/rutinas/${r.id}`)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive"
                    aria-label={t('routine.deleteConfirm')}
                    onClick={() => deleteRoutine.mutate(r.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ── Programas tab ── */}
        <TabsContent value="programs" className="space-y-3 pt-2">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => navigate('/routine/programas/nuevo')}>
              <Plus className="h-4 w-4 mr-1" />
              {t('program.create')}
            </Button>
          </div>

          {programs.data && programs.data.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('program.listEmpty')}</p>
          )}

          {/* Activate anchor-date prompt */}
          {activatingId && (
            <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3">
              <label className="text-sm font-medium shrink-0">{t('program.anchorDate')}</label>
              <input
                type="date"
                className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                value={anchorDate}
                onChange={(e) => setAnchorDate(e.target.value)}
              />
              <Button size="sm" onClick={confirmActivate}>{t('program.activate')}</Button>
              <Button size="sm" variant="ghost" onClick={() => setActivatingId(null)}>
                {t('list.cancel')}
              </Button>
            </div>
          )}

          <div className="space-y-2">
            {(programs.data ?? []).map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border bg-card px-4 py-3"
              >
                <div className="flex flex-col items-start gap-0.5 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    {p.is_active && (
                      <Badge variant="primary">{t('program.active')}</Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {t('program.cycleLength', { count: p.program_days.length })}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!p.is_active && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleActivate(p.id)}
                    >
                      {t('program.activate')}
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-label={t('program.editTitle')}
                    onClick={() => navigate(`/routine/programas/${p.id}`)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive"
                    aria-label={t('program.deleteConfirm')}
                    onClick={() => deleteProgram.mutate(p.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
    </PageShell>
  );
}
