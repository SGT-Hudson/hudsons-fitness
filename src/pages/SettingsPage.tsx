import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ChevronRight, Globe, Ruler, SunMoon, User, UserCog } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { PageShell } from '@/components/layout/PageShell';
import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile, useUpdateProfile } from '@/features/profile/hooks';
import { useTheme, type Theme } from '@/features/theme/ThemeProvider';

type Lang = 'es' | 'en';
type Tone = 'indigo' | 'green' | 'amber' | 'rose';

const TONE: Record<Tone, string> = {
  indigo: 'bg-gym-soft text-gym-ink',
  green: 'bg-nutri-soft text-nutri-ink',
  amber: 'bg-amber-soft text-amber-ink',
  rose: 'bg-danger-soft text-danger-ink',
};

function IconChip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={cn('grid size-[30px] shrink-0 place-items-center rounded-[9px]', TONE[tone])}>
      {children}
    </span>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="px-1 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        {label}
      </p>
      <Card className="overflow-hidden p-0">{children}</Card>
    </div>
  );
}

function Row({
  tone, icon, label, sub, control, chevron, first,
}: {
  tone: Tone;
  icon: React.ReactNode;
  label: string;
  sub?: string;
  control?: React.ReactNode;
  chevron?: boolean;
  first?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex min-h-[50px] items-center gap-[11px] px-[13px] py-2.5',
        !first && 'border-t',
      )}
    >
      <IconChip tone={tone}>{icon}</IconChip>
      <div className="min-w-0 flex-1 leading-tight">
        <span className="block text-[13px] font-medium">{label}</span>
        {sub && <span className="mt-px block text-[10.5px] text-text-dim">{sub}</span>}
      </div>
      {control}
      {chevron && <ChevronRight className="size-[15px] shrink-0 text-text-dim" />}
    </div>
  );
}

function LinkRow({ to, ...row }: Parameters<typeof Row>[0] & { to: string }) {
  return (
    <Link to={to} className="block transition-colors hover:bg-muted">
      <Row {...row} chevron />
    </Link>
  );
}

function Segmented<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex shrink-0 gap-0.5 rounded-[9px] border bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-[7px] px-2.5 py-1 text-[11px] transition-colors',
            o.value === value
              ? 'bg-accent font-semibold text-accent-foreground'
              : 'font-medium text-text-dim',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
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
    return (
      <PageShell title={t('title')} back="/more">
        <p className="text-sm text-muted-foreground">{tCommon('loading')}</p>
      </PageShell>
    );
  }

  const name = profile.display_name?.trim() || (user?.email?.split('@')[0] ?? '');
  const initial = (name || 'U').charAt(0).toUpperCase();

  return (
    <PageShell title={t('title')} back="/more">
      <div className="flex max-w-2xl flex-col gap-5">
        <Link
          to="/settings/profile"
          className="flex items-center gap-[13px] rounded-[14px] border border-accent-line bg-accent-soft p-3.5 transition-opacity hover:opacity-90"
        >
          <span className="grid size-[46px] shrink-0 place-items-center rounded-full bg-accent text-[19px] font-bold text-accent-foreground">
            {initial}
          </span>
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-[14.5px] font-semibold">{name}</span>
            <span className="truncate text-[11.5px] text-muted-foreground">{user?.email}</span>
          </div>
          <ChevronRight className="size-4 shrink-0 text-text-dim" />
        </Link>

        <Group label={t('groups.preferences')}>
          <Row
            first
            tone="green"
            icon={<Globe className="size-4" />}
            label={t('language.title')}
            control={
              <Segmented
                value={language}
                onChange={(l) => void changeLanguage(l)}
                options={[
                  { value: 'es', label: 'ES' },
                  { value: 'en', label: 'EN' },
                ]}
              />
            }
          />
          <Row
            tone="amber"
            icon={<SunMoon className="size-4" />}
            label={t('appearance.theme')}
            control={
              <Segmented
                value={theme}
                onChange={(v) => setTheme(v as Theme)}
                options={[
                  { value: 'system', label: t('appearance.system') },
                  { value: 'light', label: t('appearance.light') },
                  { value: 'dark', label: t('appearance.dark') },
                ]}
              />
            }
          />
        </Group>

        <Group label={t('groups.you')}>
          <LinkRow
            first
            to="/settings/profile"
            tone="indigo"
            icon={<User className="size-4" />}
            label={t('profile.title')}
            sub={t('rows.profileSub')}
          />
          <LinkRow
            to="/settings/biometrics"
            tone="indigo"
            icon={<Ruler className="size-4" />}
            label={t('biometrics.title')}
            sub={t('rows.biometricsSub')}
          />
        </Group>

        <Group label={t('groups.account')}>
          <LinkRow
            first
            to="/settings/account"
            tone="rose"
            icon={<UserCog className="size-4" />}
            label={t('rows.accountAndSession')}
            sub={t('rows.accountSub')}
          />
        </Group>
      </div>
    </PageShell>
  );
}
