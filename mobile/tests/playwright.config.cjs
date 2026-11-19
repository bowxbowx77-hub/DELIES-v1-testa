const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: __dirname,
  testMatch: 'pocket.spec.cjs',
  workers: 1,
  timeout: 60000,
  expect: { timeout: 7000 },
  use: {
    baseURL: 'https://127.0.0.1:4186',
    ignoreHTTPSErrors: true,
    viewport: { width: 390, height: 844 },
    launchOptions: {
      executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
      args: ['--disable-dev-shm-usage'],
    },
  },
  webServer: {
    command: '../../.venv/bin/python serve.py',
    cwd: __dirname,
    url: 'https://127.0.0.1:4186/pocket/',
    ignoreHTTPSErrors: true,
    timeout: 20000,
  },
});
