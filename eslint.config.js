import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

const mantineOnlyInUi = {
  name: '@mantine/core',
  message:
    'Import the wrapper from src/ui instead. Only src/ui, src/theme, src/app.tsx and src/test use @mantine/core directly.',
};

const markdownOnlyInUi = ['react-markdown', 'remark-gfm'].map((name) => ({
  name,
  message: 'Render Markdown with src/ui/Markdown instead.',
}));

const crossFeature = (escapePrefix) => ({
  patterns: [
    {
      group: [
        `${escapePrefix}*`,
        `${escapePrefix}*/**`,
        '@/features/*',
        '@/features/*/**',
      ],
      message:
        'A feature may not import from another feature. Move the shared piece into ui/, lib/, api/ or theme/.',
    },
  ],
  paths: [mantineOnlyInUi, ...markdownOnlyInUi],
});

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'playwright-report',
      'test-results',
      'src/api/schema.d.ts',
    ],
  },

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  prettier,

  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },

  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports' },
      ],
    },
  },

  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/ui/**', 'src/theme/**', 'src/app.tsx', 'src/test/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [mantineOnlyInUi, ...markdownOnlyInUi] },
      ],
    },
  },

  {
    files: ['src/features/*/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', crossFeature('../')] },
  },
  {
    files: ['src/features/*/*/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', crossFeature('../../')] },
  },

  {
    files: ['src/router.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },

  {
    files: ['scripts/**/*.ts', 'e2e/**/*.ts', '*.config.ts', 'vitest.setup.ts'],
    languageOptions: { globals: globals.node },
  },

  { files: ['**/*.js'], extends: [tseslint.configs.disableTypeChecked] },
);
