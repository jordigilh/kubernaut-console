import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

let storybookConfigs = [];
try {
  const storybook = await import("eslint-plugin-storybook");
  storybookConfigs = storybook.default.configs["flat/recommended"];
} catch {
  // eslint-plugin-storybook not available in this package context
}

export default defineConfig([globalIgnores(['**/dist/**', '**/dist-dynamic/**', '**/node_modules/**', '**/storybook-static/**', '**/*.d.ts']), {
  files: ['**/*.{ts,tsx}'],
  extends: [
    js.configs.recommended,
    tseslint.configs.recommended,
    reactHooks.configs.flat.recommended,
    reactRefresh.configs.vite,
  ],
  languageOptions: {
    globals: globals.browser,
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    'react-hooks/set-state-in-effect': 'warn',
  },
}, ...storybookConfigs])
