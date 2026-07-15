import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';

export type ResponsiveDialogVariant = 'panel' | 'centered';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible name. Rendered sr-only — a visible header, if wanted, is the caller's. */
  title: string;
  /**
   * `panel` docks a full-height sheet to the right edge on desktop (the add
   * drawer, the recipe peek); `centered` is a normal modal (the copy dialog,
   * the exercise info). Mobile is a bottom sheet either way.
   */
  variant?: ResponsiveDialogVariant;
  className?: string;
  /**
   * Called with the breakpoint, because vaul's DrawerContent draws NO close
   * affordance while radix's DialogContent draws its own X — callers that want
   * a close button need to know which side they are on.
   */
  children: ReactNode | ((ctx: { isMobile: boolean }) => ReactNode);
}

/**
 * Padding is the SHELL's, not the caller's, and each variant owns it the way
 * its layout needs:
 *
 * - `panel` is padded to zero (`p-0`) on purpose. A docked panel is a
 *   header / scrolling body / footer sandwich, so only the body may be inset —
 *   its caller pads those regions itself.
 * - `centered` is padded as a whole: `p-4` on mobile, and on desktop the `p-6`
 *   that `DialogContent` already applies (deliberately inherited, not
 *   re-declared). Callers add none.
 */
const DESKTOP_SHELL: Record<ResponsiveDialogVariant, string> = {
  panel:
    'inset-y-0 left-auto right-0 flex h-full max-h-full w-full max-w-md translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-l p-0 sm:rounded-none',
  centered: 'max-w-lg',
};

/**
 * Height is likewise the shell's: a `panel` is a tall scrolling surface and
 * claims the viewport, while a `centered` dialog is only as tall as its
 * content — capped, and scrolling inside that cap when it overflows. Stretching
 * a short dialog to a panel's height leaves it mostly empty.
 */
const MOBILE_SHELL: Record<ResponsiveDialogVariant, string> = {
  panel: 'h-[88vh] max-h-[88vh] gap-0 p-0',
  centered: 'h-auto max-h-[85vh] overflow-y-auto p-4',
};

/**
 * One shell for every drawer-on-mobile / dialog-on-desktop surface. Extracted
 * from AddToDaySheet + ExerciseInfoButton, which had hand-rolled the same
 * branch. The shell owns sizing and padding (per variant — see above) and the
 * accessible name; the caller owns the content and any visible header.
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  variant = 'centered',
  className,
  children,
}: Props) {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const body = typeof children === 'function' ? children({ isMobile: !isDesktop }) : children;

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={cn(DESKTOP_SHELL[variant], className)}>
          <DialogTitle className="sr-only">{title}</DialogTitle>
          {body}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className={cn(MOBILE_SHELL[variant], className)}>
        <DrawerTitle className="sr-only">{title}</DrawerTitle>
        {body}
      </DrawerContent>
    </Drawer>
  );
}
