import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/tools/autotest',
  test: {
    name: '@szoba-kertesz/autotest',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
