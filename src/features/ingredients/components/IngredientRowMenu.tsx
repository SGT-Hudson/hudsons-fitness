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
  /**
   * Am I the creator? Ingredients are pooled (R-01) and only the creator's
   * UPDATE passes RLS, so the edit item is omitted rather than offered-then-403'd
   * on a row someone else made.
   */
  canEdit: boolean;
  /**
   * Do I hold a `user_ingredient_refs` row for it? "Quitar de mi biblioteca" is
   * a ref drop (R-25) — offering it on a pool row I never added would be a
   * no-op button.
   */
  inLibrary: boolean;
  onEdit: () => void;
  onRemove: () => void;
  className?: string;
}

/**
 * The kebab the web artboard draws at the end of every table row (the mobile
 * artboard draws none — but `hide_owned_ingredient` has no other surface, so
 * the mobile row carries the same menu rather than losing the affordance).
 *
 * **Never says "delete".** The FK from `recipe_ingredients` is `ON DELETE
 * RESTRICT`: a pool row cannot be removed, only un-referenced from your library
 * (R-25).
 */
export function IngredientRowMenu({
  canEdit,
  inLibrary,
  onEdit,
  onRemove,
  className,
}: Props) {
  const { t } = useTranslation('ingredientes');
  const { t: tCommon } = useTranslation('common');
  if (!canEdit && !inLibrary) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('list.menu')}
        className={cn(
          'grid size-7 shrink-0 place-items-center rounded-[9px] text-text-dim transition-colors hover:bg-muted hover:text-foreground',
          className,
        )}
      >
        <MoreVertical className="size-3.5" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canEdit && (
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil className="size-4" aria-hidden="true" />
            {tCommon('edit')}
          </DropdownMenuItem>
        )}
        {inLibrary && (
          <DropdownMenuItem
            onSelect={onRemove}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            {t('list.removeFromLibrary')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
