import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/features/auth/AuthProvider';
import { toastError } from '@/lib/toast-helpers';
import { deleteAccount } from '../api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteAccountDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation('settings');
  const { user, signOut } = useAuth();
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setConfirmText('');
      setSubmitting(false);
    }
  }, [open]);

  const email = user?.email ?? '';
  const canConfirm = !!email && confirmText.trim().toLowerCase() === email.toLowerCase();

  async function handleConfirm() {
    if (!canConfirm || submitting) return;
    setSubmitting(true);
    try {
      await deleteAccount();
      await signOut();
      onOpenChange(false);
    } catch (err) {
      toastError(err);
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('account.delete.title')}</DialogTitle>
          <DialogDescription>{t('account.delete.description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t('account.delete.warning')}
          </p>
          <div className="space-y-2">
            <Label htmlFor="confirmEmail">
              {t('account.delete.confirmLabel', { email })}
            </Label>
            <Input
              id="confirmEmail"
              autoComplete="off"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={email}
              disabled={submitting}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t('account.delete.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handleConfirm()}
            disabled={!canConfirm || submitting}
          >
            {submitting ? t('account.delete.deleting') : t('account.delete.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
