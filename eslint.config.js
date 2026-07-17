import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', '.claude/**', '*.config.js', '*.config.ts'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // Locale guard: user-facing numbers must render through the shared
      // formatters so the decimal separator follows the language (Spanish
      // comma / English point). See src/lib/number.ts + src/hooks/useNum.ts.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            ":matches(JSXElement, JSXFragment) > JSXExpressionContainer > CallExpression[callee.name='roundMacro']",
          message:
            'Render numbers via useNum().qty(...) (or {{x, number}} in a t() string), not raw roundMacro() — a bare number prints a decimal POINT in Spanish.',
        },
        {
          selector:
            ":matches(JSXElement, JSXFragment) > JSXExpressionContainer > CallExpression[callee.object.name='Math'][callee.property.name='round']",
          message:
            'Render numbers via useNum().qty(...) (or {{x, number}} in a t() string), not raw Math.round() — a bare number prints a decimal POINT in Spanish.',
        },
        {
          selector: "CallExpression[callee.property.name='toLocaleString']",
          message:
            'Do not call toLocaleString directly. Number formatting lives in src/lib/number.ts (formatDecimal/formatQuantity) — hardcoding a locale ignores the active language.',
        },
        {
          selector:
            "NewExpression[callee.object.name='Intl'][callee.property.name='NumberFormat']",
          message:
            'Do not construct Intl.NumberFormat outside src/lib/number.ts — use formatDecimal/formatQuantity so there is one locale-mapping site.',
        },
      ],
    },
  },
  {
    // The sanctioned home of Intl.NumberFormat / the formatters themselves.
    files: ['src/lib/number.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
);
