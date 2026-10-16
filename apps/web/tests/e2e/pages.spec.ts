import { test, expect } from '../support/fixtures';
import { BASE_URL } from '../support/env';
import { META, PAGES, PAGE_NAMES } from '../support/expected';

for (const name of PAGE_NAMES) {
  const spec = PAGES[name];

  test.describe(`${name} page`, () => {
    test('has the right title, meta and nav', async ({ site, page }) => {
      await site.open(name);
      await expect(page).toHaveTitle(spec.title);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', spec.description);
      await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', META.themeColor);
      await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', META.viewport);
      await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /favicon\.svg$/);
      // (relative, so that from every page's folder it reaches the one favicon at the root)
      const icon = await page.locator('link[rel="icon"]').evaluate((el) => (el as HTMLLinkElement).href);
      expect(icon).toBe(`${BASE_URL}/favicon.svg`);
      expect(await page.evaluate(() => document.characterSet)).toBe('UTF-8');

      const nav = page.getByRole('navigation');
      await expect(nav.getByRole('link')).toHaveText(['shipmoth', 'about']);
      await expect(nav.getByRole('link', { name: 'shipmoth' })).toHaveAttribute('href', spec.nav.shipmoth);
      await expect(nav.getByRole('link', { name: 'about' })).toHaveAttribute('href', spec.nav.about);
      const current = nav.getByRole('link', { name: spec.current });
      const other = nav.getByRole('link', { name: spec.current === 'about' ? 'shipmoth' : 'about' });
      await expect(current).toHaveAttribute('aria-current', 'page');
      await expect(other).not.toHaveAttribute('aria-current');
      await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(spec.h1);
    });

    test('loads with no console errors and no failed requests', async ({ site, page }) => {
      const problems: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error' || m.type() === 'warning') problems.push(`console.${m.type()}: ${m.text()}`);
      });
      page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
      page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`));
      page.on('response', (r) => {
        if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`);
      });
      await site.open(name);
      await site.advance(3000);
      // scroll through the page so lazily-triggered work (the idea line) runs too
      await page.locator('footer').scrollIntoViewIfNeeded();
      await site.advance(1000);
      await page.mouse.move(40, 300);
      await page.mouse.down();
      await site.advance(300);
      await page.mouse.up();
      await site.advance(300);
      expect(problems).toEqual([]);
    });

    test.describe('at mobile width', () => {
      test.use({ viewport: { width: 390, height: 844 } });

      test('does not scroll sideways', async ({ site, page }) => {
        await site.open(name);
        await site.advance(3000);
        // the wordmark's canvas deliberately bleeds past the edges (html clips it), so script can still
        // nudge scrollX; what matters is that a visitor's sideways swipe/wheel does not move the page
        await page.mouse.move(200, 400);
        await page.mouse.wheel(600, 0);
        await site.settle();
        expect(await page.evaluate(() => window.scrollX)).toBe(0);
        // the content column fits the screen
        const main = await page.locator('main').boundingBox();
        expect(main?.width ?? Infinity).toBeLessThanOrEqual(390);
      });
    });
  });
}

test('navigates between the two pages', async ({ site, page }) => {
  await site.open('index');
  await page.getByRole('navigation').getByRole('link', { name: 'about' }).click();
  await expect(page).toHaveURL(BASE_URL + PAGES.about.url);
  await expect(page).toHaveTitle(PAGES.about.title);
  await expect(page.getByRole('link', { name: 'about' })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('navigation').getByRole('link', { name: 'shipmoth' }).click();
  await expect(page).toHaveURL(BASE_URL + PAGES.index.url);
  await expect(page).toHaveTitle(PAGES.index.title);
});

test('the favicon both pages link is an SVG drawing', async ({ site, page, request }) => {
  for (const name of PAGE_NAMES) {
    await site.open(name);
    const href = await page.locator('link[rel="icon"]').evaluate((el) => (el as HTMLLinkElement).href);
    const response = await request.get(href);
    expect(response.status(), href).toBe(200);
    const svg = await response.text();
    expect(svg, href).toMatch(/^<svg\b[^>]*\bxmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toMatch(/<\/svg>\s*$/);
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('type', 'image/svg+xml');
  }
});
