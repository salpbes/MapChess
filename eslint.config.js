// WHAT: ESLint flat config for the project.
// HOW:  typescript-eslint's type-checked preset, Prettier disabling the
//       stylistic rules, plus the project's own hard rules from BUILD_PLAN §5.
//       The `domain/` block adds an import ban that enforces the layering.
// WHY:  "domain/ never imports three.js and never touches the DOM" is the one
//       rule that keeps the chess game headless-testable. A lint error is far
//       cheaper than discovering the leak in Phase 8.

import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'coverage/', 'docs/**/*.html'] },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser, ...globals.es2022 },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      // Silent `catch {}` is banned by BUILD_PLAN §5.
      'no-empty': ['error', { allowEmptyCatch: false }],
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['info', 'warn', 'error'] }],
    },
  },

  // Layering guard: domain/ is pure computation.
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*'], message: 'domain/ must not import three.js.' },
            {
              group: ['@world/*', '@ui/*', '@mapdata/*', '@ai/*', '@game/*', '@app/*'],
              message: 'domain/ may only import from domain/ and @shared/.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'domain/ must not touch the DOM.' },
        { name: 'document', message: 'domain/ must not touch the DOM.' },
        { name: 'fetch', message: 'domain/ must not perform network calls.' },
        { name: 'localStorage', message: 'domain/ must not touch browser storage.' },
        { name: 'indexedDB', message: 'domain/ must not touch browser storage.' },
      ],
    },
  },

  // Config files run under Node, not the browser. The ESLint config itself is
  // plain JS outside tsconfig, so type-aware rules cannot apply to it.
  {
    files: ['vite.config.ts', 'eslint.config.js', 'scripts/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },

  prettier,
);
