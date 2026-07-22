// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';

// The profile query is the only input; stubbed at the hook boundary so the
// test can model "still loading", "says English", "says Spanish".
let profileData: { language: string } | undefined;
vi.mock('@/features/profile/hooks', () => ({
  useProfile: () => ({ data: profileData }),
}));

import { ProfileLanguageSync } from './ProfileLanguageSync';

/** A child that renders whatever language i18next is on when it first paints. */
function Child() {
  const { t } = useTranslation('nav');
  return <span data-testid="child">{t('diary')}</span>;
}

beforeEach(async () => {
  profileData = undefined;
  await i18n.changeLanguage('en');
});

describe('ProfileLanguageSync', () => {
  it('never paints a child in the detector’s language when the profile disagrees', async () => {
    // i18next starts on English (the detector's guess); the profile says
    // Spanish. The regression this pins: the child used to render once in
    // English and swap a frame later, because the reconcile ran in an effect.
    profileData = { language: 'es' };
    render(
      <ProfileLanguageSync>
        <Child />
      </ProfileLanguageSync>,
    );

    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('child')).toHaveTextContent('Diario'));
  });

  it('renders straight through when the profile agrees with the current language', async () => {
    profileData = { language: 'en' };
    render(
      <ProfileLanguageSync>
        <Child />
      </ProfileLanguageSync>,
    );

    await waitFor(() => expect(screen.getByTestId('child')).toHaveTextContent('Diary'));
    expect(i18n.language).toBe('en');
  });

  it('does not hold the tree while there is no profile to wait for', () => {
    // Signed out, or the profile query still in flight: the detector's choice
    // is the answer, and the route guards own that window.
    profileData = undefined;
    render(
      <ProfileLanguageSync>
        <Child />
      </ProfileLanguageSync>,
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('opens the gate even when the profile carries a language i18next cannot honour', async () => {
    // Gating on "the languages now match" would strand this user on the
    // loader forever; the one-shot flag is what makes that impossible.
    profileData = { language: 'fr' };
    render(
      <ProfileLanguageSync>
        <Child />
      </ProfileLanguageSync>,
    );

    await waitFor(() => expect(screen.getByTestId('child')).toBeInTheDocument());
  });
});
