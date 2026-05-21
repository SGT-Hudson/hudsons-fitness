import { describe, it, expect } from 'vitest';
import {
  NAV_ITEMS,
  sectionOf,
  bottomNavItems,
  sidebarGroups,
} from './nav-config';

describe('nav-config', () => {
  it('every item has a route and an i18n key', () => {
    for (const item of NAV_ITEMS) {
      expect(item.route.startsWith('/')).toBe(true);
      expect(item.key.length).toBeGreaterThan(0);
    }
  });

  it('sectionOf maps section-owned routes to their section', () => {
    expect(sectionOf('/diary')).toBe('nutricion');
    expect(sectionOf('/diary/2026-05-21')).toBe('nutricion');
    expect(sectionOf('/recipes/ingredients')).toBe('nutricion');
    expect(sectionOf('/training')).toBe('entreno');
    expect(sectionOf('/routine')).toBe('entreno');
  });

  it('sectionOf returns null for shared routes', () => {
    expect(sectionOf('/home')).toBeNull();
    expect(sectionOf('/progress')).toBeNull();
    expect(sectionOf('/progress/goals')).toBeNull();
    expect(sectionOf('/settings')).toBeNull();
  });

  it('bottom nav shows the section tabs plus shared Progreso, never Home', () => {
    const nut = bottomNavItems('nutricion').map((i) => i.key);
    expect(nut).toEqual(['diary', 'planner', 'recipes', 'progress']);
    const ent = bottomNavItems('entreno').map((i) => i.key);
    expect(ent).toEqual(['today', 'routine', 'exercises', 'progress']);
    expect(nut).not.toContain('home');
  });

  it('sidebar groups render shared, then nutricion, then entreno', () => {
    expect(sidebarGroups().map((g) => g.group)).toEqual([
      'shared',
      'nutricion',
      'entreno',
    ]);
    const shared = sidebarGroups()[0].items.map((i) => i.key);
    expect(shared).toEqual(['home', 'progress']);
  });
});
