import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  times: string[];
  onChange: (times: string[]) => void;
}

export function MealTimesEditor({ times, onChange }: Props) {
  const { t } = useTranslation('planning');

  function setAt(idx: number, value: string) {
    const next = [...times];
    next[idx] = value;
    onChange(next);
  }

  function addAt() {
    onChange([...times, '20:00']);
  }

  function removeAt(idx: number) {
    onChange(times.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{t('editor.mealTimes')}</div>
      <div className="flex flex-wrap gap-2">
        {times.map((time, idx) => (
          <div key={idx} className="flex items-center gap-1">
            <Input
              type="time"
              value={time}
              onChange={(e) => setAt(idx, e.target.value)}
              className="w-28"
            />
            {times.length > 1 && (
              <Button
                type="button"
                variant="destructive"
                size="icon"
                aria-label={t('editor.removeMeal')}
                onClick={() => removeAt(idx)}
                className="h-6 w-6"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addAt}
          disabled={times.length >= 8}
        >
          <Plus className="h-4 w-4" />
          {t('editor.addMeal')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('editor.mealTimesHint')}</p>
    </div>
  );
}
