import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const next = i18n.language?.startsWith('en') ? 'es' : 'en';

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => void i18n.changeLanguage(next)}
      aria-label="Change language"
    >
      {next.toUpperCase()}
    </Button>
  );
}
