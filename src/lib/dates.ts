import { differenceInCalendarDays, format, parseISO, startOfWeek } from 'date-fns';
import { es, enGB } from 'date-fns/locale';

export type Locale = 'es' | 'en';

const LOCALES = { es, en: enGB } as const;

export function formatDate(date: Date | string, fmt: string, locale: Locale = 'es') {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, fmt, { locale: LOCALES[locale] });
}

export function isoDate(date: Date = new Date()): string {
  return format(date, 'yyyy-MM-dd');
}

/** Monday of the week containing `date`, ISO weekday convention. */
export function mondayOf(date: Date = new Date()): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}

/** Whole calendar days between two dates (positive when `to` is after `from`). */
export function daysBetween(from: Date | string, to: Date | string = new Date()): number {
  const a = typeof from === 'string' ? parseISO(from) : from;
  const b = typeof to === 'string' ? parseISO(to) : to;
  return differenceInCalendarDays(b, a);
}
