import {
  Activity,
  Apple,
  CalendarDays,
  ClipboardPen,
  Dumbbell,
  Ellipsis,
  NotebookPen,
  Target,
  TrendingUp,
  Utensils,
  type LucideIcon,
} from 'lucide-react';

export type Section = 'nutri' | 'gym';

export interface NavItem {
  /** i18n key in the `nav` namespace. */
  key: string;
  route: string;
  icon: LucideIcon;
}

/* Canvas icon mapping (icons.jsx → lucide): Diario=NotebookPen, Plan=CalendarDays,
 * Recetas=Utensils, Progreso=TrendingUp, Más=Ellipsis, Rutinas=ClipboardPen,
 * Ejercicios=Dumbbell, Ingredientes=Apple, Objetivos=Target. Hoy keeps Activity
 * (canvas glyph is custom; no icon port per spec). */
const ITEM = {
  diary: { key: 'diary', route: '/diary', icon: NotebookPen },
  planner: { key: 'planner', route: '/planner', icon: CalendarDays },
  recipes: { key: 'recipes', route: '/recipes', icon: Utensils },
  ingredients: { key: 'ingredients', route: '/recipes/ingredients', icon: Apple },
  today: { key: 'today', route: '/training', icon: Activity },
  routine: { key: 'routine', route: '/routine', icon: ClipboardPen },
  exercises: { key: 'exercises', route: '/exercises', icon: Dumbbell },
  progress: { key: 'progress', route: '/progress', icon: TrendingUp },
  goals: { key: 'goals', route: '/progress/goals', icon: Target },
  more: { key: 'more', route: '/more', icon: Ellipsis },
} satisfies Record<string, NavItem>;

/** Bottom-nav items per section (spec §4.1). */
const BOTTOM_NAV: Record<Section, NavItem[]> = {
  nutri: [ITEM.diary, ITEM.planner, ITEM.recipes, ITEM.progress, ITEM.more],
  gym: [ITEM.today, ITEM.routine, ITEM.exercises, ITEM.progress],
};

export function bottomNavItems(section: Section): NavItem[] {
  return BOTTOM_NAV[section];
}

/** Route prefixes owned by a section (drives accent + which bottom bar renders). */
const SECTION_ROUTES: Record<Section, string[]> = {
  nutri: ['/diary', '/planner', '/recipes', '/templates'],
  gym: ['/training', '/routine', '/exercises'],
};

/** Section that owns a pathname, or null for shared routes (/progress, /settings, /more). */
export function sectionOf(pathname: string): Section | null {
  for (const section of ['nutri', 'gym'] as const) {
    if (
      SECTION_ROUTES[section].some(
        (r) => pathname === r || pathname.startsWith(`${r}/`),
      )
    ) {
      return section;
    }
  }
  return null;
}

export interface SidebarGroup {
  /** i18n key under `nav:groups.*`. */
  key: 'nutricion' | 'entreno' | 'analisis';
  /** Accent family for active items; null = neutral (Análisis). */
  accent: Section | null;
  items: NavItem[];
}

/** Web sidebar groups (canvas shell.jsx lines 20–36). */
export const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    key: 'nutricion',
    accent: 'nutri',
    items: [ITEM.diary, ITEM.recipes, ITEM.ingredients, ITEM.planner],
  },
  { key: 'entreno', accent: 'gym', items: [ITEM.today, ITEM.routine, ITEM.exercises] },
  { key: 'analisis', accent: null, items: [ITEM.progress, ITEM.goals] },
];

/**
 * i18n `nav.section.*` keys are unchanged by the identity rename; map the
 * internal Section value to its stable translation key.
 */
export const SECTION_I18N_KEY: Record<Section, string> = {
  nutri: 'nutricion',
  gym: 'entreno',
};
