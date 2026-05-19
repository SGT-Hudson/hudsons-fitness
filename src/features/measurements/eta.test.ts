import { describe, expect, it } from 'vitest';
import { computeGoalEta, type GoalEtaInput } from './eta';

function input(over: Partial<GoalEtaInput> = {}): GoalEtaInput {
  return {
    currentWeightKg: 80,
    targetWeightKg: 75,
    avgIntakeKcal: 2000,
    expenditureKcal: 2350,
    ...over,
  };
}

describe('computeGoalEta', () => {
  it('projects a cut: eating below expenditure toward a lower target is on_track', () => {
    // rate = (2000-2350)/7700 = -0.0454545 kg/day; delta = -5 kg
    // days = -5 / -0.0454545 = 110.0 → ceil 110
    const eta = computeGoalEta(input());
    expect(eta).not.toBeNull();
    expect(eta!.status).toBe('on_track');
    expect(eta!.daysToTarget).toBe(110);
    expect(eta!.rateKgPerDay).toBeLessThan(0);
  });

  it('projects a bulk: eating above expenditure toward a higher target is on_track', () => {
    // rate = (3000-2500)/7700 = +0.064935 kg/day; delta = +3 kg → 46.2 → 47
    const eta = computeGoalEta(
      input({
        currentWeightKg: 70,
        targetWeightKg: 73,
        avgIntakeKcal: 3000,
        expenditureKcal: 2500,
      }),
    );
    expect(eta!.status).toBe('on_track');
    expect(eta!.daysToTarget).toBe(47);
  });

  it('flags wrong_direction when the rate moves away from the target', () => {
    // surplus (+200) but target is below current → moving away
    const eta = computeGoalEta(
      input({ avgIntakeKcal: 2600, expenditureKcal: 2400 }),
    );
    expect(eta!.status).toBe('wrong_direction');
    expect(eta!.daysToTarget).toBeNull();
  });

  it('flags stalled at near-maintenance (|intake − expenditure| within noise)', () => {
    const eta = computeGoalEta(
      input({ avgIntakeKcal: 2410, expenditureKcal: 2400 }),
    );
    expect(eta!.status).toBe('stalled');
    expect(eta!.daysToTarget).toBeNull();
  });

  it('reports reached when already within 0.1 kg of target', () => {
    const eta = computeGoalEta(
      input({ currentWeightKg: 75.05, targetWeightKg: 75 }),
    );
    expect(eta!.status).toBe('reached');
    expect(eta!.daysToTarget).toBe(0);
  });

  it('treats a multi-year horizon as stalled (not actionable)', () => {
    // diff -30 kcal → rate ≈ -0.0039 kg/day; 5 kg ≈ 1283 days > 730
    const eta = computeGoalEta(
      input({ avgIntakeKcal: 2370, expenditureKcal: 2400 }),
    );
    expect(eta!.status).toBe('stalled');
    expect(eta!.daysToTarget).toBeNull();
  });

  it('returns null on non-finite or non-sensible input', () => {
    expect(computeGoalEta(input({ avgIntakeKcal: NaN }))).toBeNull();
    expect(computeGoalEta(input({ currentWeightKg: 0 }))).toBeNull();
    expect(computeGoalEta(input({ targetWeightKg: -1 }))).toBeNull();
  });
});
