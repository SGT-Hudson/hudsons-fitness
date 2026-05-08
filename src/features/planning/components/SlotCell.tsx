import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RecipePickerDialog } from './RecipePickerDialog';
import { cn } from '@/lib/utils';

export interface SlotEntry {
  id: string; // local id (template editor) or DB id (planner)
  recipe_id: string;
  recipe_name: string;
  servings: number;
}

interface Props {
  mealLabel?: string;
  entries: SlotEntry[];
  onAdd: (
    recipeId: string,
    recipeName: string,
    servings: number,
  ) => void | Promise<void>;
  onUpdate: (
    entryId: string,
    recipeId: string,
    recipeName: string,
    servings: number,
  ) => void | Promise<void>;
  onRemove: (entryId: string) => void | Promise<void>;
  busy?: boolean;
  className?: string;
}

export function SlotCell({
  mealLabel,
  entries,
  onAdd,
  onUpdate,
  onRemove,
  busy,
  className,
}: Props) {
  const { t } = useTranslation('planning');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState<SlotEntry | null>(null);

  function openAdd() {
    setEditing(null);
    setPickerOpen(true);
  }
  function openEdit(entry: SlotEntry) {
    setEditing(entry);
    setPickerOpen(true);
  }

  return (
    <div className={cn('rounded-md border bg-card p-2 space-y-1.5', className)}>
      {mealLabel && (
        <div className="text-xs font-medium text-muted-foreground tabular-nums">
          {mealLabel}
        </div>
      )}
      <ul className="space-y-1">
        {entries.map((e) => (
          <li
            key={e.id}
            className="flex items-center gap-1 text-xs rounded bg-secondary text-secondary-foreground pl-2 pr-1 py-1"
          >
            <button
              type="button"
              onClick={() => openEdit(e)}
              className="flex-1 min-w-0 text-left hover:underline"
            >
              <span className="font-medium truncate">{e.recipe_name}</span>
              {e.servings !== 1 && (
                <span className="text-muted-foreground ml-1 tabular-nums">×{e.servings}</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => void onRemove(e.id)}
              aria-label={t('slot.remove')}
              className="shrink-0 opacity-60 hover:opacity-100"
              disabled={busy}
            >
              <X className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full h-7 text-xs"
        onClick={openAdd}
        disabled={busy}
      >
        <Plus className="h-3 w-3" />
        {t('slot.add')}
      </Button>
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
          if (editing) {
            await onUpdate(editing.id, recipeId, recipeName, servings);
          } else {
            await onAdd(recipeId, recipeName, servings);
          }
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
