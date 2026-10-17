/**
 * Small cells: the hero moth and the wordmark draw each art cell as its glyph while a cell is wide
 * enough on screen for a glyph's shape, and as a bar of light below that (opaque, in the cell's
 * colour, as tall as the glyph is dense). On a phone a cell is ~2-3 device pixels; drawn as glyphs
 * there, antialiasing smeared away much of the ink and the art came out a quarter dimmer than on a
 * desktop.
 *
 * Checked here: which way each canvas draws at desktop and phone sizes (by recording the canvas
 * calls), that the choice follows a resize and a pixel-ratio change, that the 3x phone canvases are
 * really 3x, that the phone art is about as bright as the desktop art and keeps its highlights,
 * and that the moth's entrance and flicker still step through the ink levels when drawn as bars.
 * (The wing flight, the wordmark's type-in, tide and pointer response at phone size:
 * canvases.spec.ts.)
 */
import type { Browser, BrowserContextOptions, Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { artLook } from '../support/canvas';
import { advance, makeDeterministic, visit } from '../support/deterministic-page';
import { ART_RENDER, PAGES } from '../support/expected';

const DESKTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
const PHONES = {
  '390@3x': { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 },
  '320@2x': { viewport: { width: 320, height: 640 }, deviceScaleFactor: 2 },
};

interface Calls {
  fillText: number;
  fillRect: number;
}

declare global {
  interface Window {
    /** canvas draw calls by canvas: class name, or "offscreen WxH" for a canvas not in the page */
    __draws?: Record<string, Calls>;
    /** bar mode, the moth's body canvas: every bar's height, by cell (its column and its middle) */
    __bodyBars?: Record<string, number[]>;
    /** every resolution media query the page made */
    __resolutionQueries?: MediaQueryList[];
  }
}

/** records fillText / fillRect per canvas, and the heights the moth's body bars are drawn at */
function recordDraws(): void {
  const draws: Record<string, Calls> = {};
  const bars: Record<string, number[]> = {};
  window.__draws = draws;
  window.__bodyBars = bars;
  const proto = CanvasRenderingContext2D.prototype;
  const key = (cv: HTMLCanvasElement): string => cv.className || cv.id || `offscreen ${cv.width}x${cv.height}`;
  const fillText = proto.fillText;
  proto.fillText = function (this: CanvasRenderingContext2D, ...args: Parameters<CanvasRenderingContext2D['fillText']>) {
    (draws[key(this.canvas)] ??= { fillText: 0, fillRect: 0 }).fillText++;
    return fillText.apply(this, args);
  };
  const fillRect = proto.fillRect;
  proto.fillRect = function (this: CanvasRenderingContext2D, ...args: Parameters<CanvasRenderingContext2D['fillRect']>) {
    (draws[key(this.canvas)] ??= { fillText: 0, fillRect: 0 }).fillRect++;
    if (this.canvas.className === 'wb') (bars[`${args[0].toFixed(2)},${(args[1] + args[3] / 2).toFixed(2)}`] ??= []).push(args[3]);
    return fillRect.apply(this, args);
  };
  const queries: MediaQueryList[] = [];
  window.__resolutionQueries = queries;
  const matchMedia = window.matchMedia.bind(window);
  window.matchMedia = (q: string): MediaQueryList => {
    const mq = matchMedia(q);
    if (q.includes('resolution')) queries.push(mq);
    return mq;
  };
}

/** a fresh deterministic context at a size, with the draw recorder, on the home page */
async function openAt(browser: Browser, base: BrowserContextOptions, size: BrowserContextOptions, motion: 'reduce' | 'no-preference'): Promise<Page> {
  const context = await browser.newContext({ ...base, ...size, reducedMotion: motion });
  await context.addInitScript(recordDraws);
  const page = await context.newPage();
  await makeDeterministic(context, page);
  await visit(page, PAGES.index.url);
  return page;
}

/** draw calls since the last reset: the moth's three canvases summed, and the wordmark's base layer */
async function drawCalls(page: Page): Promise<{ moth: Calls; word: Calls }> {
  return page.evaluate(() => {
    const d = window.__draws ?? {};
    const sum = (keys: string[]): Calls => keys.reduce((a, k) => ({ fillText: a.fillText + (d[k]?.fillText ?? 0), fillRect: a.fillRect + (d[k]?.fillRect ?? 0) }), { fillText: 0, fillRect: 0 });
    const word = document.querySelector<HTMLCanvasElement>('.title canvas.word');
    // the wordmark draws its letters on an offscreen layer the size of its canvas, then copies it in
    return { moth: sum(['wl', 'wb', 'wr']), word: sum(word ? [`offscreen ${word.width}x${word.height}`] : []) };
  });
}

const resetDraws = (page: Page) => page.evaluate(() => { for (const k of Object.keys(window.__draws ?? {})) delete window.__draws?.[k]; });

/** device pixels per css pixel of each hero canvas's backing store, and of the wordmark's */
function backingScale(page: Page): Promise<{ moth: number[]; word: number }> {
  return page.evaluate(() => {
    const scale = (cv: HTMLCanvasElement) => cv.width / parseFloat(cv.style.width);
    const word = document.querySelector<HTMLCanvasElement>('.title canvas.word');
    return { moth: [...document.querySelectorAll<HTMLCanvasElement>('#orbit canvas')].map(scale), word: word ? scale(word) : 0 };
  });
}

test.describe('glyphs or bars', () => {
  test('1280px at 1x: the moth is drawn as glyphs, the wordmark (1.5px cells) as bars', async ({ browser, pageOptions }) => {
    const page = await openAt(browser, pageOptions, DESKTOP, 'reduce');
    const { moth, word } = await drawCalls(page);
    expect(moth.fillText, 'moth glyphs').toBeGreaterThanOrEqual(ART_RENDER.heroCells);
    expect(moth.fillRect, 'no moth bars').toBe(0);
    expect(word.fillRect, 'wordmark bars').toBeGreaterThanOrEqual(ART_RENDER.wordCells);
    expect(word.fillText, 'no wordmark glyphs').toBe(0);
    await page.context().close();
  });

  test('390px at 3x: both are drawn as bars, on canvases at the full 3x', async ({ browser, pageOptions }) => {
    const page = await openAt(browser, pageOptions, PHONES['390@3x'], 'reduce');
    const { moth, word } = await drawCalls(page);
    expect(moth.fillRect, 'moth bars').toBeGreaterThanOrEqual(ART_RENDER.heroCells);
    expect(moth.fillText, 'no moth glyphs').toBe(0);
    expect(word.fillRect, 'wordmark bars').toBeGreaterThanOrEqual(ART_RENDER.wordCells);
    expect(word.fillText, 'no wordmark glyphs').toBe(0);
    // native resolution, not the 2x every other canvas is capped at (well inside the pixel budget)
    const scale = await backingScale(page);
    for (const s of [...scale.moth, scale.word]) expect(s, JSON.stringify(scale)).toBeCloseTo(3, 1);
    await page.context().close();
  });

  test('the choice follows a resize: shrunk to a phone width, the desktop moth turns to bars', async ({ browser, pageOptions }) => {
    const page = await openAt(browser, pageOptions, DESKTOP, 'reduce');
    expect((await drawCalls(page)).moth.fillRect).toBe(0);
    await resetDraws(page);
    await page.setViewportSize({ width: 390, height: 800 });
    await advance(page, 300); // re-layouts wait for the resize to settle (120ms)
    const { moth } = await drawCalls(page);
    expect(moth.fillRect, 'moth bars after the resize').toBeGreaterThanOrEqual(ART_RENDER.heroCells);
    expect(moth.fillText).toBe(0);
    await page.context().close();
  });

  test('the choice follows the pixel ratio: at 3x the desktop wordmark gets glyphs', async ({ browser, pageOptions, browserName }) => {
    test.skip(browserName !== 'chromium', 'changes the pixel ratio of a loaded page over CDP');
    const page = await openAt(browser, pageOptions, DESKTOP, 'reduce');
    expect((await drawCalls(page)).word.fillText).toBe(0);
    await resetDraws(page);
    // the window moves to a 3x screen, at the same size: the ratio changes, no resize event. (Chromium
    // changes the ratio under emulation but does not tell the page's media queries, so the change
    // event a browser sends is sent here by hand to the resolution queries the page is watching.)
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 3, mobile: false });
    expect(await page.evaluate(() => devicePixelRatio)).toBe(3);
    const watched = await page.evaluate(() => {
      const qs = (window.__resolutionQueries ?? []).filter((q) => q.media.includes('1dppx'));
      for (const q of qs) q.dispatchEvent(new Event('change'));
      return qs.length;
    });
    expect(watched, 'the page watches the pixel ratio').toBeGreaterThan(0);
    await advance(page, 300);
    expect(await page.evaluate(() => window.__deterministic?.resizes), 'no resize event').toBe(0);
    // 1.49px cells x 3 = 4.5 device px: wide enough for glyphs
    const { word, moth } = await drawCalls(page);
    expect(word.fillText, 'wordmark glyphs at 3x').toBeGreaterThanOrEqual(ART_RENDER.wordCells);
    expect(word.fillRect).toBe(0);
    expect(moth.fillText, 'the moth re-drawn for the new ratio').toBeGreaterThanOrEqual(ART_RENDER.heroCells);
    expect((await backingScale(page)).word).toBeCloseTo(3, 1);
    await page.context().close();
  });
});

