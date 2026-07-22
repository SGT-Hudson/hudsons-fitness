import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';

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
 * centred, content-sized modal is the right shape at every width.
 *
 * `object-contain` (not `cover`): this is the "see the whole thing" view, so a
 * portrait photo letterboxes rather than being cropped.
 *
 * It supplies its own close button (`hideClose` on the content) because the
 * shared one — a bare 16px glyph at 70% opacity — sits directly on the photo
 * and vanishes over anything light. This is the photo-viewer convention
 * instead: a translucent dark disc with a blurred backdrop, which stays legible
 * over a bright sky and a dark stew alike without tinting the image around it.
 */
export function RecipePhotoLightbox({ open, onOpenChange, src, alt }: Props) {
  const { t } = useTranslation('recetas');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="max-w-[min(92vw,900px)] gap-0 p-2 md:p-3">
        <DialogTitle className="sr-only">{t('media.lightboxTitle')}</DialogTitle>
        <img src={src} alt={alt} className="max-h-[78vh] w-full rounded-[10px] object-contain" />
        <DialogClose
          // The keyboard ring is drawn INSIDE the disc, against its own dark
          // fill: a ring around the outside is white-on-white the moment the
          // photo behind it is bright, which is exactly when it is needed.
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-black/45 text-white shadow-hi backdrop-blur-sm transition-colors hover:bg-black/65 focus:outline-hidden focus-visible:bg-black/75 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
          aria-label={t('media.closePhoto')}
        >
          <X className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden="true" />
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
