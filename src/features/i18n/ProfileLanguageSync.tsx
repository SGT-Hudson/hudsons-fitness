import { useEffect } from 'react';
import i18n from '@/i18n';
import { useProfile } from '@/features/profile/hooks';

/**
 * Makes `profile.language` the authoritative i18n source for authenticated
 * users (D-E1 / R-13). The pre-auth and fallback chain
 * (`localStorage → navigator → es`) is handled by the i18next detector and is
 * left untouched; this only reconciles the language once the authenticated
 * user's profile row is known.
 *
 * Lives in a dedicated component (not directly in `AuthProvider`) because
 * `useProfile` depends on `useAuth`, so putting the effect inside
 * `AuthProvider` would be a circular dependency. Mounted as a child of
 * `AuthProvider` (and `QueryClientProvider`), it has both contexts available.
 *
 * Loop guard: only calls `changeLanguage` when the profile's base language
 * differs from i18next's current base language, so re-applying the same
 * language is a no-op and the effect cannot ping-pong.
 */
export function ProfileLanguageSync() {
  const { data: profile } = useProfile();
  const profileLang = profile?.language ?? null;

  useEffect(() => {
    if (!profileLang) return;
    const profileBase = profileLang.split('-')[0];
    const currentBase = i18n.language.split('-')[0];
    if (profileBase === currentBase) return;
    void i18n.changeLanguage(profileBase);
  }, [profileLang]);

  return null;
}
