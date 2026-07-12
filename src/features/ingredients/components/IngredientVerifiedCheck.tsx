import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  /** `ingredients.is_verified`. Renders nothing when false. */
  verified: boolean;
  className?: string;
}

/**
 * The canvas's verified tick beside an ingredient's name.
 *
 * **Read-only, deliberately.** `is_verified` already sorts both ingredient
 * searches, so the badge costs nothing — but there is no toggle in this wave:
 * ingredients are a shared pool, so "verifying" one is a global claim about a
 * row someone else may own, and no RLS policy or RPC governs who may make it
 * (spec §4). The badge ships; the write does not.
 */
export function IngredientVerifiedCheck({ verified, className }: Props) {
  const { t } = useTranslation('ingredientes');
  if (!verified) return null;

  return (
    <span
      role="img"
      title={t('list.verified')}
      aria-label={t('list.verified')}
      className={cn(
        'grid size-3 shrink-0 place-items-center rounded-full bg-nutri-soft text-nutri-ink',
        className,
      )}
    >
      <Check className="size-2" strokeWidth={3} aria-hidden="true" />
    </span>
  );
}
