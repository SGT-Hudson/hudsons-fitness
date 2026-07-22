// @vitest-environment jsdom
import { describe, it, expect, afterAll } from 'vitest';
import i18n from './index';

afterAll(async () => {
  await i18n.changeLanguage('es');
});

describe('<html lang> follows the active language', () => {
  it('is set from whatever language i18next initialised on', () => {
    // `index.html` ships a static lang="es"; this asserts the attribute is
    // owned by i18next from the start, not left to that literal.
    expect(document.documentElement.lang).toBe(i18n.language.split('-')[0]);
  });

  it('moves with every language change, whoever triggered it', async () => {
    await i18n.changeLanguage('en');
    expect(document.documentElement.lang).toBe('en');

    await i18n.changeLanguage('es');
    expect(document.documentElement.lang).toBe('es');
  });

  it('records the base language, not a region-tagged one', async () => {
    await i18n.changeLanguage('en-US');
    expect(document.documentElement.lang).toBe('en');
  });
});
