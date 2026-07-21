import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The full (1600px) rendition — the caller already has it from `publicPhotoUrl`. */
  src: string;
  alt: string;
}

/**
 * Tapping a recipe's cover photo opens it big, in place — a plain shadcn
 * `Dialog` rather than the `ResponsiveDialog` shell the rest of the app uses
 * for its sheets: that shell turns into a bottom drawer below `md`, and a
 * photo dragged up from the bottom edge on a 88vh sheet is not a lightbox. A
 * centred, content-sized modal is the right shape at every width, and
 * `DialogContent` already draws its own close affordance and traps focus.
 *
 * `object-contain` (not `cover`): this is the "see the whole thing" view, so a
 * portrait photo letterboxes rather than being cropped.
 */
export function RecipePhotoLightbox({ open, onOpenChange, src, alt }: Props) {
  const { t } = useTranslation('recetas');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(92vw,900px)] gap-0 p-2 md:p-3">
        <DialogTitle className="sr-only">{t('media.lightboxTitle')}</DialogTitle>
        <img src={src} alt={alt} className="max-h-[78vh] w-full rounded-[10px] object-contain" />
      </DialogContent>
    </Dialog>
  );
}
