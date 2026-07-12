import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface Props {
  favorite: boolean;
  onToggle: () => void;
  /** `md` = the web card's 26px pin; `sm` = the mobile row's 18px one. */
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * The canvas's glass favourite pin on a recipe's media. The artboard draws it
 * only when the recipe is a favourite (it is a static mock); here it is always
 * rendered — as the toggle itself — with an unfilled star when it is not, so a
 * recipe can be favourited from the list, which is where it always could be.
 */
export function RecipeFavoritePin({ favorite, onToggle, size = 'md', className }: Props) {
  const { t } = useTranslation('recetas');
  const px = size === 'sm' ? 11 : 13;

  return (
    <button
      type="button"
      aria-pressed={favorite}
      aria-label={favorite ? t('favorite.remove') : t('favorite.add')}
      onClick={onToggle}
      className={cn(
        'grid place-items-center rounded-[9px] bg-card/85 backdrop-blur-[4px] transition-colors hover:bg-card',
        size === 'sm' ? 'h-[18px] w-[18px] rounded-[6px]' : 'h-[26px] w-[26px]',
        favorite ? 'text-accent-ink' : 'text-text-dim',
        className,
      )}
    >
      <Star size={px} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" />
    </button>
  );
}
