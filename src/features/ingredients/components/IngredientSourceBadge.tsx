import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { ingredientSourceVariant, type IngredientSourceVariant } from '../ingredientSource';

/**
 * THE ingredient source badge — one component, used by the mobile row, the web
 * table and (next) the editor's origin card.
 *
 * The canvas draws four disagreeing versions of it (`O.F.F.` vs
 * `OpenFoodFacts`, base green vs base grey, pill vs rounded rect). This settles
 * on the mobile artboard's pill, the web artboard's green base, and the short
 * `O.F.F.` label — the long one does not survive a 390px row.
 *
 * The palette is tokens, not the canvas's raw oklch literals (which are
 * light-theme only): base rides the section-independent `--nutri-*` ramp, OFF
 * the `--amber-*` one (`--amber-line` is minted for it in `index.css`), manual
 * the neutral sunken surface. The long source name is the accessible name, so a
 * screen reader hears "Importado de OpenFoodFacts", not "O.F.F.".
 */
const STYLE: Record<IngredientSourceVariant, string> = {
  base: 'border-nutri-line bg-nutri-soft text-nutri-ink',
  manual: 'border-border bg-muted text-muted-foreground',
  off: 'border-amber-line bg-amber-soft text-amber-ink',
};

const LABEL_KEY: Record<IngredientSourceVariant, string> = {
  base: 'source.baseShort',
  manual: 'source.manualShort',
  off: 'source.offShort',
};

const TITLE_KEY: Record<IngredientSourceVariant, string> = {
  base: 'source.base',
  manual: 'source.manual',
  off: 'source.openfoodfacts',
};

interface Props {
  /** `ingredients.source` — `manual | openfoodfacts | bedca | system`. */
  source: string;
  className?: string;
}

export function IngredientSourceBadge({ source, className }: Props) {
  const { t } = useTranslation('ingredientes');
  const variant = ingredientSourceVariant(source);

  return (
    <span
      role="img"
      title={t(TITLE_KEY[variant])}
      aria-label={t(TITLE_KEY[variant])}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border px-2 py-[2px] text-[9.5px] font-medium',
        STYLE[variant],
        className,
      )}
    >
      <span aria-hidden="true">{t(LABEL_KEY[variant])}</span>
    </span>
  );
}
