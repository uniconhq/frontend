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
      // workers a run takes no less time while each test takes longer, until
      // the workflow editor's run out of their five seconds. A machine with
      // fewer cores keeps Vitest's own default, a worker per core but one.
      maxWorkers: Math.max(1, Math.min(4, availableParallelism() - 1)),
      globals: true,
      setupFiles: ['./vitest.setup.ts', './src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: true,
    },
  }),
);
