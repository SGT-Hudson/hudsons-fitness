// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '@/i18n';
import { EnProgresoPage } from './EnProgresoPage';

beforeEach(async () => {
  await i18n.changeLanguage('es');
});

describe('EnProgresoPage', () => {
  it('renders the in-progress title', () => {
    render(<EnProgresoPage />);
    expect(screen.getByText('En progreso')).toBeInTheDocument();
  });
});
