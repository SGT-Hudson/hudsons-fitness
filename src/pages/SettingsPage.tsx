import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ChevronRight, Globe, Palette, Ruler, User, UserCog } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile, useUpdateProfile } from '@/features/profile/hooks';
import { useTheme, type Theme } from '@/features/theme/ThemeProvider';

type Lang = 'es' | 'en';
type Tone = 'indigo' | 'green' | 'amber' | 'rose';

const TONE: Record<Tone, string> = {
  indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400',
  green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400',
};

function IconChip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', TONE[tone])}>
      {children}
    </span>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="overflow-hidden rounded-xl border bg-card">{children}</div>
    </div>
  );
}

function ControlRow({
  icon, tone, label, children,
}: { icon: React.ReactNode; tone: Tone; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
      <IconChip tone={tone}>{icon}</IconChip>
      <span className="flex-1 text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}

function LinkRow({
  to, icon, tone, label,
}: { to: string; icon: React.ReactNode; tone: Tone; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-muted"
    >
      <IconChip tone={tone}>{icon}</IconChip>
      <span className="flex-1 text-sm font-medium">{label}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

export function SettingsPage() {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const update = useUpdateProfile();
  const { theme, setTheme } = useTheme();

  const language: Lang = profile?.language === 'en' ? 'en' : 'es';

  async function changeLanguage(next: Lang) {
    if (next === language) return;
    await i18n.changeLanguage(next);
    update.mutate({ language: next });
  }

  if (isLoading || !profile) {
    return <p className="text-sm text-muted-foreground">{tCommon('loading')}</p>;
  }

  const name = profile.display_name?.trim() || (user?.email?.split('@')[0] ?? '');
  const initial = (name || 'U').charAt(0).toUpperCase();

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>

      <Link
        to="/settings/profile"
        className="flex items-center gap-4 rounded-xl border bg-linear-to-br from-primary/5 to-primary/10 p-4 transition-colors hover:from-primary/10 hover:to-primary/15"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
          {initial}
        </span>
        <div className="min-w-0">
          <div className="truncate font-semibold">{name}</div>
          <div className="truncate text-sm text-muted-foreground">{user?.email}</div>
        </div>
        <ChevronRight className="ml-auto h-5 w-5 shrink-0 text-muted-foreground" />
      </Link>

      <Group label={t('groups.preferences')}>
        <ControlRow icon={<Globe className="h-4 w-4" />} tone="green" label={t('language.title')}>
          <div className="flex rounded-lg border p-0.5 text-xs">
            {(['es', 'en'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => void changeLanguage(l)}
                className={cn(
                  'rounded-md px-3 py-1 font-semibold transition-colors',
                  language === l ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                )}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </ControlRow>
        <ControlRow icon={<Palette className="h-4 w-4" />} tone="amber" label={t('appearance.theme')}>
          <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
            <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="system">{t('appearance.system')}</SelectItem>
              <SelectItem value="light">{t('appearance.light')}</SelectItem>
              <SelectItem value="dark">{t('appearance.dark')}</SelectItem>
            </SelectContent>
          </Select>
        </ControlRow>
      </Group>

      <Group label={t('groups.you')}>
        <LinkRow to="/settings/profile" icon={<User className="h-4 w-4" />} tone="indigo" label={t('profile.title')} />
        <LinkRow to="/settings/biometrics" icon={<Ruler className="h-4 w-4" />} tone="indigo" label={t('biometrics.title')} />
      </Group>

      <Group label={t('groups.account')}>
        <LinkRow to="/settings/account" icon={<UserCog className="h-4 w-4" />} tone="rose" label={t('rows.accountAndSession')} />
      </Group>
    </div>
  );
}
