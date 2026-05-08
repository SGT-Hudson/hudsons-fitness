import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { supabase } from '@/lib/supabase';

export function SignupPage() {
  const { t } = useTranslation('auth');
  const { t: tCommon } = useTranslation('common');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(t('errors.weakPassword'));
      return;
    }
    setSubmitting(true);
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    setSubmitting(false);
    if (authError) {
      setError(
        authError.message.toLowerCase().includes('registered')
          ? t('errors.emailInUse')
          : authError.message,
      );
      return;
    }
    setSuccess(true);
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-end mb-4">
          <LanguageSwitcher />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{tCommon('appName')}</CardTitle>
            <CardDescription>{t('signUp')}</CardDescription>
          </CardHeader>
          <CardContent>
            {success ? (
              <p className="text-sm">{t('checkEmail')}</p>
            ) : (
              <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="displayName">{t('displayName')}</Label>
                  <Input
                    id="displayName"
                    type="text"
                    autoComplete="name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{t('email')}</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{t('password')}</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    autoComplete="new-password"
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? tCommon('loading') : t('signUp')}
                </Button>
                <p className="text-sm text-muted-foreground text-center">
                  {t('hasAccount')}{' '}
                  <Link to="/login" className="text-primary underline-offset-4 hover:underline">
                    {t('signIn')}
                  </Link>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
