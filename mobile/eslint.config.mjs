// Ruby2JS output must not introduce a free identifier (especially in native-only branches).
import globals from 'globals';
export default [
  {
    files: ['build/*.mjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: globals.browser },
    rules: {
      'no-undef': 'error',
      'no-global-assign': 'error',
      'no-unreachable': 'error',
      'no-use-before-define': ['error', { functions: false, classes: false, variables: false }],
    },
  },
];
