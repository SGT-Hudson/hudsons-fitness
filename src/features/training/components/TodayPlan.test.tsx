// @vitest-environment jsdom
import '@/i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '@/i18n';
import { TodayPlan } from './TodayPlan';

const program = {
  id: 'p1', user_id: 'u', name: 'PPL', is_active: true, anchor_date: '2026-05-24',
  created_at: '', updated_at: '',
  program_days: [
    { id: 'd0', program_id: 'p1', day_index: 0, is_rest: false, routine_id: 'r-push' },
    { id: 'd1', program_id: 'p1', day_index: 1, is_rest: true, routine_id: null },
  ],
};
const push = { id: 'r-push', user_id: 'u', name: 'Push', notes: null, created_at: '', updated_at: '', routine_exercises: [] };

beforeEach(async () => { await i18n.changeLanguage('es'); });

describe('TodayPlan (Tier-2)', () => {
  it('shows the scheduled routine on a training day', () => {
    render(<TodayPlan activeProgram={program} routinesById={{ 'r-push': push }} todayISO="2026-05-24"
      completedToday={false} onStart={vi.fn()} onRestartCycle={vi.fn()} onBuildProgram={vi.fn()} />);
    expect(screen.getByText('Push')).toBeTruthy();
  });
  it('shows a "done" badge when completedToday is true', () => {
    render(<TodayPlan activeProgram={program} routinesById={{ 'r-push': push }} todayISO="2026-05-24"
      completedToday={true} onStart={vi.fn()} onRestartCycle={vi.fn()} onBuildProgram={vi.fn()} />);
    expect(screen.getByText(i18n.t('entrenamiento:today.done'))).toBeTruthy();
  });
  it('shows a rest card on a rest day', () => {
    render(<TodayPlan activeProgram={program} routinesById={{ 'r-push': push }} todayISO="2026-05-25"
      completedToday={false} onStart={vi.fn()} onRestartCycle={vi.fn()} onBuildProgram={vi.fn()} />);
    expect(screen.getByText(i18n.t('entrenamiento:today.rest'))).toBeTruthy();
  });
  it('shows the empty state with no active program', () => {
    render(<TodayPlan activeProgram={null} routinesById={{}} todayISO="2026-05-24"
      completedToday={false} onStart={vi.fn()} onRestartCycle={vi.fn()} onBuildProgram={vi.fn()} />);
    expect(screen.getByRole('button', { name: i18n.t('entrenamiento:today.createProgram') })).toBeTruthy();
  });
});
