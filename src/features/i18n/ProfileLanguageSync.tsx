import { useLayoutEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { FullPageLoader } from '@/components/ui/FullPageLoader';
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
 * **It gates its children rather than only running an effect**, and that is the
 * whole point: the detector's guess and the profile's answer disagree on a
 * first visit from a device whose browser is in the other language, and the
 * route guards already hold the tree until the profile resolves — so by the
 * time anything renders, the right language is known but had not been applied
 * yet. Reconciling in an effect therefore painted a full screen in the guessed
 * language and swapped it a frame or two later; because `changeLanguage` does
 * not propagate synchronously, `useLayoutEffect` did not close that window
 * either (measured: ~70 ms of the wrong language, part of it with the header
 * already switched and the nav not yet — a visibly mixed screen). Holding the
 * loader for those milliseconds is the honest trade: nothing is shown in a
 * language we already know is wrong.
 *
 * The gate opens on `applied`, a one-shot flag, NOT on "the languages now
 * match": a profile carrying an unsupported language would never match, and
 * gating on agreement would leave such a user staring at the loader forever.
 * Whatever `changeLanguage` settles on, the flag flips and the app renders.
 *
 * Loop guard: only calls `changeLanguage` when the profile's base language
 * differs from i18next's current base language, so re-applying the same
 * language is a no-op and the effect cannot ping-pong.
 */
export function ProfileLanguageSync({ children }: { children: ReactNode }) {
  const { data: profile } = useProfile();
  const profileLang = profile?.language ?? null;
  // Subscribes this component to `languageChanged`, so the render below sees
  // the applied language rather than the one captured at mount.
  useTranslation();
  const [applied, setApplied] = useState(false);

  useLayoutEffect(() => {
    if (!profileLang) return;
    const profileBase = profileLang.split('-')[0];
    const currentBase = i18n.language.split('-')[0];
    if (profileBase === currentBase) {
      setApplied(true);
      return;
    }
    void i18n.changeLanguage(profileBase).finally(() => setApplied(true));
  }, [profileLang]);

  // No profile yet (signed out, or the query still in flight) means there is no
  // authoritative language to wait for: the detector's choice is the answer,
  // and the route guards are already showing their own loader in that window.
  if (profileLang && !applied) return <FullPageLoader />;
  return <>{children}</>;
}
