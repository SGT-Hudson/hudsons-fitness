import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MoreVertical, Pencil, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface Props {
  recipeId: string;
  onRemove: () => void;
  className?: string;
}

/**
 * Edit / remove for a recipe in the list. The artboards draw no actions on the
 * card at all, but `hide_owned_recipe` (R-01/R-25) has no other surface in the
 * app — dropping it here would drop the only way to remove a recipe from your
 * library — so the two affordances collapse into one menu button instead of the
 * pre-redesign row of icon buttons.
 *
 * The edit item points at the editor (`/recipes/:id/edit`) — the card itself
 * already links to `/recipes/:id`, which since the wave-5 route split is the
 * read view.
 */
export function RecipeCardMenu({ recipeId, onRemove, className }: Props) {
  const { t } = useTranslation('recetas');
  const { t: tCommon } = useTranslation('common');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('card.menu')}
        className={cn(
          'grid h-[26px] w-[26px] place-items-center rounded-[9px] bg-card/85 text-text-dim backdrop-blur-[4px] transition-colors hover:bg-card hover:text-foreground',
          className,
        )}
      >
        <MoreVertical className="h-3.5 w-3.5" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link to={`/recipes/${recipeId}/edit`}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
            {tCommon('edit')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onRemove} className="text-destructive focus:text-destructive">
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {t('list.removeFromLibrary')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
