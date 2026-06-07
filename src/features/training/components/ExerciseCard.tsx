import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Dumbbell } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buildExerciseImageUrl } from '../exercises/images';
import { exerciseDisplayName, type Exercise } from '../exercises/api';

interface Props { exercise: Exercise; }

export function ExerciseCard({ exercise }: Props) {
  const { t, i18n } = useTranslation('entrenamiento');
  const lang: 'es' | 'en' = i18n.language?.startsWith('en') ? 'en' : 'es';
  const name = exerciseDisplayName(exercise, lang);
  const src = exercise.images.length > 0 ? buildExerciseImageUrl(exercise.images[0]) : '';
  const primary = exercise.primary_muscles[0];

  return (
    <Link to={`/exercises/${exercise.id}`} className="block focus:outline-none focus:ring-2 focus:ring-ring rounded-lg">
      <Card className="h-full overflow-hidden hover:shadow-md transition-shadow">
        <div className="aspect-[4/3] w-full bg-muted flex items-center justify-center overflow-hidden">
          {src ? (
            <img src={src} alt={name} loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <Dumbbell className="h-10 w-10 text-muted-foreground/40" aria-hidden />
          )}
        </div>
        <CardContent className="space-y-2 py-3">
          <h3 className="font-medium leading-tight line-clamp-2">{name}</h3>
          <div className="flex flex-wrap gap-1">
            {primary && <Badge variant="secondary">{t(`exerciseDialog.muscle.${primary}`)}</Badge>}
            {exercise.equipment && (
              <Badge variant="secondary">{t(`exerciseDialog.equipment.${exercise.equipment}`)}</Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
