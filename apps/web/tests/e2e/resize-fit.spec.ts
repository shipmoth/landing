/**
 * A window resized to a width must look like a page loaded at that width: the hero (moth canvases,
 * wordmark canvas) and everything sized by script re-lay out to the new width, in both directions.
 *
 * The bug this guards: the laid-out wordmark canvas is wider than the text column (PAD on each side
 * of the art), and .title, a grid item, had min-width:auto, so the canvas's min-content held the
 * column open. The wordmark measured its h1, which then never shrank: resized from a desktop to a
 * phone width it kept its desktop size, pushed the moth ~100px right (#orbit centres itself on that
 * column) and widened the page; it also crept wider on every resize at desktop widths. Now the
 * column decides .title's width (min-width:0 in global.css) and the canvas is centred on it,
 * spilling into the gutter, so a plain re-layout measures the same column a fresh load does.
 *
 * Reduced motion had the same fault without any resize: the wordmark used to be laid out a second
 * time at load (to draw it whole), and that pass measured the column the first one had widened, so
 * the wordmark came out one step too big (476px instead of 420px at 390px, its art clipped by the
 * screen edge).
 */
import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';

const HEIGHT = 800;
const SETTLE = 300; // re-layouts are debounced by 120ms

/** every script-set size and the hero's layout, rounded so sub-pixel noise does not matter */
function measure(page: Page) {
  return page.evaluate(() => {
    const px = (n: number) => Math.round(n * 100) / 100;
    const box = (sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: px(r.left), width: px(r.width) };
    };
    const canvas = (el: Element | null) =>
      el instanceof HTMLCanvasElement ? { css: `${el.style.width} x ${el.style.height}`, backing: `${el.width} x ${el.height}` } : null;
    return {
      orbit: box('#orbit'),
      // (layout box, not the client rect: the stage tilts and bobs while the moth flies)
      stage: ((el) => (el ? { left: el.offsetLeft, width: el.offsetWidth } : null))(document.querySelector<HTMLElement>('#orbit .stage')),
      moth: [...document.querySelectorAll('#orbit .stage canvas')].map(canvas),
      word: canvas(document.querySelector('.title .word')),
      wordMargin: document.querySelector<HTMLElement>('.title .word')?.style.margin ?? null,
      title: box('.title'),
      hero: box('.hero'),
      crew: canvas(document.getElementById('crew')),
      belt: box('#belt'),
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
}

for (const narrow of [390, 360, 320, 768]) {
  test.describe(`${narrow}px`, () => {
    test.use({ viewport: { width: narrow, height: HEIGHT } });

    for (const wide of [1920, 1280]) {
      test(`index: loaded at ${wide}, resized to ${narrow} and back, matches fresh loads`, async ({ site, page, twin }) => {
        await page.setViewportSize({ width: wide, height: HEIGHT });
        await site.open('index');
        await site.advance(1500);
        const freshWide = await measure(page);

        const fresh = await twin.open('index');
        await page.setViewportSize({ width: narrow, height: HEIGHT });
        await site.advance(SETTLE);
        const freshNarrow = await measure(fresh);
        // (scrollWidth included: the resized page overflows no further than a fresh one)
        expect(await measure(page), `${wide} -> ${narrow}`).toEqual(freshNarrow);

        await page.setViewportSize({ width: wide, height: HEIGHT });
        await site.advance(SETTLE);
        expect(await measure(page), `${wide} -> ${narrow} -> ${wide}`).toEqual(freshWide);
      });
    }
  });
}

test('index: repeated resizes at desktop widths do not creep', async ({ site, page }) => {
  await site.open('index');
  await site.advance(1500);
  const before = await measure(page);
  for (const width of [1920, 1100, 1280, 1920, 1280]) {
    await page.setViewportSize({ width, height: HEIGHT });
    await site.advance(SETTLE);
  }
  expect(await measure(page)).toEqual(before);
});

test.describe('390px', () => {
  test.use({ viewport: { width: 390, height: HEIGHT } });

  test('about: loaded at 1920 and resized to 390 matches a fresh load', async ({ site, page, twin }) => {
    // the about page has no wordmark; its crew canvas and idea line follow the width
    await page.setViewportSize({ width: 1920, height: HEIGHT });
    await site.open('about');
    await site.advance(1500);
    const fresh = await twin.open('about');
    await page.setViewportSize({ width: 390, height: HEIGHT });
    await site.advance(SETTLE);
    expect(await measure(page)).toEqual(await measure(fresh));
  });
});

test.describe('390px, reduced motion', () => {
  test.use({ viewport: { width: 390, height: HEIGHT }, reducedMotion: 'reduce' });

  test('index: a fresh load lays the wordmark out as with motion, its art on screen', async ({ site, page, twin }) => {
    const still = await twin.open('index');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await site.open('index');
    const [a, b] = [await measure(still), await measure(page)];
    expect(a.word).toEqual(b.word);
    expect(a.title).toEqual(b.title);
    // the art is the canvas less PAD (70px) on each side: it must sit inside the text column (main's content box)
    const art = await still.evaluate(() => {
      const r = document.querySelector('.title .word')?.getBoundingClientRect();
      const main = document.querySelector('main');
      if (!r || !main) return null;
      const m = main.getBoundingClientRect(), cs = getComputedStyle(main);
      return { left: r.left + 70, right: r.right - 70, column: { left: m.left + parseFloat(cs.paddingLeft), right: m.right - parseFloat(cs.paddingRight) } };
    });
    expect(art?.left).toBeGreaterThanOrEqual((art?.column.left ?? Infinity) - 0.5);
    expect(art?.right).toBeLessThanOrEqual((art?.column.right ?? 0) + 0.5);
  });

  test('index: loaded at 1920 and resized to 390 matches a fresh load', async ({ site, page, twin }) => {
    await page.setViewportSize({ width: 1920, height: HEIGHT });
    await site.open('index');
    const fresh = await twin.open('index');
    await page.setViewportSize({ width: 390, height: HEIGHT });
    await site.advance(SETTLE);
    expect(await measure(page)).toEqual(await measure(fresh));
  });
});
