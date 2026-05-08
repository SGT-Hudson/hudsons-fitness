import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';

export function IngredientesPage() {
  const { t } = useTranslation('nav');
  const { data, isLoading, error } = useQuery({
    queryKey: ['ingredients', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ingredients')
        .select('id, name, brand, unit_type, kcal_per_unit, source')
        .order('name')
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">{t('ingredientes')}</h1>
      <Card>
        <CardHeader>
          <CardTitle>Biblioteca compartida</CardTitle>
          <CardDescription>
            Ingredientes seed del sistema. La búsqueda completa y la importación de OpenFoodFacts
            llegan en la siguiente iteración.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
          {error && (
            <p className="text-sm text-destructive">Error: {(error as Error).message}</p>
          )}
          {data && (
            <ul className="divide-y">
              {data.map((ing) => (
                <li key={ing.id} className="py-2 flex items-center justify-between gap-4">
                  <div>
                    <span className="font-medium">{ing.name}</span>
                    {ing.brand && (
                      <span className="text-muted-foreground ml-2 text-sm">{ing.brand}</span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground tabular-nums">
                    {ing.kcal_per_unit} kcal / {ing.unit_type === 'unit' ? 'ud' : '100 g'}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
