import { test, expect } from '../support/fixtures';
import type { Page } from '@playwright/test';
import { lightAround } from '../support/canvas';
import { PAGE_NAMES, TEXTY } from '../support/expected';

/**
 * Pressing empty space is "for the light", so a left press is default-prevented to stop a
 * text-selection drag. That guard must not touch the other buttons: cancelling a middle-button
 * mousedown kills the browser's autoscroll (middle-click and drag to scroll): with an
 * unconditional preventDefault the middle button would only scroll when pressed on text.
 */

/** presses `button` at (x, y) and reports whether the page's own mousedown handlers cancelled it */
async function pressAndCheckPrevented(page: Page, x: number, y: number, button: 'left' | 'middle' | 'right'): Promise<boolean> {
  await page.evaluate(() => {
    // a bubble-phase listener registered after load runs after the site's, so defaultPrevented is final
    const w = window as unknown as { __prevented?: boolean };
    delete w.__prevented;
    addEventListener('mousedown', (e) => { w.__prevented = e.defaultPrevented; }, { once: true });
  });
  await page.mouse.move(x, y);
  await page.mouse.down({ button });
  const prevented = await page.evaluate(() => (window as unknown as { __prevented?: boolean }).__prevented);
  await page.mouse.up({ button });
  expect(prevented, 'the mousedown listener ran').not.toBeUndefined();
  return prevented === true;
}

for (const name of PAGE_NAMES) {
  test.describe(`${name} mouse buttons on empty space`, () => {
    const [x, y] = [40, 300];

    test.beforeEach(async ({ site, page }) => {
      await site.open(name);
      await site.advance(300);
      const hit = await page.evaluate(
        ({ x, y, texty }) => {
          const el = document.elementFromPoint(x, y);
          return el ? (el.closest(texty) ? 'text' : 'empty') : 'nothing';
        },
        { x, y, texty: TEXTY },
      );
      expect(hit, `(${x}, ${y}) should be empty space`).toBe('empty');
    });

    test('a middle press is not cancelled, so the browser can autoscroll', async ({ page }) => {
      expect(await pressAndCheckPrevented(page, x, y, 'middle')).toBe(false);
    });

    test('a right press is not cancelled either', async ({ page }) => {
      expect(await pressAndCheckPrevented(page, x, y, 'right')).toBe(false);
    });

    test('a left press still is (no text-selection drag) and still lights the lamp', async ({ site, page }) => {
      expect(await lightAround(page, x, y)).toBe(0);
      expect(await pressAndCheckPrevented(page, x, y, 'left')).toBe(true);
      await page.mouse.down();
      await site.settle();
      await site.advance(600);
      expect(await lightAround(page, x, y)).toBeGreaterThan(300);
      await page.mouse.up();
    });
  });
}
