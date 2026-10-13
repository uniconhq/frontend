import { defineConfig, devices } from '@playwright/test';

/**
 * The dev server the browser tests run against: started for each run, on a
 * port of its own, so a dev server already running against a local stack is
 * never used in its place (a run with the port taken stops and says so), and
 * with no backend behind its proxy (`VITE_API_PROXY=none`), so a request a
 * test does not stub answers 404 whether or not a stack listens on :8080.
 */
const port = 5190;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm dev --port ${port} --strictPort`,
    env: { VITE_API_PROXY: 'none' },
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
