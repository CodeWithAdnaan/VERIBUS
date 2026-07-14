import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Engine tests are pure (no DOM, no DB). Node environment is sufficient.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
