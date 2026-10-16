/**
 * Unit tests (tests/unit) for the DOM-free parts of the site: src/scripts/lib (ascii light, idea
 * belt), the markdown / plain-text generator in src/build, and the room global.css keeps for the
 * ascii art. They run in Node under Playwright's runner, which already transpiles the TypeScript
 * and resolves the extensionless imports the site's modules use. No browser and no servers.
 *
 *   npx playwright test -c playwright.unit.config.ts
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/unit',
  testMatch: /\.spec\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  reporter: process.env['CI'] ? [['list']] : [['line']],
  outputDir: './test-results/unit',
});
