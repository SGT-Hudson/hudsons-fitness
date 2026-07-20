import { Apple, Plus, UtensilsCrossed } from 'lucide-react';
import { useNum } from '@/hooks/useNum';

export interface AddResultRowProps {
  kind: 'recipe' | 'ingredient';
  name: string;
  /** Per-serving (recipe) or per-unit (ingredient) kcal; null when unknown. */
  kcal: number | null;
  /** Brand / servings / unit line under the name. */
  subtitle?: string;
  onSelect: () => void;
}

/**
 * One row in the "Añadir a hoy" explore list — a recipe or a loose
 * ingredient. Selecting it is the seam Task 4 hooks into: the caller decides
 * what "select" means (advance to the ración step).
 */
export function AddResultRow({ kind, name, kcal, subtitle, onSelect }: AddResultRowProps) {
  const num = useNum();
  const Icon = kind === 'recipe' ? UtensilsCrossed : Apple;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-2.5 rounded-[10px] border border-border bg-card px-2.5 py-2 text-left hover:bg-muted"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold">{name}</span>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {kcal != null && (
            <span className="tabular-nums font-semibold text-foreground">
              {num.qty(kcal)} <span className="font-normal text-muted-foreground">kcal</span>
            </span>
          )}
          {subtitle && <span className="truncate">{subtitle}</span>}
        </span>
      </span>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-border bg-card text-muted-foreground">
        <Plus className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}
