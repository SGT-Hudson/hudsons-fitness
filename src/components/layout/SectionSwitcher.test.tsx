// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import i18n from '@/i18n';
import { SectionSwitcher } from './SectionSwitcher';

function LocationProbe() {
  return <span data-testid="loc">{useLocation().pathname}</span>;
}

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage('es');
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

describe('SectionSwitcher', () => {
  it('shows the active section and switches to the other on select', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/diary']}>
        <SectionSwitcher />
        <LocationProbe />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /Nutrición/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Nutrición/ }));
    await user.click(screen.getByText('Entreno'));
    expect(screen.getByTestId('loc').textContent).toBe('/training');
  });
});
