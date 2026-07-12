import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  icon: LucideIcon;
  title: string;
  hint?: string;
  /** Optional call to action under the hint (e.g. a "new recipe" button). */
  action?: ReactNode;
  className?: string;
}

/**
 * Centred empty state, built from the canvas's vocabulary (it never drew one):
 * an icon tile on a sunken rounded square, a 13px semibold muted title and a
 * dim hint, capped narrow (~260px) so the copy reads as a single short column.
 */
export function EmptyState({ icon: Icon, title, hint, action, className }: Props) {
  return (
    <div className={cn('flex flex-col items-center gap-2.5 px-4 py-12 text-center', className)}>
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-text-dim">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="text-[13px] font-semibold text-muted-foreground">{title}</p>
      {hint && <p className="max-w-[260px] text-[12px] text-text-dim">{hint}</p>}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
