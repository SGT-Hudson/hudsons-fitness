// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { AvatarMenu } from './AvatarMenu';

const signOut = vi.fn();
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ signOut, user: { email: 'qa@x.dev' } }),
}));

beforeEach(async () => {
  signOut.mockReset();
  await i18n.changeLanguage('es');
  // jsdom lacks the pointer-capture / scrollIntoView APIs Radix menus call.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

describe('AvatarMenu', () => {
  it('opens and exposes Ajustes + Salir', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AvatarMenu />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: i18n.t('nav:account') }));
    expect(screen.getByText(i18n.t('nav:settings'))).toBeInTheDocument();
    await user.click(screen.getByText(i18n.t('auth:signOut')));
    expect(signOut).toHaveBeenCalledOnce();
  });
});
