import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { addDays, isAfter, parseISO } from 'date-fns';
import { formatDate, isoDate, todayInTZ, type Locale } from '@/lib/dates';

interface Props {
  date: string;
  onChange: (newDate: string) => void;
}

export function DateNavigator({ date, onChange }: Props) {
  const { t, i18n } = useTranslation('diario');
  const locale = (i18n.language?.startsWith('en') ? 'en' : 'es') as Locale;
  // Canonical Europe/Madrid "today" (R-09 follow-up): the date-input `max`,
  // the isToday check, and the future-shift guard must all agree with the
  // rest of the app's day boundary. Host-TZ `isoDate()` would be a day behind
  // near Madrid midnight on a UTC host.
  const today = todayInTZ();
  const isToday = date === today;

  function shift(days: number) {
    const next = addDays(parseISO(date), days);
    if (isAfter(next, parseISO(today))) return;
    onChange(isoDate(next));
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button
        variant="outline"
        size="icon"
        aria-label={t('date.previous')}
        onClick={() => shift(-1)}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        aria-label={t('date.next')}
        onClick={() => shift(1)}
        disabled={isToday}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Input
        type="date"
        max={today}
        value={date}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
        className="w-auto"
      />
      <span className="text-sm text-muted-foreground">
        {formatDate(date, "EEEE d 'de' MMMM", locale)}
      </span>
      {!isToday && (
        <Button variant="ghost" size="sm" onClick={() => onChange(today)}>
          {t('date.today')}
        </Button>
      )}
    </div>
  );
}
