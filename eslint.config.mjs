import tseslint from 'typescript-eslint';
export default tseslint.config(
 { ignores: ['**/dist/**', '**/generated/**'] },
 ...tseslint.configs.recommended,
 { files: ['**/*.ts'], rules: { '@typescript-eslint/no-explicit-any': 'error' } },
 { files: ['**/*.mjs'], languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly' } } }
);
