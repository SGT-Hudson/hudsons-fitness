import { describe, it, expect } from 'vitest';
import { bottomNavItems, sectionOf, SIDEBAR_GROUPS } from './nav-config';

describe('bottomNavItems', () => {
  it('nutri bar: diario, planificador, recetas, progreso, más', () => {
    expect(bottomNavItems('nutri').map((i) => i.key)).toEqual([
      'diary', 'planner', 'recipes', 'progress', 'more',
    ]);
  });
  it('gym bar: hoy, rutinas, ejercicios, progreso', () => {
    expect(bottomNavItems('gym').map((i) => i.key)).toEqual([
      'today', 'routine', 'exercises', 'progress',
    ]);
  });
});

describe('sectionOf', () => {
  it.each([
    ['/diary', 'nutri'], ['/diary/2026-07-07', 'nutri'], ['/planner', 'nutri'],
    ['/recipes', 'nutri'], ['/recipes/ingredients', 'nutri'], ['/templates', 'nutri'],
    ['/templates/abc', 'nutri'],
    ['/training', 'gym'], ['/training/run', 'gym'], ['/routine', 'gym'], ['/exercises', 'gym'],
  ])('%s → %s', (path, section) => expect(sectionOf(path)).toBe(section));
  it.each(['/progress', '/settings', '/more'])('%s is shared (null)', (path) =>
    expect(sectionOf(path)).toBeNull(),
  );
});

describe('SIDEBAR_GROUPS', () => {
  it('renders Nutrición / Entrenamiento / Análisis with the canvas items', () => {
    expect(SIDEBAR_GROUPS.map((g) => g.key)).toEqual(['nutricion', 'entreno', 'analisis']);
    expect(SIDEBAR_GROUPS.map((g) => g.accent)).toEqual(['nutri', 'gym', null]);
    expect(SIDEBAR_GROUPS.map((g) => g.items.map((i) => i.key))).toEqual([
      ['diary', 'recipes', 'ingredients', 'planner'],
      ['today', 'routine', 'exercises'],
      ['progress', 'goals'],
    ]);
  });
  it('every item has a route and an icon', () => {
    for (const g of SIDEBAR_GROUPS) for (const i of g.items) {
      expect(i.route.startsWith('/')).toBe(true);
      expect(i.icon).toBeTruthy();
    }
  });
});
