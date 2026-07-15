import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { Macros } from '../macros';

const DOT: Record<'protein' | 'carbs' | 'fat', string> = {
  protein: 'bg-macro-p',
  carbs: 'bg-macro-c',
  fat: 'bg-macro-g',
};

interface Props {
  /** Per-serving macros — `RecipeListItem.perServing` satisfies it. */
  macros: Macros;
  className?: string;
}

/**
 * P · C · G triad with the shared macro identity dots (the mobile artboard's
 * `MacroDot`, which the canvas screenshot note prefers over the web artboard's
 * tinted letters). Grams, per serving.
 *
 * Whole grams, not `roundMacro`'s one decimal: both artboards show the card's
 * figures as integers, and a tenth of a gram on a per-serving average is noise
 * at card scale. The exact values stay on the read view and the editor.
 */
export function RecipeMacroDots({ macros, className }: Props) {
  const { t } = useTranslation('recetas');
  const items: Array<{ key: keyof typeof DOT; value: number }> = [
    { key: 'protein', value: macros.proteinG },
    { key: 'carbs', value: macros.carbsG },
    { key: 'fat', value: macros.fatG },
  ];

  return (
    <div className={cn('tnum flex flex-wrap items-center gap-2.5 text-[10.5px] text-muted-foreground', className)}>
      {items.map(({ key, value }) => (
        <span key={key} className="inline-flex items-center gap-1">
          <span className={cn('h-[7px] w-[7px] shrink-0 rounded-full', DOT[key])} aria-hidden="true" />
          {t(`macros.letter.${key}`)} {Math.round(value)}g
        </span>
      ))}
    </div>
  );
}
