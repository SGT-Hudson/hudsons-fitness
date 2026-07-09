import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { PageShell } from '@/components/layout/PageShell';
import { ProgramBuilder } from '@/features/training/components/ProgramBuilder';
import { usePrograms, useSaveProgram } from '@/features/training/programs/hooks';
import { useRoutines } from '@/features/training/routines/hooks';

export function ProgramEditorPage() {
  const { t } = useTranslation('entrenamiento');
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEdit = !!id;

  const programs = usePrograms();
  const routines = useRoutines();
  const saveProgram = useSaveProgram();

  const program = isEdit ? (programs.data ?? []).find((p) => p.id === id) ?? null : null;

  if ((isEdit && programs.isLoading) || routines.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <PageShell title={isEdit ? t('program.editTitle') : t('program.newTitle')} back="/routine">
      <ProgramBuilder
        initial={program}
        routines={routines.data ?? []}
        onSubmit={(payload) => saveProgram.mutateAsync(payload)}
        onSaved={() => navigate('/routine')}
      />
    </PageShell>
  );
}
