import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SettingsSubpageHeader } from '@/components/layout/SettingsSubpageHeader';
import { useAuth } from '@/features/auth/AuthProvider';
import { DeleteAccountDialog } from '@/features/account/components/DeleteAccountDialog';

export function SettingsAccountPage() {
  const { t } = useTranslation('settings');
  const { user, signOut } = useAuth();
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <div className="space-y-6 max-w-2xl">
      <SettingsSubpageHeader title={t('account.title')} />
      <p className="text-sm text-muted-foreground">{t('account.description')}</p>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label htmlFor="email">{t('account.email')}</Label>
            <Input id="email" value={user?.email ?? ''} disabled />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void signOut()}>
              {t('account.signOut')}
            </Button>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              {t('account.delete.button')}
            </Button>
          </div>
        </CardContent>
      </Card>
      <DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} />
    </div>
  );
}
