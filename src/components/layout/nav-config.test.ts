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
    expect(sectionOf('/diary')).toBe('nutri');
    expect(sectionOf('/diary/2026-05-21')).toBe('nutri');
    expect(sectionOf('/recipes/ingredients')).toBe('nutri');
    expect(sectionOf('/training')).toBe('gym');
    expect(sectionOf('/routine')).toBe('gym');
  });

  it('sectionOf returns null for shared routes', () => {
    expect(sectionOf('/progress')).toBeNull();
    expect(sectionOf('/progress/goals')).toBeNull();
    expect(sectionOf('/settings')).toBeNull();
  });

  it('bottom nav shows the section tabs plus shared Progreso', () => {
    const nut = bottomNavItems('nutri').map((i) => i.key);
    expect(nut).toEqual(['diary', 'planner', 'recipes', 'progress']);
    const ent = bottomNavItems('gym').map((i) => i.key);
    expect(ent).toEqual(['today', 'routine', 'exercises', 'progress']);
  });

  it('sidebar groups render shared, then nutri, then gym', () => {
    expect(sidebarGroups().map((g) => g.group)).toEqual([
      'shared',
      'nutri',
      'gym',
    ]);
    const shared = sidebarGroups()[0].items.map((i) => i.key);
    expect(shared).toEqual(['progress']);
  });
});
