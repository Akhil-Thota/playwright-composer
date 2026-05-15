import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './generated',
  timeout: 30000,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    headless: true
  }
});
