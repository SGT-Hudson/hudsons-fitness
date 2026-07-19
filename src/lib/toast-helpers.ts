import { createElement } from 'react';
import type { ToastActionElement } from '@/components/ui/toast';
import { ToastAction } from '@/components/ui/toast';
import i18n from '@/i18n';
import { toast } from '@/hooks/use-toast';
import { classifyError, errorMessageKey } from '@/lib/errors';

export function toastSaved(description?: string) {
  toast({
    variant: 'success',
    title: i18n.t('common:toasts.saved'),
    description,
  });
}

export function toastDeleted(description?: string) {
  toast({
    variant: 'success',
    title: i18n.t('common:toasts.deleted'),
    description,
  });
}

export function toastCreated(description?: string) {
  toast({
    variant: 'success',
    title: i18n.t('common:toasts.created'),
    description,
  });
}

export function toastApplied(description?: string) {
  toast({
    variant: 'success',
    title: i18n.t('common:toasts.applied'),
    description,
  });
}

/**
 * Shows a translated, classified message. The raw error goes to the console,
 * which is where it is useful — the `.message` path was removed rather than
 * kept as a fallback, because a default that leaks is a default that will leak
 * again.
 *
 * `message` is for a call site that knows better and passes an
 * already-translated string. It is typed `unknown` on purpose: this function is
 * passed straight to react-query's `onError`, which calls it with
 * `(error, variables, context)` — so anything that is not a string must be
 * ignored rather than rendered.
 */
export function toastError(err: unknown, message?: unknown) {
  console.error('Operation failed', err);
  toast({
    variant: 'destructive',
    title: i18n.t('common:toasts.errorTitle'),
    description:
      typeof message === 'string' && message
        ? message
        : i18n.t(errorMessageKey(classifyError(err))),
  });
}

/**
 * Quick-add confirmation with an inline "undo" action (Theme 2 / L1).
 * `onUndo` is fired when the user taps the action — wire it to delete the
 * just-created meal_log by id. Uses createElement so this stays a .ts file.
 */
export function toastUndoableQuickAdd(name: string, onUndo: () => void) {
  toast({
    variant: 'success',
    title: i18n.t('diario:quickAdd.added', { name }),
    durationMs: 6000,
    action: createElement(
      ToastAction,
      { altText: i18n.t('diario:quickAdd.undo'), onClick: onUndo },
      i18n.t('diario:quickAdd.undo'),
    ) as unknown as ToastActionElement,
  });
}
