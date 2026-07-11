import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResponsiveDialog } from './ResponsiveDialog';

// useMediaQuery reads window.matchMedia; drive it per-test.
function setViewport(isDesktop: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: isDesktop,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('ResponsiveDialog', () => {
  it('exposes its accessible name on desktop', () => {
    setViewport(true);
    render(
      <ResponsiveDialog open onOpenChange={() => {}} title="Añadir receta">
        <p>contenido</p>
      </ResponsiveDialog>,
    );
    expect(screen.getByRole('dialog', { name: 'Añadir receta' })).toBeInTheDocument();
    expect(screen.getByText('contenido')).toBeInTheDocument();
  });

  it('exposes its accessible name on mobile', () => {
    setViewport(false);
    render(
      <ResponsiveDialog open onOpenChange={() => {}} title="Añadir receta">
        <p>contenido</p>
      </ResponsiveDialog>,
    );
    expect(screen.getByRole('dialog', { name: 'Añadir receta' })).toBeInTheDocument();
  });

  it('tells its children which breakpoint they are on', () => {
    setViewport(false);
    render(
      <ResponsiveDialog open onOpenChange={() => {}} title="t">
        {({ isMobile }) => <span>{isMobile ? 'mobile' : 'desktop'}</span>}
      </ResponsiveDialog>,
    );
    expect(screen.getByText('mobile')).toBeInTheDocument();
  });

  it('docks the panel variant to the right edge on desktop', () => {
    setViewport(true);
    render(
      <ResponsiveDialog open onOpenChange={() => {}} title="t" variant="panel">
        <p>contenido</p>
      </ResponsiveDialog>,
    );
    // The panel variant overrides radix's centring to pin the sheet right.
    expect(screen.getByRole('dialog').className).toContain('right-0');
  });

  it('renders nothing when closed', () => {
    setViewport(true);
    render(
      <ResponsiveDialog open={false} onOpenChange={() => {}} title="t">
        <p>contenido</p>
      </ResponsiveDialog>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
