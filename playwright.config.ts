import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 45000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4177',
    viewport: { width: 1360, height: 900 },
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
      args: ['--disable-dev-shm-usage'],
    },
  },
  webServer: {
    command: 'python3 scripts/browser_server.py',
    url: 'http://127.0.0.1:4177/api/health',
    timeout: 30000,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'ignore',
  },
});
