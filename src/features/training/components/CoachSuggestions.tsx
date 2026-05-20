import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  evaluateCoach,
  type CoachContext,
  type CoachSeverity,
  type CoachSuggestion,
} from '@/core/training';
import { cn } from '@/lib/utils';

interface Props {
  context: CoachContext;
  onApplySuggestedLoad?: (nextWeightKg: number) => void;
}

const PROGRESSION_RULES = new Set(['double-progression', 'rep-progression']);

const SEVERITY_STYLES: Record<CoachSeverity, string> = {
  info: 'border-muted-foreground/30 bg-muted/30',
  nudge: 'border-primary/40 bg-primary/5',
  warn: 'border-destructive/40 bg-destructive/5',
};

/**
 * Renders rule-engine output as a column of cards. For progression
 * rules, the suggested next load is exposed as an editable numeric
 * field (spec §0.15: rule provides the suggestion, user owns the
 * decision); tapping Apply commits it onto the next empty set row via
 * the prop callback.
 *
 * Headlines are i18n keys under the `coach` namespace; the `detail`
 * blob from the rule engine is the interpolation payload — so adding a
 * new rule never requires touching this component.
 */
export function CoachSuggestions({ context, onApplySuggestedLoad }: Props) {
  const suggestions = evaluateCoach(context);

  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-2">
      {suggestions.map((s) => (
        <SuggestionCard key={s.ruleId} suggestion={s} onApplySuggestedLoad={onApplySuggestedLoad} />
      ))}
    </div>
  );
}

interface CardProps {
  suggestion: CoachSuggestion;
  onApplySuggestedLoad?: (nextWeightKg: number) => void;
}

function SuggestionCard({ suggestion, onApplySuggestedLoad }: CardProps) {
  const { t } = useTranslation('coach');
  const isProgression = PROGRESSION_RULES.has(suggestion.ruleId);
  const suggestedFromRule = isProgression ? Number(suggestion.detail.nextWeightKg) : NaN;
  const [editable, setEditable] = useState<string>(
    Number.isFinite(suggestedFromRule) ? String(suggestedFromRule) : '',
  );

  // Keep the editable input in sync if the underlying rule output changes
  // (e.g. the user logged another set and the suggestion recomputed).
  useEffect(() => {
    if (isProgression && Number.isFinite(suggestedFromRule)) {
      setEditable(String(suggestedFromRule));
    }
  }, [isProgression, suggestedFromRule]);

  return (
    <div className={cn('rounded-md border p-3 text-sm', SEVERITY_STYLES[suggestion.severity])}>
      <div className="flex items-start gap-2">
        <Sparkles className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">
              {t(suggestion.headline, suggestion.detail)}
            </span>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
              {t(`severity.${suggestion.severity}`)}
            </Badge>
          </div>
          {isProgression && Number.isFinite(suggestedFromRule) && onApplySuggestedLoad && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t('suggestedNextLoad')}</span>
              <Input
                type="number"
                inputMode="decimal"
                step={0.5}
                min={0}
                value={editable}
                onChange={(e) => setEditable(e.target.value)}
                className="h-8 w-24"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => {
                  const n = Number(editable);
                  if (Number.isFinite(n) && n >= 0) onApplySuggestedLoad(n);
                }}
              >
                {t('apply')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
