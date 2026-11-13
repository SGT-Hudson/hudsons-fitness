import { useTranslation } from 'react-i18next';
import { PageShell } from '@/components/layout/PageShell';
import {
  TdeeCalculator,
  type TdeeCalculatorData,
} from '@/features/tdee/components/TdeeCalculator';
import { tdeeConfidenceBand } from '@/features/tdee/api';
import { useLatestTdee } from '@/features/tdee/hooks';
import { useProfile } from '@/features/profile/hooks';
import {
  useLatestMeasurement,
  useRecentMeasurements,
} from '@/features/measurements/hooks';
import { ageYearsFromBirthDate } from '@/lib/macros';
import { todayInTZ } from '@/lib/dates';
import type { TdeeSex } from '@/features/tdee/formulas';

/**
 * R-37 frame A: the standing calculator, reached from More. No apply action —
 * there is nothing here to apply to, which is what makes this the
 * play-with-scenarios mode. The apply-capable twin is the sheet inside the
 * phase editor.
 *
 * A route rather than a sheet on More: without a URL the back button would
 * leave More entirely instead of closing the sheet.
 */
export function TdeePage() {
  const { t } = useTranslation('objetivos');
  const profile = useProfile();
  const latest = useLatestMeasurement();
  const recent = useRecentMeasurements(30);
  const latestTdee = useLatestTdee();

  const today = todayInTZ();
  const sex = profile.data?.sex;
  // The most recent reading that actually carries a body fat %, scanned
  // client-side out of the list the app already loads — a secondary display
  // reading does not justify a new query.
  const withBodyFat = recent.data?.find((m) => m.body_fat_pct != null) ?? null;

  const data: TdeeCalculatorData = {
    sex:
      sex === 'male' || sex === 'female' || sex === 'other'
        ? (sex as TdeeSex)
        : null,
    ageYears: profile.data?.birth_date
      ? ageYearsFromBirthDate(profile.data.birth_date, today)
      : null,
    heightCm: profile.data?.height_cm ?? null,
    weightKg: latest.data?.weight_kg ?? null,
    bodyFat:
      withBodyFat?.body_fat_pct != null
        ? { pct: withBodyFat.body_fat_pct, measuredOn: withBodyFat.measured_on }
        : null,
    adaptiveTdeeKcal: latestTdee.data?.estimated_tdee_kcal ?? null,
    adaptiveConfidence: tdeeConfidenceBand(latestTdee.data),
  };

  // The shell renders unconditionally, before the queries land: the e2e smoke
  // suite asserts an <h1> on every route, and a loading branch without one
  // would fail it.
  //
  // The body seeds its input state on mount only (it must, or typing would be
  // overwritten on every render), so the seed identity is its key: the queries
  // resolve after first paint, and without the remount the fields would stay
  // stuck on the empty pre-fetch snapshot.
  const seedKey = [data.sex, data.ageYears, data.heightCm, data.weightKg].join(
    '|',
  );

  return (
    <PageShell title={t('tdee.title')} back="/more">
      <div className="max-w-2xl">
        <TdeeCalculator key={seedKey} data={data} />
      </div>
    </PageShell>
  );
}
