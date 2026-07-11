import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RecipePickerDialog } from './RecipePickerDialog';
import { add, roundMacro, ZERO_MACROS, type Macros } from '@/features/recipes/macros';

export interface PlannerCellEntry {
  id: string;
  recipe_id: string;
  recipe_name: string;
  servings: number;
  /** This slot's macros (recipe per-serving × servings), straight off the query. */
  macros: Macros;
}

interface Props {
  entries: PlannerCellEntry[];
  onAdd: (recipeId: string, recipeName: string, servings: number) => void | Promise<void>;
  onUpdate: (
    entryId: string,
    recipeId: string,
    recipeName: string,
    servings: number,
  ) => void | Promise<void>;
  onRemove: (entryId: string) => void | Promise<void>;
  onCopy?: () => void;
  busy?: boolean;
  className?: string;
}

/**
 * One (day × meal) cell of the web grid: recipe bullets, a copy affordance, an
 * inline add link and a kcal·P·C·G footer; dashed + sunken when empty. Editing
 * and deleting still go through `RecipePickerDialog` — PR-B swaps that for the
 * add drawer and the recipe peek.
 */
export function PlannerMealCell({
  entries,
  onAdd,
  onUpdate,
  onRemove,
  onCopy,
  busy,
  className,
}: Props) {
  const { t } = useTranslation('planning');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState<PlannerCellEntry | null>(null);
  const empty = entries.length === 0;
  const cell = entries.reduce<Macros>((acc, e) => add(acc, e.macros), ZERO_MACROS);

  function openAdd() {
    setEditing(null);
    setPickerOpen(true);
  }
  function openEdit(entry: PlannerCellEntry) {
    setEditing(entry);
    setPickerOpen(true);
  }

  return (
    <div
      data-empty={empty}
      className={cn(
        'relative flex flex-col gap-1 rounded-md border p-2.5',
        empty ? 'border-dashed bg-muted' : 'bg-card',
        className,
      )}
    >
      {empty ? (
        <button
          type="button"
          onClick={openAdd}
          disabled={busy}
          className="flex h-full min-h-12 items-center justify-center gap-1 text-[11px] text-text-dim hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          {t('cell.addFirst')}
        </button>
      ) : (
        <>
          {onCopy && (
            <button
              type="button"
              onClick={onCopy}
              aria-label={t('slot.copy')}
              title={t('slot.copy')}
              disabled={busy}
              className="absolute right-1.5 top-1.5 grid h-[22px] w-[22px] place-items-center rounded-md border border-transparent text-text-dim hover:border-accent-line hover:bg-accent-soft hover:text-accent-ink"
            >
              <Copy className="h-3 w-3" />
            </button>
          )}

          <div className="flex flex-col gap-0.5 pr-6">
            {entries.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => openEdit(e)}
                className="flex items-baseline gap-1.5 text-left text-[11.5px] leading-tight hover:underline"
              >
                <span aria-hidden="true" className="shrink-0 text-[9px] text-text-dim">
                  •
                </span>
                <span className="min-w-0 truncate font-medium">{e.recipe_name}</span>
                {e.servings !== 1 && (
                  <span className="tnum shrink-0 text-[10px] text-text-dim">×{e.servings}</span>
                )}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={openAdd}
            disabled={busy}
            className="-ml-1 mt-0.5 inline-flex items-center gap-1 self-start rounded px-1 py-0.5 text-[10.5px] text-text-dim hover:text-foreground"
          >
            <Plus className="h-2.5 w-2.5" />
            {t('cell.addMore')}
          </button>

          <div className="tnum mt-auto flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 border-t pt-1 text-[10px] text-text-dim">
            <span>
              <b className="font-medium text-muted-foreground">{roundMacro(cell.kcal)}</b>{' '}
              {t('cell.kcal')}
            </span>
            <span>
              {roundMacro(cell.proteinG)} <span className="opacity-65">{t('summary.letter.protein')}</span>
            </span>
            <span>
              {roundMacro(cell.carbsG)} <span className="opacity-65">{t('summary.letter.carbs')}</span>
            </span>
            <span>
              {roundMacro(cell.fatG)} <span className="opacity-65">{t('summary.letter.fat')}</span>
            </span>
          </div>
        </>
      )}

      <RecipePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        initialRecipe={
          editing
            ? { id: editing.recipe_id, name: editing.recipe_name, servings: editing.servings }
            : null
        }
        busy={busy}
        onSave={async (recipeId, recipeName, servings) => {
          if (editing) await onUpdate(editing.id, recipeId, recipeName, servings);
          else await onAdd(recipeId, recipeName, servings);
        }}
        onDelete={
          editing
            ? async () => {
                await onRemove(editing.id);
                setPickerOpen(false);
              }
            : undefined
        }
      />
    </div>
  );
}