test.describe('brightness', () => {
  for (const [name, size] of Object.entries(PHONES)) {
    test(`at ${name} the moth and wordmark are about as bright as at 1280px`, async ({ browser, pageOptions, browserName }) => {
      const desk = await openAt(browser, pageOptions, DESKTOP, 'reduce');
      const phone = await openAt(browser, pageOptions, size, 'reduce');
      const [dl, pl] = [await artLook(desk, ART_RENDER.wordPad), await artLook(phone, ART_RENDER.wordPad)];
      await Promise.all([desk.context().close(), phone.context().close()]);
      const [d, p] = [{ moth: dl.moth.mean, word: dl.word.mean }, { moth: pl.moth.mean, word: pl.word.mean }];
      const report = `desktop ${JSON.stringify(d)}, ${name} ${JSON.stringify(p)}`;
      expect(d.moth, report).toBeGreaterThan(0.02);
      expect(d.word, report).toBeGreaterThan(0.02);
      // no dimmer than 90% of the desktop art
      expect(p.moth / d.moth, `moth: ${report}`).toBeGreaterThanOrEqual(0.9);
      expect(p.word / d.word, `wordmark: ${report}`).toBeGreaterThanOrEqual(0.9);
      // The bars' brightness was matched to the desktop glyphs as Chromium rasterises them; WebKit
      // draws the same glyphs fainter (its desktop moth is ~0.7 as bright), so the bars are
      // brighter than its glyphs. The upper bounds hold for the engine they were tuned on.
      if (browserName !== 'chromium') return;
      // not a glare either
      expect(p.moth / d.moth, `moth: ${report}`).toBeLessThanOrEqual(1.2);
      expect(p.word / d.word, `wordmark: ${report}`).toBeLessThanOrEqual(1.2);
      // and the desktop wordmark (bars at 1x) did not dim either: drawn as glyphs it was 0.94 as
      // bright as the desktop moth (glyphs) beside it
      expect(d.word / d.moth, `desktop wordmark against the desktop moth: ${report}`).toBeGreaterThanOrEqual(0.8);
      expect(d.word / d.moth, `desktop wordmark against the desktop moth: ${report}`).toBeLessThanOrEqual(1.1);
    });
  }
});

