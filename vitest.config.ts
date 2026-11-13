import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // One database, read-only tests: files can share it, but keep the run
    // in a single worker so the output order is stable in CI logs.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
