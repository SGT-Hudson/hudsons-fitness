import {
  Activity,
  BookOpen,
  CalendarDays,
  Dumbbell,
  LineChart,
  NotebookText,
  Repeat,
  type LucideIcon,
} from 'lucide-react';

export type Section = 'nutri' | 'gym';
export type NavGroup = 'shared' | Section;

export interface NavItem {
  /** i18n key in the `nav` namespace. */
  key: string;
  /** Route the item navigates to. */
  route: string;
  group: NavGroup;
  icon: LucideIcon;
  /** Appears in the mobile bottom nav. */
  mobile: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'progress', route: '/progress', group: 'shared', icon: LineChart, mobile: true },
  { key: 'diary', route: '/diary', group: 'nutri', icon: NotebookText, mobile: true },
  { key: 'planner', route: '/planner', group: 'nutri', icon: CalendarDays, mobile: true },
  { key: 'recipes', route: '/recipes', group: 'nutri', icon: BookOpen, mobile: true },
  { key: 'today', route: '/training', group: 'gym', icon: Activity, mobile: true },
  { key: 'routine', route: '/routine', group: 'gym', icon: Repeat, mobile: true },
  { key: 'exercises', route: '/exercises', group: 'gym', icon: Dumbbell, mobile: true },
];

/** Section that owns a pathname, or null for shared/unknown routes. */
export function sectionOf(pathname: string): Section | null {
  const owned = NAV_ITEMS.filter((i) => i.group !== 'shared')
    .sort((a, b) => b.route.length - a.route.length)
    .find((i) => pathname === i.route || pathname.startsWith(`${i.route}/`));
  return owned ? (owned.group as Section) : null;
}

/** Bottom-nav items for a section: its own mobile items + shared Progreso. */
export function bottomNavItems(section: Section): NavItem[] {
  const own = NAV_ITEMS.filter((i) => i.mobile && i.group === section);
  const progress = NAV_ITEMS.find((i) => i.key === 'progress')!;
  return [...own, progress];
}

/**
 * i18n `nav.section.*` keys are unchanged by the identity rename (i18n
 * namespaces are out of scope for this task); map the internal Section
 * value to its stable translation key.
 */
export const SECTION_I18N_KEY: Record<Section, string> = {
  nutri: 'nutricion',
  gym: 'entreno',
};

export interface SidebarGroup {
  group: NavGroup;
  items: NavItem[];
}

/** Sidebar groups in render order: shared → nutri → gym. */
export function sidebarGroups(): SidebarGroup[] {
  const order: NavGroup[] = ['shared', 'nutri', 'gym'];
  return order.map((group) => ({
    group,
    items: NAV_ITEMS.filter((i) => i.group === group),
  }));
}
