import { availableParallelism } from 'node:os';
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      pool: 'vmThreads',
      // The tests spend their time rendering, not waiting, so past four
      // workers a run takes no less time while each test takes longer. A
      // machine with fewer cores keeps Vitest's own default, a worker per
      // core but one.
      maxWorkers: Math.max(1, Math.min(4, availableParallelism() - 1)),
      // A workflow editor test re-draws the graph on every keystroke, about
      // a second and a half on a quiet machine and over five on a busy one.
      testTimeout: 30_000,
      globals: true,
      setupFiles: ['./vitest.setup.ts', './src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: true,
    },
  }),
);
