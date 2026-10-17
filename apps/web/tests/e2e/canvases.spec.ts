import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { fingerprint, ink } from '../support/canvas';
import { advance, settle } from '../support/deterministic-page';
import { ART_RENDER } from '../support/expected';

/** steps several pages' clocks side by side (they are independent browser contexts) */
const advanceAll = (pages: Page[], ms: number) => Promise.all(pages.map((p) => advance(p, ms)));
const settleAll = (pages: Page[]) => Promise.all(pages.map((p) => settle(p)));

/** the hero at a desktop size (moth as glyphs, wordmark as bars) and on a 3x phone (both as
 *  bars: art-render.spec.ts); every animation must work either way. The phone runs the specs
 *  whose drawing depends on the mode (input handling is the same at any size), one at a time: a 3x
 *  page stepped through seconds of animation is heavy, and several at once starve the other workers. */
const SIZES = {
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  'phone 3x': { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 },
};

for (const [sizeName, size] of Object.entries(SIZES)) {
  const phone = size.deviceScaleFactor > 1;
  test.describe(sizeName, () => {
    test.use(size);
    if (phone) test.describe.configure({ mode: 'default' });

    test.describe('index hero', () => {
      test('the moth is printed outward by the light onto three hinged canvases', async ({ site, page }) => {
        await site.open('index');
        const parts = page.locator('#orbit > .stage > canvas');
        await expect(parts).toHaveCount(3);
        expect(await parts.evaluateAll((els) => els.map((e) => e.className))).toEqual(['wl', 'wb', 'wr']);
        for (const cv of await parts.all()) {
          const box = await cv.boundingBox();
          expect(box?.width ?? 0).toBeGreaterThan(10);
          expect(box?.height ?? 0).toBeGreaterThan(100);
        }

        // nothing exists ahead of the light: the entrance starts after a 200ms delay
        await site.advance(150);
        for (const cv of await parts.all()) expect(await ink(cv)).toBe(0);

        // the light starts at the body and grows outward: the body is lit before the wing tips
        await site.advance(500);
        const body = await ink(parts.nth(1));
        expect(body).toBeGreaterThan(0);
        const early = (await ink(parts.nth(0))) + (await ink(parts.nth(2)));

        await site.advance(3000);
        const counts = await Promise.all((await parts.all()).map((cv) => ink(cv)));
        for (const n of counts) expect(n).toBeGreaterThan(500);
        expect((counts[0] ?? 0) + (counts[2] ?? 0)).toBeGreaterThan(early * 2);
      });

      test('the wings flap: the side canvases rotate about the body and the stage bobs', async ({ site, page }) => {
        await site.open('index');
        await site.advance(500);
        const read = () =>
          page.evaluate(() => {
            const t = (sel: string) => document.querySelector<HTMLElement>(sel)?.style.transform ?? '';
            return { stage: t('#orbit .stage'), left: t('#orbit .wl'), right: t('#orbit .wr') };
          });
        const a = await read();
        expect(a.stage).toMatch(/^translateY\(-?[\d.]+px\) rotateX\(-?[\d.]+deg\) rotateY\(-?[\d.]+deg\)$/);
        expect(a.left).toMatch(/^rotateY\([\d.]+deg\)$/);
        // the two wings mirror each other
        expect(a.right).toBe(a.left.replace('rotateY(', 'rotateY(-'));
        await site.advance(700);
        const b = await read();
        expect(b.left).not.toBe(a.left);
        expect(b.stage).not.toBe(a.stage);
      });

      test('pressing the moth makes it beat its wings harder for a while', async ({ twin }) => {
        test.skip(phone, 'input handling, the same at any size');
        const [calm, poked] = [await twin.open('index'), await twin.open('index')];
        await advanceAll([calm, poked], 1500);
        /** the widest wing angle over the next 600ms, sampled every 40ms */
        const widest = async (p: Page) => {
          let max = 0;
          for (let i = 0; i < 15; i++) {
            await advance(p, 40);
            const deg = await p.evaluate(() => parseFloat(/rotateY\(([\d.]+)deg\)/.exec(document.querySelector<HTMLElement>('#orbit .wl')?.style.transform ?? '')?.[1] ?? '0'));
            max = Math.max(max, deg);
          }
          return max;
        };
        await poked.locator('#orbit').click({ position: { x: 40, y: 40 } });
        const [a, b] = await Promise.all([widest(calm), widest(poked)]);
        // a press adds 20 degrees of depth that fades over a few seconds
        expect(b, `calm ${a}deg, pressed ${b}deg`).toBeGreaterThan(a + 8);
      });

      test('the wordmark types in after the moth, then keeps drawing', async ({ site, page }) => {
        await site.open('index');
        const word = page.locator('.title canvas.word');
        await expect(word).toHaveAttribute('aria-hidden', 'true');
        await site.advance(650);
        expect(await ink(word)).toBe(0);
        await site.advance(150); // ~5 steps of the type-in
        const partial = await ink(word);
        expect(partial).toBeGreaterThan(0);
        await site.advance(2500);
        const full = await ink(word);
        expect(full).toBeGreaterThan(partial * 3);
        // the tide of light keeps rolling through it
        const before = await fingerprint(word);
        await site.advance(500);
        expect(await fingerprint(word)).not.toBe(before);
      });
    });

    test.describe('index wordmark under the pointer', () => {
      /** two index pages in step, the second with the pointer over the wordmark */
      async function pushed(twin: { open: (n: 'index') => Promise<Page> }) {
        const [calm, poked] = [await twin.open('index'), await twin.open('index')];
        await advanceAll([calm, poked], 3500);
        const wordOf = (p: Page) => fingerprint(p.locator('.title canvas.word'));
        // identical until the pointer arrives, so any later difference is the pointer's doing
        expect(await wordOf(poked)).toBe(await wordOf(calm));
        const box = await poked.locator('.title canvas.word').boundingBox();
        if (!box) throw new Error('no wordmark');
        // the same input sequence on both, except one pointer passes over the word
        // (the art starts 70px into the canvas; stay inside the 800px viewport or no event is sent)
        const [px, py] = [box.width / 2, 90];
        await calm.mouse.move(5, 5);
        await poked.mouse.move(box.x + px, box.y + py);
        await settleAll([calm, poked]);
        await advanceAll([calm, poked], 200);
        expect(await wordOf(poked), 'the pointer disturbs the wordmark').not.toBe(await wordOf(calm));
        // the letters right under the pointer are pushed out of the way: that spot clears. (The ripples
        // the pointer also sends out brighten the letters instead, so they cannot pass for this.)
        // (a 20px square: the hole is a few px across, the letters are only pushed a cell or two. Counts
        // well-inked pixels: bars are opaque, the partial pixel rows at their edges are not)
        const under = (p: Page) => ink(p.locator('.title canvas.word'), { region: { x: px - 10, y: py - 10, width: 20, height: 20 }, minAlpha: 40 });
        const [before, after] = [await under(calm), await under(poked)];
        expect(before, 'letters under the pointer to push').toBeGreaterThan(20);
        expect(after, `ink under the pointer: ${before} at rest, ${after} pushed`).toBeLessThan(before * 0.9);
        return { calm, poked, wordOf };
      }

      test('letters near the pointer are pushed aside, and spring back when it leaves', async ({ twin, browserName }) => {
        test.slow(browserName !== 'chromium', 'two index pages for 5s of simulated time');
        const { calm, poked, wordOf } = await pushed(twin);
        await poked.mouse.move(5, 5, { steps: 4 });
        await settleAll([calm, poked]);
        // still moving back a moment later...
        await advanceAll([calm, poked], 100);
        expect(await wordOf(poked), 'springing back').not.toBe(await wordOf(calm));
        // ...and exactly at rest once the springs and ripples have died down
        await advanceAll([calm, poked], 1500);
        expect(await wordOf(poked), 'back to rest').toBe(await wordOf(calm));
      });

      test('scrolling makes the wordmark forget the pointer: pushed letters spring back', async ({ twin, browserName }) => {
        test.skip(phone, 'input handling, the same at any size');
        test.slow(browserName !== 'chromium', 'two index pages for 5s of simulated time');
        const { calm, poked, wordOf } = await pushed(twin);
        // the page scrolls under a pointer that does not move (a wheel, a keyboard scroll, a script):
        // the wordmark can no longer tell where the pointer is, so it lets go. (Far enough that the
        // pointer is off the word afterwards: WebKit sends a mouse move after a scroll, and a pointer
        // that is really still over the letters should keep pushing them.)
        await Promise.all([calm, poked].map((p) => p.evaluate(() => window.scrollTo(0, 400))));
        await settleAll([calm, poked]);
        await advanceAll([calm, poked], 1500);
        expect(await wordOf(poked), 'back to rest after the scroll').toBe(await wordOf(calm));
      });
    });
  });
}

