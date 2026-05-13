import i18n from '@/i18n';
import { toast } from '@/hooks/use-toast';

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

export function toastError(err: unknown) {
  const description =
    err instanceof Error && err.message
      ? err.message
      : i18n.t('common:toasts.errorGeneric');
  toast({
    variant: 'destructive',
    title: i18n.t('common:toasts.errorTitle'),
    description,
  });
}
