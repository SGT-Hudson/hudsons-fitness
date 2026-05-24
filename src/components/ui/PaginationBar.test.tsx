// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { PaginationBar, pageRange } from './PaginationBar';

describe('pageRange', () => {
  it('lists every page when there are few', () => {
    expect(pageRange(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });
  it('inserts ellipses around the current page for many', () => {
    expect(pageRange(6, 12)).toEqual([1, 'ellipsis', 5, 6, 7, 'ellipsis', 12]);
  });
});

describe('PaginationBar', () => {
  const base = {
    page: 1, pageSize: 10 as const, total: 0, pageCount: 1,
    onPageChange: vi.fn(), onPageSizeChange: vi.fn(),
  };

  it('renders nothing when total is 0', () => {
    const { container } = render(<PaginationBar {...base} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('fires onPageChange when a page button is clicked', async () => {
    const onPageChange = vi.fn();
    render(<PaginationBar {...base} total={30} pageCount={3} onPageChange={onPageChange} />);
    await userEvent.click(screen.getByRole('button', { name: '2' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('disables Previous on the first page', () => {
    render(<PaginationBar {...base} total={30} pageCount={3} />);
    expect(screen.getByRole('button', { name: /previous|anterior/i })).toBeDisabled();
  });
});
