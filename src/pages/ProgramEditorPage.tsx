import { useNavigate, useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild size="icon" variant="ghost" aria-label={t('program.back')}>
          <Link to="/routine">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {isEdit ? t('program.editTitle') : t('program.newTitle')}
        </h1>
      </div>

      <ProgramBuilder
        initial={program}
        routines={routines.data ?? []}
        onSubmit={(payload) => saveProgram.mutateAsync(payload)}
        onSaved={() => navigate('/routine')}
      />
    </div>
  );
}
