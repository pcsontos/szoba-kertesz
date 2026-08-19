import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/build',
      // A `prisma generate` kimenete (packages/db/generated) — gitignore-olt,
      // gépi generálású kód, nem a mi konvencióink szerint íródik. Lintelve
      // több száz hibát ad (no-var, {} típus, enforce-module-boundaries), ami
      // pirosra viszi a `db:lint`-et anélkül, hogy bármi javítható lenne benne.
      '**/generated',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
    ],
  },
  {
    files: ['**/*.ts', '**/*.js'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.cjs',
      '**/*.mjs',
    ],
    // Override or add rules here
    rules: {
      // A `_` prefix a repóban azt jelenti: "szándékosan használatlan"
      // (`_id`, `_name`, `_input`, `_unused`). Eddig néma volt, de csak
      // véletlenül: az `args: 'after-used'` alapbeállítás a NEM-utolsó
      // paramétereket amúgy sem jelzi. Az első utolsó helyen álló ilyen param
      // (`_keepTop`, retrieve.spec.ts) hozta elő a figyelmeztetést. Mostantól
      // a prefix KIFEJEZETT kivétel, nem a szabály mellékhatása.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
];
