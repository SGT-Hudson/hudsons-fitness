import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { buildExerciseImageUrl } from '../exercises/images';
import { cn } from '@/lib/utils';

interface Props {
  images: string[];
  name: string;
  density: 'compact' | 'full';
}

/**
 * Start↔end movement loop for an exercise. Two frames stacked in a fixed
 * aspect-ratio box (no layout shift); the end frame fades in/out via a
 * `motion-safe` animation, so reduced-motion users see only the static start
 * frame (no toggle, by design). 0 images → nothing; 1 → static; 2 → loop.
 * Tapping enlarges in a Radix Dialog.
 */
export function ExerciseImageLoop({ images, name, density }: Props) {
  const { t } = useTranslation('entrenamiento');
  const [enlarged, setEnlarged] = useState(false);
  if (images.length === 0) return null;

  const startSrc = buildExerciseImageUrl(images[0]);
  const endSrc = images.length > 1 ? buildExerciseImageUrl(images[1]) : null;
  const altStart = t('exerciseDetail.imageAlt.start', { name });
  const altEnd = t('exerciseDetail.imageAlt.end', { name });

  const frames = (fit: 'cover' | 'contain') => (
    <>
      <img
        src={startSrc}
        alt={altStart}
        loading="lazy"
        decoding="async"
        className={cn('absolute inset-0 h-full w-full', fit === 'cover' ? 'object-cover' : 'object-contain')}
      />
      {endSrc && (
        <img
          src={endSrc}
          alt={altEnd}
          loading="lazy"
          decoding="async"
          className={cn(
            'absolute inset-0 h-full w-full opacity-0 motion-safe:animate-exercise-frame',
            fit === 'cover' ? 'object-cover' : 'object-contain',
          )}
        />
      )}
    </>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setEnlarged(true)}
        aria-label={t('exerciseDetail.enlargeAria')}
        className="block w-full overflow-hidden rounded-md"
      >
        <div
          className={cn(
            'relative w-full bg-muted',
            density === 'compact' ? 'aspect-[4/3] max-h-44' : 'aspect-[4/3]',
          )}
        >
          {frames('cover')}
        </div>
      </button>

      <Dialog open={enlarged} onOpenChange={setEnlarged}>
        <DialogContent className="max-w-2xl">
          <DialogTitle className="sr-only">{name}</DialogTitle>
          <div className="relative aspect-[4/3] w-full">{frames('contain')}</div>
        </DialogContent>
      </Dialog>
    </>
  );
}
