import { test, expect } from '../support/fixtures';
import type { Page } from '@playwright/test';
import { fingerprint, ink, lightAround } from '../support/canvas';
import { PAGE_NAMES, TEXTY } from '../support/expected';

/** asserts that pressing at (x, y) would land on empty space (not text or a control) */
async function expectEmptySpace(page: Page, x: number, y: number): Promise<void> {
  const hit = await page.evaluate(
    ({ x, y, texty }) => {
      const el = document.elementFromPoint(x, y);
      return el ? (el.closest(texty) ? `text: ${el.tagName.toLowerCase()}` : 'empty') : 'nothing';
    },
    { x, y, texty: TEXTY },
  );
  expect(hit, `(${x}, ${y}) should be empty space`).toBe('empty');
}

/** scrolls the first plain paragraph into view; returns the middle of its first word */
async function aWord(page: Page): Promise<{ x: number; y: number }> {
  const spot = await page.evaluate(() => {
    const p = [...document.querySelectorAll('main section > p')].find((el) => el.firstChild?.nodeType === Node.TEXT_NODE);
    const text = p?.firstChild;
    if (!p || !text) throw new Error('no plain paragraph');
    p.scrollIntoView({ block: 'center' });
    const r = document.createRange();
    r.setStart(text, 0);
    r.setEnd(text, 6);
    const b = r.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
  return spot;
}

for (const name of PAGE_NAMES) {
  test.describe(`${name} swarm`, () => {
    test('moths flutter across a full-window canvas', async ({ site, page }) => {
      await site.open(name);
      const swarm = page.locator('#swarm');
      await expect(swarm).toHaveAttribute('aria-hidden', 'true');
      const size = await swarm.evaluate((c: HTMLCanvasElement) => [c.width, c.height]);
      expect(size).toEqual([1280, 800]);
      await site.advance(100);
      expect(await ink(swarm)).toBeGreaterThan(200);
      const a = await fingerprint(swarm);
      await site.advance(300);
      expect(await fingerprint(swarm)).not.toBe(a);
      // no lamp unless someone presses
      expect(await ink(swarm, { minAlpha: 255 })).toBe(0);
    });

    test('pressing empty space lights a lamp that follows the pointer, and fades on release', async ({ site, page }) => {
      await site.open(name);
      await site.advance(300);
      const [x, y1, y2] = [40, 300, 600];
      await expectEmptySpace(page, x, y1);
      await expectEmptySpace(page, x, y2);
      expect(await lightAround(page, x, y1)).toBe(0);

      await page.mouse.move(x, y1);
      await page.mouse.down();
      await site.settle();
      await site.advance(600);
      expect(await lightAround(page, x, y1)).toBeGreaterThan(300);

      // held: the light trails the pointer
      await page.mouse.move(x, y2, { steps: 4 });
      await site.settle();
      await site.advance(800);
      expect(await lightAround(page, x, y2, 60)).toBeGreaterThan(await lightAround(page, x, y1, 60));

      await page.mouse.up();
      await site.settle();
      await site.advance(2500);
      expect(await ink(page.locator('#swarm'), { minAlpha: 255 })).toBe(0);
    });

    test('pressing on text is for selecting it: no lamp', async ({ site, page }) => {
      await site.open(name);
      await site.advance(300);
      const word = await aWord(page);
      await site.settle();
      await page.mouse.move(word.x, word.y);
      await page.mouse.down();
      await site.settle();
      await site.advance(800);
      expect(await ink(page.locator('#swarm'), { minAlpha: 255 })).toBe(0);
      await page.mouse.up();
    });
  });
}

/** ways the lamp must go out while the button is still physically down */
const PUT_OUT: { what: string; how: (page: Page) => Promise<void> }[] = [
  {
    what: 'a text selection starting (quietly quenched)',
    how: (page) =>
      page.evaluate(() => {
        const p = [...document.querySelectorAll('main p')].find((el) => (el.textContent ?? '').trim().length > 20);
        if (!p) throw new Error('no paragraph');
        getSelection()?.selectAllChildren(p);
      }),
  },
  { what: 'the window losing focus', how: (page) => page.evaluate(() => void window.dispatchEvent(new FocusEvent('blur'))) },
  {
    what: 'the browser cancelling the pointer',
    how: (page) =>
      page.evaluate(
        () =>
          void document.body.dispatchEvent(
            new PointerEvent('pointercancel', { bubbles: true, pointerId: 1, pointerType: 'mouse', isPrimary: true }),
          ),
      ),
  },
];

for (const name of PAGE_NAMES) {
  for (const { what, how } of PUT_OUT) {
    test(`${name}: the lamp goes out on ${what}`, async ({ site, page }) => {
      await site.open(name);
      await site.advance(300);
      const [x, y] = [40, 300];
      await expectEmptySpace(page, x, y);
      await page.mouse.move(x, y);
      await page.mouse.down();
      await site.settle();
      await site.advance(600);
      expect(await lightAround(page, x, y), 'lit while held').toBeGreaterThan(300);
      await how(page);
      await site.settle();
      await site.advance(2500);
      // the button is still down, but the lamp has faded out
      expect(await ink(page.locator('#swarm'), { minAlpha: 255 })).toBe(0);
      await page.mouse.up();
    });
  }
}
