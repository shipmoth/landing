import { test, expect } from '../support/fixtures';
import type { Page } from '@playwright/test';
import { PERF_BASE, setHidden } from '../support/deterministic-page';
import { BELT, PAGE_NAMES } from '../support/expected';

interface BeltState {
  html: string;
  rows: string[];
  shipped: number;
  binned: number;
}

async function belt(page: Page): Promise<BeltState> {
  return page.evaluate(() => {
    const pre = document.getElementById('belt');
    return {
      html: pre?.innerHTML ?? '',
      rows: (pre?.textContent ?? '').split('\n'),
      shipped: Number(document.getElementById('shipped')?.textContent),
      binned: Number(document.getElementById('binned')?.textContent),
    };
  });
}

for (const name of PAGE_NAMES) {
  test.describe(`${name} idea line`, () => {
    test('starts mid-shift: seven rows with crates, a stamp, a belt and a bin', async ({ site, page }) => {
      await site.open(name);
      const b = await belt(page);
      expect(b.rows).toHaveLength(BELT.rows);
      const width = b.rows[0]?.length ?? 0;
      expect(width).toBeGreaterThanOrEqual(BELT.minWidth);
      expect(width).toBeLessThanOrEqual(BELT.maxWidth);
      for (const r of b.rows) expect(r).toHaveLength(width);
      expect(b.rows[0]).toContain('__|__');
      expect(b.rows[5]).toMatch(/^[-=]{10,}/);
      expect(b.rows[5]).toContain('| bin |');
      expect(b.rows[6]).toContain('(o)');
      expect(b.rows.join('\n')).toMatch(/\+-+\+/); // at least one crate on the line
      // counters started at 3 / 211 and the warm-up already moved some crates along
      expect(b.shipped).toBeGreaterThanOrEqual(BELT.startShipped);
      expect(b.binned).toBeGreaterThanOrEqual(BELT.startBinned);
      await expect(page.locator('#belt span.k').first()).toBeAttached();
    });

    test('steps exactly every 130ms while on screen', async ({ site, page }) => {
      await site.open(name);
      await page.locator('footer').scrollIntoViewIfNeeded();
      await site.settle();
      // every step re-renders the <pre>: note the (fake) time of each write
      await page.evaluate(() => {
        const writes: number[] = [];
        (window as unknown as { __beltWrites: number[] }).__beltWrites = writes;
        const belt = document.getElementById('belt');
        if (!belt) throw new Error('no #belt');
        new MutationObserver(() => writes.push(performance.now())).observe(belt, { childList: true });
      });
      const ticks = 12;
      await site.advance(BELT.tick * ticks + BELT.tick / 2);
      const writes = await page.evaluate(() => (window as unknown as { __beltWrites: number[] }).__beltWrites);
      // the interval was started at load (t=0, performance.now() = PERF_BASE): steps land on its grid
      const expected = Array.from({ length: ticks }, (_, k) => PERF_BASE + BELT.tick * (k + 1));
      expect(writes).toEqual(expected);
    });

    test('only runs while the belt is on screen and the tab is visible', async ({ site, page }) => {
      await site.open(name);
      const offscreen = await belt(page);
      await site.advance(BELT.tick * 8);
      expect(await belt(page), 'below the fold: frozen').toEqual(offscreen);

      await page.locator('#belt').scrollIntoViewIfNeeded();
      await site.settle();
      await site.advance(BELT.tick * 8);
      const moved = await belt(page);
      expect(moved.html, 'on screen: the line moves').not.toBe(offscreen.html);
      expect(moved.rows).toHaveLength(BELT.rows);

      await setHidden(page, true);
      await site.advance(BELT.tick * 8);
      expect(await belt(page), 'tab hidden: frozen').toEqual(moved);
      await setHidden(page, false);

      await page.evaluate(() => window.scrollTo(0, 0));
      await site.settle();
      await site.advance(BELT.tick * 8);
      expect(await belt(page), 'scrolled away: frozen').toEqual(moved);
    });
  });
}

test('about idea line: crates are stamped [shipped] or [nope], and each counter only goes up', async ({ site, page }) => {
  // the about page is the cheaper one to simulate for a long stretch
  await site.open('about');
  await page.locator('#belt').scrollIntoViewIfNeeded();
  await site.settle();
  const start = await belt(page);
  let last = start;
  const verdicts = new Set<string>();
  const done = () => verdicts.size === 2 && last.shipped > start.shipped && last.binned > start.binned;
  for (let i = 0; i < 80 && !done(); i++) {
    await site.advance(BELT.tick * 10);
    const b = await belt(page);
    expect(b.shipped).toBeGreaterThanOrEqual(last.shipped);
    expect(b.binned).toBeGreaterThanOrEqual(last.binned);
    for (const m of b.rows.join('\n').matchAll(/\[(shipped|nope)\]/g)) verdicts.add(m[1] ?? '');
    last = b;
  }
  expect([...verdicts].sort(), 'both stamps were seen').toEqual(['nope', 'shipped']);
  expect(last.shipped, 'a crate was shipped').toBeGreaterThan(start.shipped);
  expect(last.binned, 'a crate was binned').toBeGreaterThan(start.binned);
});
