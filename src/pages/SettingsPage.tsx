import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

export function SettingsPage() {
  const { t } = useTranslation('nav');
  const { t: tCommon } = useTranslation('common');
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: profile, isLoading } = useQuery({
    enabled: !!user,
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (profile?.display_name) setDisplayName(profile.display_name);
  }, [profile]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    await supabase
      .from('profiles')
      .update({ display_name: displayName, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">{t('settings')}</h1>
      <Card>
        <CardHeader>
          <CardTitle>Perfil</CardTitle>
          <CardDescription>Datos básicos de tu cuenta.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{tCommon('loading')}</p>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={user?.email ?? ''} disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="displayName">Nombre</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
              <Button onClick={() => void handleSave()} disabled={saving}>
                {saving ? tCommon('loading') : tCommon('save')}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
