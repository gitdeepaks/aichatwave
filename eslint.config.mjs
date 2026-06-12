import nextVitals from 'eslint-config-next/core-web-vitals';

export default [
  ...nextVitals,
  {
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'node_modules/**',
      'next-env.d.ts',
    ],
    rules: {
      'no-console': 'off',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSAnyKeyword',
          message: 'Do not use explicit `any`. Validate or narrow from `unknown` instead.',
        },
        {
          selector: 'TSAsExpression > TSAnyKeyword',
          message: 'Do not use `as any`. Validate or narrow from `unknown` instead.',
        },
      ],
      'react/no-children-prop': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/static-components': 'off',
      '@next/next/no-img-element': 'off',
      'import/no-anonymous-default-export': 'off',
    },
  },
  {
    // Server-owned code must log through the structured logger wrapper.
    files: ['server/**/*.ts', 'app/api/**/*.ts', 'lib/**/*.ts', 'db/**/*.ts'],
    rules: {
      'no-console': 'error',
    },
  },
];