test.describe('on a 3x screen', () => {
  test.use({ deviceScaleFactor: 3 });

  for (const name of ['index', 'about'] as const) {
    test(`${name}: the swarm and crew draw at 2x, the hero art at 3x within its pixel budget`, async ({ site, page }) => {
      await site.open(name);
      await site.advance(1000);
      expect(await page.evaluate(() => devicePixelRatio)).toBe(3);
      const sizes = await page.locator('canvas').evaluateAll((els) =>
        els.map((el) => {
          const cv = el as HTMLCanvasElement;
          const cs = getComputedStyle(cv);
          return { id: cv.id || cv.className, width: cv.width, height: cv.height, cssWidth: parseFloat(cs.width), cssHeight: parseFloat(cs.height) };
        }),
      );
      expect(sizes.length).toBeGreaterThanOrEqual(2);
      const moth = sizes.filter((s) => ['wl', 'wb', 'wr'].includes(s.id));
      const capped = sizes.filter((s) => !moth.includes(s) && s.id !== 'word');
      expect(capped.length, 'the swarm (and crew)').toBeGreaterThanOrEqual(1);
      for (const s of capped) {
        // backing store = CSS size x 2 (rounded up where the CSS size is fractional)
        expect(Math.abs(s.width - s.cssWidth * 2), JSON.stringify(s)).toBeLessThanOrEqual(1);
        expect(Math.abs(s.height - s.cssHeight * 2), JSON.stringify(s)).toBeLessThanOrEqual(1);
      }
      if (name !== 'index') return;
      // the wordmark (609 x 229 css px at 1280) fits the budget at 3x: native
      const word = sizes.find((s) => s.id === 'word');
      expect(word && Math.abs(word.width - word.cssWidth * 3), JSON.stringify(word)).toBeLessThanOrEqual(1);
      // the moth (1100 x 624 css px, three canvases) would be 6 Mpx at 3x: as dense as the budget allows
      expect(moth).toHaveLength(3);
      const area = moth.reduce((a, s) => a + s.width * s.height, 0);
      const scale = moth.map((s) => s.width / s.cssWidth);
      expect(area, JSON.stringify(moth)).toBeLessThanOrEqual(ART_RENDER.pixelBudget * 1.01);
      expect(area, JSON.stringify(moth)).toBeGreaterThan(ART_RENDER.pixelBudget * 0.97);
      for (const k of scale) expect(k, JSON.stringify(moth)).toBeGreaterThan(2);
    });
  }
});

test.describe('on a 2x screen', () => {
  test.use({ deviceScaleFactor: 2 });

  test('about: canvases draw at the full 2x', async ({ site, page }) => {
    // (the cap above must not also flatten the screens it is meant to serve)
    await site.open('about');
    const crew = await page.locator('#crew').evaluate((cv: HTMLCanvasElement) => ({ w: cv.width, css: parseFloat(getComputedStyle(cv).width) }));
    expect(crew.w).toBe(Math.round(crew.css * 2));
  });
});
