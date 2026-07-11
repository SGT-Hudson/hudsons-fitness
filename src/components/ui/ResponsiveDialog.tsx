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

const DESKTOP_SHELL: Record<ResponsiveDialogVariant, string> = {
  panel:
    'inset-y-0 left-auto right-0 flex h-full max-h-full w-full max-w-md translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-l p-0 sm:rounded-none',
  centered: 'max-w-lg',
};

/**
 * One shell for every drawer-on-mobile / dialog-on-desktop surface. Extracted
 * from AddToDaySheet + ExerciseInfoButton, which had hand-rolled the same
 * branch. The caller owns padding, scrolling and any visible header — this only
 * owns the shell and the accessible name.
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
      <DrawerContent className={cn('h-[88vh] max-h-[88vh] gap-0 p-0', className)}>
        <DrawerTitle className="sr-only">{title}</DrawerTitle>
        {body}
      </DrawerContent>
    </Drawer>
  );
}
