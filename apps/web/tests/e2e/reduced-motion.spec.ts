import { test, expect } from '../support/fixtures';
import { fingerprint, ink } from '../support/canvas';
import { PAGES, PAGE_NAMES } from '../support/expected';

test.use({ reducedMotion: 'reduce' });

for (const name of PAGE_NAMES) {
  test(`${name}: with reduced motion everything is drawn once and stays still`, async ({ site, page }) => {
    await site.open(name);
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);

    // no swarm at all, the full line at once, a still spinner
    await expect(page.locator('#swarm')).toHaveCount(0);
    await expect(page.locator('#typed')).toHaveText(PAGES[name].line);
    await expect(page.locator('#spin')).toHaveText('|');

    const canvases = page.locator(name === 'index' ? '#orbit canvas, .title canvas.word' : '#crew');
    await site.advance(50);
    const drawn = await canvases.evaluateAll((els) => els.length);
    expect(drawn).toBeGreaterThan(0);
    const before: string[] = [];
    for (const cv of await canvases.all()) {
      expect(await ink(cv), 'drawn straight away').toBeGreaterThan(100);
      before.push(await fingerprint(cv));
    }

    await page.locator('#belt').scrollIntoViewIfNeeded();
    await site.settle();
    const beltBefore = await page.locator('#belt').innerHTML();
    // the spinner, sampled between its would-be ticks (every 240ms, four frames: a single look at a
    // multiple of the cycle would see "|" even if it spun)
    const spins = new Set<string>();
    for (let t = 0; t < 1200; t += 100) {
      await site.advance(100);
      spins.add((await page.locator('#spin').textContent()) ?? '');
    }
    expect([...spins], 'the spinner never moves').toEqual(['|']);
    await site.advance(1800);
    expect(await page.locator('#belt').innerHTML()).toBe(beltBefore);
    const after: string[] = [];
    for (const cv of await canvases.all()) after.push(await fingerprint(cv));
    expect(after).toEqual(before);
    if (name === 'index') {
      // the wings hold still: no transform is ever written
      expect(await page.locator('#orbit .wl').evaluate((el) => (el as HTMLElement).style.transform)).toBe('');
    }
    // (CSS animations under reduced motion: css-animations.spec.ts)
  });
}
