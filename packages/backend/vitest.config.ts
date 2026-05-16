import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@agent-in-sync/shared': path.resolve(__dirname, '../shared/src'),
      '@agent-in-sync/db-client': path.resolve(__dirname, '../db-client/src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 5000,
    hookTimeout: 5000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/index.ts', 'src/test-utils/**'],
    },
  },
});
