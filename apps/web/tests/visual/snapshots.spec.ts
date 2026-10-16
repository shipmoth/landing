/**
 * Visual regression: a few screenshots of the finished pages, compared pixel for pixel with
 * committed baselines (tests/visual/__snapshots__/*-<platform>.png). Everything else in the suite
 * checks behaviour; these catch what only shows as pixels: colours, spacing, type, the drawings.
 *
 * Each page is deterministic (tests/support/deterministic-page.ts): seeded randomness, a paused
 * fake clock stepped to SETTLED, and every CSS animation paused at CSS_AT, so a capture is the
 * same on every run on the same machine. Fonts and rasterisation differ between operating
 * systems, so each platform has its own baselines; see the README (Tests) for recording them.
 *
 *   pnpm -C apps/web test:e2e:update    # re-record after a deliberate visual change, then review
 *
 * Full-page captures hide the fixed layers (the swarm and the idle moth: a full-page capture
 * stretches the viewport) and hold back the resize event the capture causes, which would clear
 * the canvases. The swarm is in the viewport captures.
 */
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { freezeCssAnimations, withResizeHeld } from '../support/deterministic-page';
import { TEXTY, type PageName } from '../support/expected';

/** simulated time after load: the entrance is over (moth printed, wordmark and tagline typed) */
const SETTLED = 4000;
/** where every CSS animation is paused: caret showing, meters draining, the pulse on step two */
const CSS_AT = 1200;
/** hides the fixed layers in full-page captures */
const FULL_PAGE_CSS = fileURLToPath(new URL('full-page.css', import.meta.url));
/** large full-page captures at 2x take a while to encode and compare */
const CAPTURE_TIMEOUT = 30_000;

const SIZES = {
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
} as const;

async function settled(site: { open: (n: PageName) => Promise<Page>; advance: (ms: number) => Promise<void> }, name: PageName): Promise<Page> {
  const page = await site.open(name);
  await site.advance(SETTLED);
  expect(await freezeCssAnimations(page, CSS_AT), 'CSS animations to pause').toBeGreaterThan(0);
  return page;
}

function fullPage(page: Page, file: string): Promise<void> {
  return withResizeHeld(page, () => expect(page).toHaveScreenshot(file, { fullPage: true, stylePath: FULL_PAGE_CSS, timeout: CAPTURE_TIMEOUT }));
}

for (const [size, use] of Object.entries(SIZES)) {
  test.describe(size, () => {
    test.use(use);

    test(`index at ${use.viewport.width}x${use.viewport.height} @${use.deviceScaleFactor}x`, async ({ site }) => {
      const page = await settled(site, 'index');
      await expect(page).toHaveScreenshot(`index-top-${size}.png`, { timeout: CAPTURE_TIMEOUT });
      await fullPage(page, `index-full-${size}.png`);
    });

    test(`about at ${use.viewport.width}x${use.viewport.height} @${use.deviceScaleFactor}x`, async ({ site }) => {
      await fullPage(await settled(site, 'about'), `about-full-${size}.png`);
    });
  });
}

test.describe('reduced motion', () => {
  test.use({ ...SIZES.desktop, reducedMotion: 'reduce' });

  test('index, drawn once and still', async ({ site }) => {
    // (no swarm, no CSS animations: nothing to freeze)
    const page = await site.open('index');
    await site.advance(SETTLED);
    await fullPage(page, 'index-full-reduced-motion.png');
  });
});

test.describe('the lamp', () => {
  test.use(SIZES.desktop);

  test('about, with the lamp held down beside the text', async ({ site }) => {
    const page = await settled(site, 'about');
    const [x, y] = [40, 300];
    // (empty space: pressing text would start a selection instead, e2e/swarm.spec.ts)
    const hit = await page.evaluate(({ px, py, texty }) => document.elementFromPoint(px, py)?.closest(texty)?.tagName ?? 'empty', { px: x, py: y, texty: TEXTY });
    expect(hit).toBe('empty');
    await page.mouse.move(x, y);
    await page.mouse.down();
    await site.advance(800);
    await page.mouse.move(x + 20, y + 140, { steps: 4 });
    await site.advance(400);
    await expect(page).toHaveScreenshot('about-lamp-held.png', { timeout: CAPTURE_TIMEOUT });
    await page.mouse.up();
  });
});
