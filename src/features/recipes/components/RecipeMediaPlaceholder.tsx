import { Utensils } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { recipeMediaHue } from '../mediaHue';

export type RecipeMediaVariant = 'card' | 'thumbnail' | 'hero';

/** Stripe pitch (px) per call site — mirrors the design canvas: the list
 * card media band uses a 14/28px repeat; the mobile row thumbnail and the
 * detail hero both use a tighter 12/24px one. */
const STRIPE_PX: Record<RecipeMediaVariant, number> = {
  card: 14,
  hero: 12,
  thumbnail: 12,
};

const ICON_SIZE: Record<RecipeMediaVariant, number> = {
  card: 28,
  hero: 40,
  thumbnail: 16,
};

interface Props {
  /** Recipe id — the sole input to the deterministic hue. */
  recipeId: string;
  /** Which call site this fills; controls stripe pitch + icon size. Defaults to 'card'. */
  variant?: RecipeMediaVariant;
  className?: string;
}

/**
 * Shared "no photo" fill for every recipe media slot (list card media band,
 * mobile row thumbnail, detail hero, editor tile). Since R-36b a recipe CAN
 * have a cover photo, so this is the empty case rather than the only case:
 * `RecipePhoto` renders it whenever `recipes.photo_url` is null, and also when
 * a photo that should exist fails to load. A deterministic diagonal-stripe tint
 * with the Recetas/utensils icon centred on it, reading as a deliberate
 * placeholder rather than a broken image.
 *
 * Ported from the design canvas's inline fill (recetas-web.jsx RecipeCard,
 * recetas-mobile.jsx row, receta-editor-web.jsx RecetaVistaWebV2 hero):
 * `oklch(L C hue)` base + a `repeating-linear-gradient` stripe at a slightly
 * darker/more chromatic second stop. The hue is computed once per recipe by
 * `recipeMediaHue` (same id → same hue, forever); L/C for both stops — and
 * for the icon ink — live in `--recipe-media-*` tokens (index.css) with a
 * `.dark` override, so light/dark legibility is resolved by CSS variable
 * cascade, not a runtime theme check.
 *
 * Fills its container — size and rounding are the caller's className.
 */
export function RecipeMediaPlaceholder({ recipeId, variant = 'card', className }: Props) {
  const { t } = useTranslation('recetas');
  const hue = recipeMediaHue(recipeId);
  const band = STRIPE_PX[variant];
  const repeat = band * 2;
  const base = `oklch(var(--recipe-media-l) var(--recipe-media-c) ${hue})`;
  const stripe = `oklch(var(--recipe-media-l2) var(--recipe-media-c2) ${hue})`;

  return (
    <div
      role="img"
      aria-label={t('media.placeholderAlt')}
      className={cn('relative flex h-full w-full items-center justify-center overflow-hidden', className)}
      style={{
        backgroundColor: base,
        backgroundImage: `repeating-linear-gradient(135deg, ${base} 0 ${band}px, ${stripe} ${band}px ${repeat}px)`,
      }}
    >
      <Utensils
        aria-hidden="true"
        size={ICON_SIZE[variant]}
        style={{ color: `oklch(var(--recipe-media-ink-l) var(--recipe-media-ink-c) ${hue})` }}
      />
    </div>
  );
}
