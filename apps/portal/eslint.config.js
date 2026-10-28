// Lint rules for the portal: real mistakes are errors, style is Prettier's job (npm run format).
// Kept deliberately small. Add a rule only when it has caught, or would have caught, a real bug.
import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

const unused = ['warn', { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none' }];

export default [
  { ignores: ['dist/**', '.build/**', 'node_modules/**', 'public/**', 'auth-css/**', 'functions/**/node_modules/**'] },
  js.configs.recommended,
  {
    // The browser app (ES modules, JSX).
    files: ['src/**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': unused,
    },
  },
  {
    // Tests, build scripts and config run in Node.
    files: ['src/**/*.test.{js,mjs}', 'src/services/*.test.mjs', 'scripts/*.mjs', 'vite.config.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node } },
  },
  {
    // The Catalyst function (CommonJS, Node).
    files: ['functions/**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs', globals: { ...globals.node } },
    // Several routes strip control characters from text on purpose, so the control-character regex rule does not apply.
    rules: { 'no-unused-vars': unused, 'no-control-regex': 'off' },
  },
];
