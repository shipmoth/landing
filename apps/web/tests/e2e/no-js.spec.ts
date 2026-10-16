/**
 * Both pages with JavaScript turned off, over http and straight from disk (file://).
 *
 * Without scripts nothing gets drawn: the hero moth, the wordmark, the swarm and the crew orbit are
 * blank canvases, the idea line is an empty belt, [ copy ] does nothing and the signup form would
 * submit as a GET with the address in the URL. The <noscript> styles in layouts/Base.astro hide all
 * of that and show the h1's "shipmoth" as the title; each page prints its tagline in a <noscript>
 * inside #typed. What is left must read well: title, tagline, the email address as plain text, the
 * boxes drawn with their css borders, and no axe violations.
 * (With JavaScript on, the <noscript> content is inert: the visual snapshots show that page.)
 */
import AxeBuilder from '@axe-core/playwright';
import type { Browser, BrowserContextOptions, Locator, Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { exposedText } from '../support/ax';
import { fileUrl } from '../support/env';
import { PAGES, PAGE_NAMES, type PageName } from '../support/expected';

test.use({ javaScriptEnabled: false });

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const EMAIL = 'hello@shipmoth.com';

/** visible, inside the viewport, and big enough to read (the .sr text is a 1x1px clip: "visible" to Playwright) */
async function expectReadable(locator: Locator, minHeight: number): Promise<void> {
  await expect(locator).toBeVisible();
  await expect(locator).toBeInViewport();
  const box = await locator.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(50);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(minHeight);
}

/** every element the selector matches is hidden (an absent element counts too) */
async function expectAllHidden(page: Page, selector: string): Promise<void> {
  for (const el of await page.locator(selector).all()) await expect(el, selector).toBeHidden();
}

for (const name of PAGE_NAMES) {
  for (const via of ['http', 'file'] as const) {
    test(`${name} (${via}): reads well without JavaScript`, async ({ site, page, browserName, browser, pageOptions }) => {
      void site; // (fails clearly when the site is not built)
      // (each page by its own file: the nav's folder links are not followed over file://, see file-protocol.spec.ts)
      const url = via === 'http' ? PAGES[name].url : fileUrl(PAGES[name].file);
      await page.goto(url, { waitUntil: 'load' });
      // (the ascii frames script would have set html.ascii)
      expect(await page.locator('html').getAttribute('class'), 'no script ran').toBeNull();

      await checkPage(page, name, browserName);
      if (browserName === 'chromium') await expectNoAxeViolations(browser, pageOptions, url);
    });
  }
}

async function checkPage(page: Page, name: PageName, browserName: string): Promise<void> {
  // the title: on the home page the h1's own text stands in for the wordmark canvas
  if (name === 'index') {
    const title = page.locator('h1');
    await expect(title).toHaveText(PAGES.index.h1);
    await expectReadable(title.getByText(PAGES.index.h1, { exact: true }), 24);
  }
  // the tagline the typewriter would have typed. (innerText: Playwright's own text matching skips
  // <noscript> whether or not scripts run; the browser renders it, and exposes it, when they do not)
  const typed = page.locator('#typed');
  await expect(typed).toHaveText(PAGES[name].line, { useInnerText: true });
  await expectReadable(typed, 15);
  if (browserName === 'chromium') {
    const exposed = await exposedText(page);
    expect(exposed).toContain(`StaticText "${PAGES[name].line}"`);
    if (name === 'index') expect(exposed).toContain(`heading "${PAGES.index.h1}"`);
    // the pictures are gone from the tree too (their aria-labels describe drawings that never come)
    for (const label of await page.locator('#orbit, #crew, #belt').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''))) {
      expect(exposed).not.toContain(label);
    }
  }

  // no blank pictures: every canvas (and the hero moth's box) is gone, with its aria-label
  await expectAllHidden(page, 'canvas, #orbit');
  // the idea line has nothing to show, and the copy button and signup form do nothing
  await expectAllHidden(page, '.belt-cap, #belt, #copy, #form, #out');
  await expect(page.getByText('to hear when something new comes off the line')).toHaveCount(name === 'index' ? 1 : 0);
  await expectAllHidden(page, 'p:has-text("to hear when something new comes off the line")');

  // the address stays, as text to copy by hand
  const mail = page.locator('#mail');
  await expect(mail).toHaveText(EMAIL);
  await expect(mail).toBeVisible();
  expect((await mail.boundingBox())?.width ?? 0).toBeGreaterThan(50);

  // the boxes keep their css borders (the ascii frames need the script)
  await expect(page.locator('.ab')).toHaveCount(0);
  const box = page.locator(name === 'index' ? 'main .prod' : 'main .mate').first();
  await expect(box).toHaveCSS('border-top-style', 'dashed');
  await expect(box).toHaveCSS('border-top-width', '1px');
  // and the text reads: real content is on screen, in the page's colours
  await expect(page.locator('main p').first()).toBeVisible();
}

/**
 * axe, on the page as it renders without JavaScript. axe needs timers, and with scripts off they
 * never fire, so (Chromium only) this loads the page with script execution disabled over CDP, which
 * is what `javaScriptEnabled: false` does too (the parser renders <noscript> and skips the page's
 * script for good), then turns execution back on for axe alone.
 */
async function expectNoAxeViolations(browser: Browser, options: BrowserContextOptions, url: string): Promise<void> {
  const context = await browser.newContext(options);
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setScriptExecutionDisabled', { value: true });
    await page.goto(url, { waitUntil: 'load' });
    await cdp.send('Emulation.setScriptExecutionDisabled', { value: false });
    await expect(page.locator('#typed')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(await page.locator('html').getAttribute('class'), 'the page script stayed off').toBeNull();
    expect(results.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`))).toEqual([]);
  } finally {
    await context.close();
  }
}
