/**
 * Smoke test in Chromium through nginx: both pages load as html with their script running, the
 * nav moves between / and /about/, and nothing fails or logs an error on the way.
 */
import { test, expect, type Page } from '@playwright/test';
import { CONTENT_TYPES, requireStack } from './support';

requireStack();

/** collects console errors, page errors, failed requests and HTTP errors */
function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`));
  page.on('response', (r) => {
    if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`);
  });
  return problems;
}

/** the site's scripts mark the document once they run (ascii-frames adds html.ascii) */
async function expectScriptRan(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveClass(/(^|\s)ascii(\s|$)/);
}

for (const path of ['/', '/about/']) {
  test(`${path} renders as html with its script`, async ({ page }) => {
    const problems = watch(page);
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    expect(response?.headers()['content-type']).toBe(CONTENT_TYPES.html);
    await expectScriptRan(page);
    await expect(page.getByRole('navigation')).toBeVisible();
    expect(await page.evaluate(() => document.characterSet)).toBe('UTF-8');
    await page.waitForLoadState('networkidle');
    expect(problems).toEqual([]);
  });
}

test('the nav goes from / to /about/ and back', async ({ page }) => {
  const problems = watch(page);
  const base = new URL(test.info().project.use.baseURL!);
  await page.goto('/');
  await expectScriptRan(page);

  const nav = page.getByRole('navigation');
  await nav.getByRole('link', { name: 'about' }).click();
  await expect(page).toHaveURL(new URL('/about/', base).href);
  await expectScriptRan(page);

  await nav.getByRole('link', { name: 'shipmoth' }).click();
  await expect(page).toHaveURL(new URL('/', base).href);
  await expectScriptRan(page);

  // the old URL still gets there
  await page.goto('/about.html');
  await expect(page).toHaveURL(new URL('/about/', base).href);
  await expectScriptRan(page);
  await page.waitForLoadState('networkidle');
  expect(problems).toEqual([]);
});
