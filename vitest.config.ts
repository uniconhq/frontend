import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      pool: 'vmThreads',
      globals: true,
      setupFiles: ['./vitest.setup.ts', './src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: true,
    },
  }),
);
