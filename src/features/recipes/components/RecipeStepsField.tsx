import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { newRowId } from './RecipeEditorForm';
import type { EditorState } from './RecipeEditorForm';

/**
 * R-36 — structured, reorderable steps.
 *
 * Reordering is ↑/↓ buttons over the field array's `swap()`, not drag and drop:
 * no DnD library exists in the repo, and dragging fights form scroll on mobile,
 * which is the surface that wins when the artboards disagree. The first ↑ and
 * last ↓ are disabled rather than hidden so rows do not shift while reordering.
 */
export function RecipeStepsField() {
  const { t } = useTranslation('recetas');
  const { control, register } = useFormContext<EditorState>();
  // The explicit second generic pins this field array to `steps`. Without it,
  // TS infers `TFieldArrayName` as the union of every array path on
  // `EditorState`, and `fields` widens to `EditorRow | { stepId: string; text:
  // string }` — losing `stepId` on every read. Same fix as `RecipeEditorForm`'s
  // `rows` field array.
  const { fields, append, remove, swap } = useFieldArray<EditorState, 'steps'>({
    control,
    name: 'steps',
  });

  return (
    <div className="space-y-2.5">
      {fields.map((field, i) => (
        <div key={field.id} className="flex items-start gap-2.5">
          <span className="tnum mt-2 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-[13.5px] font-semibold text-accent-ink">
            {i + 1}
          </span>
          <Textarea
            rows={2}
            aria-label={t('form.stepNumber', { number: i + 1 })}
            placeholder={t('form.stepPlaceholder')}
            className="min-h-[56px] resize-y rounded-[10px] bg-muted text-[13px] leading-[1.6]"
            {...register(`steps.${i}.text` as const)}
          />
          <div className="flex shrink-0 flex-col gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={i === 0}
              aria-label={t('form.moveStepUp', { number: i + 1 })}
              onClick={() => swap(i, i - 1)}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={i === fields.length - 1}
              aria-label={t('form.moveStepDown', { number: i + 1 })}
              onClick={() => swap(i, i + 1)}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-text-dim"
              aria-label={t('form.removeStep', { number: i + 1 })}
              onClick={() => remove(i)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => append({ stepId: newRowId(), text: '' })}
      >
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        {t('form.addStep')}
      </Button>
    </div>
  );
}
