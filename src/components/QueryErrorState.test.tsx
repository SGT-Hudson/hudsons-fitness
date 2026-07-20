// @vitest-environment jsdom
import '@/i18n';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import i18n from '@/i18n';
import { QueryErrorState } from './QueryErrorState';

const notFound = <p>NOT FOUND SLOT</p>;

describe('QueryErrorState', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('es');
  });

  it('renders the screen\'s own not-found node for PGRST116', () => {
    render(<QueryErrorState error={{ code: 'PGRST116' }} notFound={notFound} />);
    expect(screen.getByText('NOT FOUND SLOT')).toBeInTheDocument();
    expect(screen.queryByText(i18n.t('common:errors.loadFailedTitle'))).not.toBeInTheDocument();
  });

  it('renders a load failure — not the not-found node — when the fetch failed', () => {
    render(<QueryErrorState error={new TypeError('Failed to fetch')} notFound={notFound} />);
    expect(screen.getByText(i18n.t('common:errors.loadFailedTitle'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('common:errors.offline'))).toBeInTheDocument();
    expect(screen.queryByText('NOT FOUND SLOT')).not.toBeInTheDocument();
  });

  it('uses the generic copy for an unrecognised error', () => {
    render(<QueryErrorState error={{ code: 'PGRST999' }} notFound={notFound} />);
    expect(screen.getByText(i18n.t('common:errors.generic'))).toBeInTheDocument();
  });

  it('offers a retry that calls onRetry', () => {
    const onRetry = vi.fn();
    render(<QueryErrorState error={new TypeError('x')} notFound={notFound} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('common:errors.retry') }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('omits the retry button when no onRetry is given', () => {
    render(<QueryErrorState error={new TypeError('x')} notFound={notFound} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('tells the user to reload on a stale-schema error, with no retry', () => {
    render(<QueryErrorState error={{ code: 'PGRST205' }} notFound={notFound} onRetry={vi.fn()} />);
    expect(screen.getByText(i18n.t('common:errors.staleSchemaTitle'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('common:errors.staleSchema'))).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n.t('common:errors.reload') }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: i18n.t('common:errors.retry') })).toBeNull();
  });
});
