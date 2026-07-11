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

  it('keeps the panel variant full-height on mobile', () => {
    setViewport(false);
    render(
      <ResponsiveDialog open onOpenChange={() => {}} title="t" variant="panel">
        <p>contenido</p>
      </ResponsiveDialog>,
    );
    // A panel is a tall, scrolling surface: it claims most of the viewport.
    expect(screen.getByRole('dialog').className).toContain('h-[88vh]');
  });

  it('sizes the centered variant to its content on mobile, capped and scrollable', () => {
    setViewport(false);
    render(
      <ResponsiveDialog open onOpenChange={() => {}} title="t" variant="centered">
        <p>contenido</p>
      </ResponsiveDialog>,
    );
    const cls = screen.getByRole('dialog').className;
    // A short centered dialog must NOT be stretched to a panel's height.
    expect(cls).not.toContain('h-[88vh]');
    expect(cls).toContain('h-auto');
    expect(cls).toContain('max-h-[85vh]');
    expect(cls).toContain('overflow-y-auto');
  });

  it('pads the centered variant itself, on both breakpoints', () => {
    setViewport(false);
    const { unmount } = render(
      <ResponsiveDialog open onOpenChange={() => {}} title="t" variant="centered">
        <p>contenido</p>
      </ResponsiveDialog>,
    );
    // The shell owns the padding of a centered surface — callers add none.
    expect(screen.getByRole('dialog').className).toContain('p-4');
    unmount();

    setViewport(true);
    render(
      <ResponsiveDialog open onOpenChange={() => {}} title="t" variant="centered">
        <p>contenido</p>
      </ResponsiveDialog>,
    );
    expect(screen.getByRole('dialog').className).toContain('p-6');
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
