import i18n from '@/i18n';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApplyTemplateDialog } from './ApplyTemplateDialog';
import type { TemplateListItem } from '@/features/templates/api';

const templates: TemplateListItem[] = [
  {
    id: 'tpl-cut',
    name: 'Semana de corte',
    is_auto_generated: false,
    default_meal_times: ['08:00:00', '13:00:00'],
    updated_at: '2026-06-01T10:00:00Z',
    slot_count: 2,
    phase_type: 'cut',
    slots: [{ day_of_week: 0, meal_index: 0 }],
  },
  {
    id: 'tpl-plain',
    name: 'Semana sin fase',
    is_auto_generated: false,
    default_meal_times: ['08:00:00'],
    updated_at: '2026-05-01T10:00:00Z',
    slot_count: 1,
    phase_type: null,
    slots: [{ day_of_week: 1, meal_index: 0 }],
  },
];

// The hook talks to supabase (and needs an authed user) — neither exists here.
const useTemplates = vi.fn(() => ({ data: templates }));
vi.mock('@/features/templates/hooks', () => ({
  useTemplates: () => useTemplates(),
}));

beforeAll(() => {
  void i18n.changeLanguage('es');
});

// jsdom has no matchMedia; ResponsiveDialog needs one. Drive the breakpoint.
function setViewport(isDesktop: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: isDesktop,
    media: q,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  setViewport(true);
  useTemplates.mockReturnValue({ data: templates });
});

// Thursday of the week Mon 2026-06-01 … Sun 2026-06-07.
const TARGET = '2026-06-04';

function renderDialog(over: Partial<Parameters<typeof ApplyTemplateDialog>[0]> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    targetDate: TARGET,
    onApply: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
  return { props, ...render(<ApplyTemplateDialog {...props} />) };
}

describe('ApplyTemplateDialog', () => {
  // apply_template_to_week deletes and refills from p_target_date through the
  // SUNDAY OF THE SAME WEEK: earlier days of the week survive, next week is
  // never touched. The strip has to say exactly that.
  it('marks the week before the target date as untouched and the target day → Sunday as fill', () => {
    renderDialog();
    const strip = screen.getByRole('dialog');

    const filled = [...strip.querySelectorAll('[data-fill="true"]')].map((el) =>
      el.getAttribute('data-day'),
    );
    const untouched = [...strip.querySelectorAll('[data-fill="false"]')].map((el) =>
      el.getAttribute('data-day'),
    );

    expect(untouched).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
    expect(filled).toEqual(['2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07']);
  });

  it('draws this week only — never next week', () => {
    renderDialog();
    const strip = screen.getByRole('dialog');
    expect(strip.querySelectorAll('[data-day]')).toHaveLength(7);
    expect(strip.querySelector('[data-day="2026-06-08"]')).toBeNull();
  });

  it('names each strip day with what happens to it', () => {
    renderDialog();
    expect(screen.getByText(/Miércoles 3 junio: Sin cambios/i)).toBeInTheDocument();
    expect(screen.getByText(/Jueves 4 junio: Se rellena/i)).toBeInTheDocument();
  });

  it('applies the picked template by id', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onApply });

    await user.click(screen.getByRole('radio', { name: /Semana sin fase/ }));
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));

    expect(onApply).toHaveBeenCalledWith('tpl-plain');
  });

  it('refuses to apply with no template picked', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onApply });

    await user.click(screen.getByRole('button', { name: 'Aplicar' }));

    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText('Elige una plantilla.')).toBeInTheDocument();
  });

  it('shows a phase-tagged template with its phase, and an untagged one with none', () => {
    renderDialog();
    const tagged = screen.getByRole('radio', { name: /Semana de corte/ });
    expect(within(tagged).getByText('Corte')).toBeInTheDocument();

    const untagged = screen.getByRole('radio', { name: /Semana sin fase/ });
    // No chip at all — `phase_type` is null and a phase is never guessed.
    expect(within(untagged).queryByText(/Corte|Volumen|Mantenimiento/)).toBeNull();
  });

  it('tells the user when there are no templates to apply', () => {
    useTemplates.mockReturnValue({ data: [] });
    renderDialog();
    expect(screen.getByText('No tienes plantillas todavía.')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('disables the apply button while the mutation runs', () => {
    renderDialog({ busy: true });
    expect(screen.getByRole('button', { name: 'Cargando…' })).toBeDisabled();
  });

  // vaul draws no close affordance of its own, so the mobile branch would be
  // dismissible only by dragging it without an explicit control.
  it('offers a Cancel control on mobile that closes the dialog', async () => {
    setViewport(false);
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
