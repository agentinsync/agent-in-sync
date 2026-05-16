import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@agent-in-sync/shared': path.resolve(__dirname, '../shared/src'),
      '@agent-in-sync/db-client': path.resolve(__dirname, '../db-client/src'),
      '@agent-in-sync/backend': path.resolve(__dirname, '../backend/src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 5000,
  },
});
