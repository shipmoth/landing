/**
 * Loading over a slow connection does not make the page jump.
 *
 * The content (and its inlined stylesheet) arrives and paints well before the page's script, which
 * comes last in the html. The script then draws the hero moth (~680px tall at 1280px on Windows),
 * the wordmark and the crew orbit, which would push everything below them down (without the room
 * kept for them: cumulative layout shift 0.171 on the home page, 0.042 on about). global.css keeps
 * their room until the script runs, with rules that stop matching as soon as it has (#orbit:empty,
 * .title .word:not([style]), #crew:not([style])).
 *
 * Chromium only: the slow connection is CDP network emulation (the test server does not compress,
 * so these are the real byte counts). Real time, no fake clock: this is about loading, not animation.
 * The score here is the plain sum of every layout shift without recent input until a second after
 * load, which is never less than the CLS that browsers report (the worst 5s window).
 */
import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { PAGES, type PageName } from '../support/expected';

test.skip(({ browserName }) => browserName !== 'chromium', 'network emulation needs the Chromium DevTools protocol');

/** well under the 0.1 browsers call good: with the room kept the pages score ~0.003 (home) and
 *  ~0.0001 (about); without it 0.171 and 0.042, so 0.1 alone would not notice the about page losing it */
const MAX_CLS = 0.02;
/** a slow mobile connection */
const NETWORK = { offline: false, latency: 400, downloadThroughput: 50 * 1024, uploadThroughput: 50 * 1024 };

declare global {
  interface Window {
    __shifts?: number[];
    __before?: Heights;
  }
}

interface Heights {
  /** has the page script drawn the hero yet */
  drawn: boolean;
  hero: number;
  title: number;
}

/** the hero picture's (and on the home page, the wordmark's) height, and whether the script has drawn it */
function measure(name: PageName): Heights | false {
  const hero = document.getElementById(name === 'index' ? 'orbit' : 'crew');
  if (!hero) return false;
  const title = document.querySelector('.title');
  return {
    drawn: name === 'index' ? !!hero.querySelector('.stage') : hero.hasAttribute('style'),
    hero: hero.getBoundingClientRect().height,
    title: title ? title.getBoundingClientRect().height : 0,
  };
}

interface SlowLoad {
  cls: number;
  /** as soon as the hero is in the document, before the script */
  before: Heights;
  /** once loaded */
  after: Heights;
}

async function slowLoad(page: Page, name: PageName): Promise<SlowLoad> {
  // "before" is measured in the page as soon as the hero (and on the home page the wordmark) is in
  // the document: a MutationObserver callback is a microtask, so it runs before the page's module
  // script, which only runs once the whole document is parsed. (Polling from the test instead
  // missed that window when the machine was busy.)
  await page.addInitScript(
    ({ n, measureSrc }) => {
      const measureNow = new Function(`return (${measureSrc})`)() as (n: string) => Heights | false;
      const mo = new MutationObserver(() => {
        if (n === 'index' && !document.querySelector('.title canvas.word')) return;
        const h = measureNow(n);
        if (!h) return;
        mo.disconnect();
        window.__before = h;
      });
      mo.observe(document, { childList: true, subtree: true });
    },
    { n: name, measureSrc: measure.toString() },
  );
  await page.addInitScript(() => {
    const shifts: number[] = (window.__shifts = []);
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
        if (!e.hadRecentInput) shifts.push(e.value);
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', NETWORK);

  const loaded = page.goto(PAGES[name].url, { waitUntil: 'load', timeout: 60_000 });
  await loaded;
  // the canvases are sized synchronously by the script; give late frames (and fonts) a moment
  await page.waitForTimeout(1000);
  const after = (await page.evaluate(measure, name)) as Heights;
  const before = await page.evaluate(() => window.__before);
  if (!before) throw new Error('the hero never appeared');
  const cls = await page.evaluate(() => (window.__shifts ?? []).reduce((a, b) => a + b, 0));
  return { cls, before, after };
}

for (const name of ['index', 'about'] as const) {
  test(`${name}: no layout shift while loading slowly`, async ({ site, page }) => {
    void site; // (fails clearly when the site is not built)
    const { cls } = await slowLoad(page, name);
    expect(cls).toBeLessThan(MAX_CLS);
  });

  test(`${name}: the hero's room is kept before the script runs`, async ({ site, page }) => {
    void site;
    const { before, after } = await slowLoad(page, name);
    expect(before.drawn, 'measured before the page script ran').toBe(false);
    expect(after.drawn).toBe(true);
    if (name === 'index') {
      // the reservation assumes a font 0.6em per column, so it undershoots wider-set fonts a little
      // (Consolas: 625px kept for a 682px moth at 1280px). The page must still mostly stay put.
      expect(before.hero).toBeGreaterThan(300);
      expect(before.hero).toBeGreaterThan(after.hero * 0.85);
      // (Menlo and friends are a hair wider than 0.6em, so it may overshoot them by a pixel or two)
      expect(before.hero).toBeLessThan(after.hero * 1.02);
      expect(before.title).toBeGreaterThan(after.title * 0.85);
      expect(before.title).toBeLessThan(after.title * 1.02);
    } else {
      // the crew canvas's size does not depend on the font: it is kept exactly (bar rounding)
      expect(Math.abs(before.hero - after.hero)).toBeLessThanOrEqual(1);
    }
  });
}
