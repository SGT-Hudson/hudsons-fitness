import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { supabase } from '@/lib/supabase';
import { signupFormSchema, type SignupFormValues } from '@/features/auth/schema';

export function SignupPage() {
  const { t } = useTranslation('auth');
  const { t: tCommon } = useTranslation('common');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting, errors },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupFormSchema),
    defaultValues: { displayName: '', email: '', password: '' },
  });

  async function onSubmit(values: SignupFormValues) {
    setError(null);
    const { error: authError } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: { data: { display_name: values.displayName } },
    });
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

  // Preserve the prior UX: the only inline validation message the page ever
  // showed was the localized weak-password text when password.length < 8.
  const weakPassword = !!errors.password;

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
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="displayName">{t('displayName')}</Label>
                  <Input
                    id="displayName"
                    type="text"
                    autoComplete="name"
                    {...register('displayName')}
                  />
                </div>
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
                    autoComplete="new-password"
                    {...register('password')}
                  />
                </div>
                {weakPassword && (
                  <p className="text-sm text-destructive">{t('errors.weakPassword')}</p>
                )}
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" disabled={isSubmitting} className="w-full">
                  {isSubmitting ? tCommon('loading') : t('signUp')}
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
