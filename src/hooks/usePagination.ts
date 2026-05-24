import { useCallback, useEffect, useState } from 'react';

export const PAGE_SIZE_OPTIONS = [5, 10, 20, 50] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 10;

const STORAGE_KEY = 'hf.pageSize';

function readStoredPageSize(): PageSize {
  if (typeof localStorage === 'undefined') return DEFAULT_PAGE_SIZE;
  const raw = Number(localStorage.getItem(STORAGE_KEY));
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(raw)
    ? (raw as PageSize)
    : DEFAULT_PAGE_SIZE;
}

export interface UsePaginationArgs {
  total: number;
  /** A signature of the active query/filters — page resets to 1 when it changes. */
  resetKey: string;
}

export interface UsePaginationResult {
  page: number;
  pageSize: PageSize;
  pageCount: number;
  setPage: (page: number) => void;
  setPageSize: (size: PageSize) => void;
}

export function usePagination({ total, resetKey }: UsePaginationArgs): UsePaginationResult {
  const [pageSize, setPageSizeState] = useState<PageSize>(readStoredPageSize);
  const [page, setPage] = useState(1);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // Reset to the first page whenever the query/filters change.
  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  // Clamp the current page when the result set shrinks (e.g. a narrower filter).
  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);

  const setPageSize = useCallback((size: PageSize) => {
    setPageSizeState(size);
    setPage(1);
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, String(size));
  }, []);

  return { page, pageSize, pageCount, setPage, setPageSize };
}
