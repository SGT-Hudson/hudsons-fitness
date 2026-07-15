// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useActiveSection } from './useActiveSection';

const wrapper = (path: string) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>;
  };

beforeEach(() => localStorage.clear());

describe('useActiveSection', () => {
  it('derives the section from a section-owned route', () => {
    const { result } = renderHook(() => useActiveSection(), { wrapper: wrapper('/training') });
    expect(result.current).toBe('gym');
  });

  it('persists the section so shared routes can recall it', () => {
    renderHook(() => useActiveSection(), { wrapper: wrapper('/training') });
    expect(localStorage.getItem('hf-section')).toBe('gym');
    const { result } = renderHook(() => useActiveSection(), { wrapper: wrapper('/progress') });
    expect(result.current).toBe('gym');
  });

  it('defaults shared routes to nutri when nothing is stored', () => {
    const { result } = renderHook(() => useActiveSection(), { wrapper: wrapper('/progress') });
    expect(result.current).toBe('nutri');
  });

  it('treats a stored legacy "entreno" value as gym on shared routes', () => {
    localStorage.setItem('hf-section', 'entreno');
    const { result } = renderHook(() => useActiveSection(), { wrapper: wrapper('/progress') });
    expect(result.current).toBe('gym');
  });
});
