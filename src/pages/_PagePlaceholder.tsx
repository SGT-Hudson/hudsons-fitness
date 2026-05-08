import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  titleKey: string;
  description?: string;
}

export function PagePlaceholder({ titleKey, description }: Props) {
  const { t } = useTranslation('nav');
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">{t(titleKey)}</h1>
      <Card>
        <CardHeader>
          <CardTitle>Próximamente</CardTitle>
          <CardDescription>
            {description ?? 'Esta sección se implementará en una iteración posterior.'}
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
