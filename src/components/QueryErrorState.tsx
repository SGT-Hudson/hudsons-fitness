import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { classifyError, errorMessageKey } from '@/lib/errors';

interface Props {
  /** The query's `error`. */
  error: unknown;
  /**
   * The screen's own not-found state, rendered when the error really means
   * "no rows". Every screen keeps its own copy and its own way back; only the
   * failure states are shared.
   */
  notFound: ReactNode;
  /** Usually the query's `refetch`. Omit where retrying makes no sense. */
  onRetry?: () => void;
  className?: string;
}

/**
 * Renders a settled-but-failed query honestly. Before this existed, screens
 * collapsed `isError || !data` into their not-found state, so a network
 * timeout told the user their recipe had been deleted.
 */
export function QueryErrorState({ error, notFound, onRetry, className }: Props) {
  const { t } = useTranslation('common');
  const kind = classifyError(error);

  if (kind === 'notFound') return <>{notFound}</>;

  // A stale schema means the deploy is broken; retrying the same query cannot
  // help, so the only affordance offered is the one that actually fixes it.
  const stale = kind === 'staleSchema';

  return (
    <EmptyState
      className={className}
      icon={AlertTriangle}
      title={t(stale ? 'errors.staleSchemaTitle' : 'errors.loadFailedTitle')}
      hint={t(errorMessageKey(kind))}
      action={
        stale ? (
          <Button variant="outline" onClick={() => window.location.reload()}>
            {t('errors.reload')}
          </Button>
        ) : onRetry ? (
          <Button variant="outline" onClick={onRetry}>
            {t('errors.retry')}
          </Button>
        ) : undefined
      }
    />
  );
}
