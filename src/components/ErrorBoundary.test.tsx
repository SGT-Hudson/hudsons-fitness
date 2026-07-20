// @vitest-environment jsdom
import '@/i18n';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '@/i18n';
import { ErrorBoundary } from './ErrorBoundary';

function Boom(): never {
  throw new Error('SECRET INTERNAL DETAIL');
}

describe('ErrorBoundary', () => {
  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await i18n.changeLanguage('es');
  });

  it('shows translated copy, not hardcoded Spanish', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText(i18n.t('common:errors.boundary.title'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('common:errors.boundary.body'))).toBeInTheDocument();
  });

  it('never renders the raw error message to the user', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.queryByText(/SECRET INTERNAL DETAIL/)).not.toBeInTheDocument();
  });

  it('renders children untouched when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>fine</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('fine')).toBeInTheDocument();
  });
});
