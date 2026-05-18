import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { supabase } from '@/lib/supabase';
import { loginFormSchema, type LoginFormValues } from '@/features/auth/schema';

export function LoginPage() {
  const { t } = useTranslation('auth');
  const { t: tCommon } = useTranslation('common');
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: LoginFormValues) {
    setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });
    if (authError) {
      setError(t('errors.invalidCredentials'));
      return;
    }
    navigate('/diario', { replace: true });
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
            <CardDescription>{t('signIn')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t('email')}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  {...register('email')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t('password')}</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  {...register('password')}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? tCommon('loading') : t('signIn')}
              </Button>
              <p className="text-sm text-muted-foreground text-center">
                {t('noAccount')}{' '}
                <Link to="/signup" className="text-primary underline-offset-4 hover:underline">
                  {t('signUp')}
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
