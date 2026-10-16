/**
 * Playwright suite for the shipmoth site (the unit and nginx suites have their own configs).
 *
 *   pnpm -C apps/web build              # produces dist/
 *   pnpm -C apps/web test:e2e           # everything below, Chromium only
 *   pnpm -C apps/web test:e2e:update    # re-record the visual snapshots (after a deliberate change)
 *   CROSS_BROWSER=1 pnpm -C apps/web test:e2e    # also the behaviour specs in Firefox and WebKit
 *
 * Projects
 *   chromium   behaviour (tests/e2e) + accessibility (tests/a11y), 1280x800 @1x
 *   visual     visual regression snapshots (tests/visual), committed baselines per platform
 *   firefox, webkit (only with CROSS_BROWSER=1; install the engines once with
 *              `pnpm -C apps/web exec playwright install firefox webkit`): tests/e2e against the
 *              same build. Opt-in because they add minutes; a11y and visual stay Chromium-only (the
 *              a11y specs read Chromium's accessibility tree over CDP).
 *
 * Env
 *   WEB_DIR    what to serve (default dist), e.g. a deliberately broken copy, to check the suite
 *              notices
 *   WEB_PORT   port for the static server (default 4610), so several runs can go at once. Use a
 *              separate --output too.
 *   CROSS_BROWSER   1 adds the Firefox and WebKit projects.
 *
 * Pixel stability: Chromium normally draws text with subpixel (LCD) antialiasing only on layers it
 * decides are opaque, and that decision changes with compositing (scroll containers, will-change)
 * and even with CPU load: pre.loop was seen flipping between LCD and greyscale between runs.
 * `--disable-lcd-text` makes all text greyscale-antialiased, so a screenshot only depends on what is
 * drawn. With that and the deterministic page (tests/support/deterministic-page.ts) the snapshots
 * are compared exactly; there are no retries, so a real difference always fails.
 */
import { defineConfig, devices, type Project } from '@playwright/test';
import { BASE_URL, WEB_DIR, WEB_PORT, isBuilt, MISSING_BUILD } from './tests/support/env';
import type { Options } from './tests/support/fixtures';

if (!isBuilt()) console.warn(`[playwright] ${MISSING_BUILD}`);

const DESKTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
const CROSS_BROWSER = process.env['CROSS_BROWSER'] === '1';

/** stable (greyscale) text antialiasing in Chromium, see above */
const CHROMIUM = { ...devices['Desktop Chrome'], launchOptions: { args: ['--disable-lcd-text'] } };

const E2E = /e2e[\\/].*\.spec\.ts$/;
const E2E_AND_A11Y = /(e2e|a11y)[\\/].*\.spec\.ts$/;
const VISUAL = /visual[\\/].*\.spec\.ts$/;

const crossBrowser: Project<Options>[] = [
  { name: 'firefox', testMatch: E2E, use: { ...devices['Desktop Firefox'], ...DESKTOP } },
  { name: 'webkit', testMatch: E2E, use: { ...devices['Desktop Safari'], ...DESKTOP } },
];

export default defineConfig<Options>({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  workers: process.env['CI'] ? 4 : '50%',
  // the index page is canvas-heavy: one simulated second costs ~3-4 real seconds in headless chromium
  timeout: 120_000,
  expect: {
    timeout: 5_000,
    // exact: any changed pixel fails. The deterministic page makes this stable (see above).
    toHaveScreenshot: { threshold: 0, maxDiffPixels: 0, animations: 'allow', caret: 'hide', scale: 'device' },
  },
  // one baseline per snapshot and platform: fonts and rasterisation differ between operating systems
  snapshotPathTemplate: '{testDir}/{testFileDir}/__snapshots__/{arg}-{platform}{ext}',
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : [['list']],
  outputDir: './test-results',
  use: {
    ...CHROMIUM,
    ...DESKTOP,
    baseURL: BASE_URL,
    colorScheme: 'dark',
    trace: 'retain-on-failure',
    screenshot: 'off',
  },
  projects: [
    { name: 'chromium', testMatch: E2E_AND_A11Y },
    { name: 'visual', testMatch: VISUAL },
    ...(CROSS_BROWSER ? crossBrowser : []),
  ],
  webServer: {
    command: `node tests/support/serve.ts "${WEB_DIR}" ${WEB_PORT}`,
    url: `${BASE_URL}/__health`,
    reuseExistingServer: !process.env['CI'],
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