test.describe('vividness', () => {
  // Matching the average is not enough: a translucent wash over each whole cell matched it too,
  // but no pixel ever reached the art's colour, so the art looked flat. The highlights (the 95th
  // percentile of what the inked pixels show) and the share of bright pixels must come to at least
  // ~80% of the desktop glyph render's: the moth's measured here (glyphs at 1280px), the wordmark's
  // as it was measured before it had bars (ART_RENDER.wordGlyphLook).
  for (const [name, size] of Object.entries({ '1280@1x': DESKTOP, ...PHONES, '390@2x': { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 } })) {
    test(`at ${name} the art keeps its highlights`, async ({ browser, pageOptions }) => {
      const desk = await openAt(browser, pageOptions, DESKTOP, 'reduce');
      const ref = (await artLook(desk, ART_RENDER.wordPad)).moth;
      await desk.context().close();
      const page = await openAt(browser, pageOptions, size, 'reduce');
      const { moth, word } = await artLook(page, ART_RENDER.wordPad);
      await page.context().close();
      const report = `glyph moth ${JSON.stringify(ref)}, ${name}: moth ${JSON.stringify(moth)}, wordmark ${JSON.stringify(word)}`;
      expect(moth.p95 / ref.p95, `moth highlights: ${report}`).toBeGreaterThanOrEqual(0.8);
      expect(moth.bright / ref.bright, `moth bright share: ${report}`).toBeGreaterThanOrEqual(0.8);
      expect(word.p95 / ART_RENDER.wordGlyphLook.p95, `wordmark highlights: ${report}`).toBeGreaterThanOrEqual(0.8);
      expect(word.bright / ART_RENDER.wordGlyphLook.bright, `wordmark bright share: ${report}`).toBeGreaterThanOrEqual(0.8);
    });
  }
});

