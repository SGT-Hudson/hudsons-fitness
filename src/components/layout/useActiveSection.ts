import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { sectionOf, type Section } from './nav-config';

const STORAGE_KEY = 'hf-section';

/**
 * The section the mobile shell should present. Section-owned routes resolve
 * directly (and are remembered); shared routes (`/progress`, `/settings`)
 * fall back to the last remembered section (default nutri).
 */
export function useActiveSection(): Section {
  const { pathname } = useLocation();
  const routeSection = sectionOf(pathname);

  useEffect(() => {
    if (routeSection) localStorage.setItem(STORAGE_KEY, routeSection);
  }, [routeSection]);

  if (routeSection) return routeSection;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'gym' || stored === 'entreno' ? 'gym' : 'nutri';
}