test.describe('the moth animates as bars (390px at 3x)', () => {
  test('the entrance builds the ink up step by step, then it settles; the flicker shifts ink', async ({ browser, pageOptions }) => {
    test.slow();
    const page = await openAt(browser, pageOptions, PHONES['390@3x'], 'no-preference');
    const lum: number[] = [];
    for (const t of [150, 550, 600, 800, 1000, 1500, 1200]) {
      await advance(page, t);
      lum.push((await artLook(page, ART_RENDER.wordPad)).moth.mean);
    }
    // nothing before the light (200ms), then more and more of the moth: 150, 700, 1300, 2100, 3100ms
    expect(lum[0], lum.join(', ')).toBe(0);
    for (let i = 1; i < 4; i++) expect(lum[i], lum.join(', ')).toBeGreaterThan((lum[i - 1] ?? 0) * 1.1);
    expect(lum[4], lum.join(', ')).toBeGreaterThanOrEqual(lum[3] ?? 0);
    // printed by ~3s: from then on only the flicker moves (a few cells at a time)
    expect(Math.abs((lum[6] ?? 0) / (lum[5] ?? 1) - 1), lum.join(', ')).toBeLessThan(0.03);

    // a bright cell climbs the ink levels before it settles: its bar grows through at least three
    // heights, the last its own (the body canvas, recorded cell by cell)
    const climbs = await page.evaluate(() => Object.values(window.__bodyBars ?? {}).filter((a) => {
      const levels = [...new Set(a)];
      return levels.length >= 3 && levels.every((v, i) => i === 0 || v > (levels[i - 1] ?? 1));
    }).length);
    expect(climbs, 'body bars that grew through 3+ ink levels').toBeGreaterThan(100);

    // the flicker: settled bars briefly drawn at another ink level, then their own again
    await page.evaluate(() => { for (const k of Object.keys(window.__bodyBars ?? {})) delete window.__bodyBars?.[k]; });
    await advance(page, 1000);
    const flickered = await page.evaluate(() => Object.values(window.__bodyBars ?? {}).filter((a) => a.length >= 2 && new Set(a).size >= 2 && a[a.length - 1] !== a[a.length - 2]).length);
    expect(flickered, 'body bars that flickered to another ink and back').toBeGreaterThan(0);
    await page.context().close();
  });
});
