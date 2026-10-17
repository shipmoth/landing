/** Reading what canvases actually drew, straight from their bitmaps. */
import type { Locator, Page } from '@playwright/test';

export interface InkOptions {
  /** region in CSS pixels relative to the canvas's top-left corner; default the whole canvas */
  region?: { x: number; y: number; width: number; height: number };
  /** count only pixels at least this opaque (0..255). default 1, i.e. anything drawn */
  minAlpha?: number;
}

/** number of drawn (non-transparent) pixels in a canvas */
export async function ink(canvas: Locator, opts: InkOptions = {}): Promise<number> {
  return canvas.evaluate((el, { region, minAlpha }) => {
    if (!(el instanceof HTMLCanvasElement)) throw new Error('not a canvas');
    const ctx = el.getContext('2d');
    if (!ctx || el.width === 0 || el.height === 0) return 0;
    const sx = el.width / (el.clientWidth || el.width);
    const sy = el.height / (el.clientHeight || el.height);
    const r = region ?? { x: 0, y: 0, width: el.clientWidth || el.width, height: el.clientHeight || el.height };
    const x0 = Math.max(0, Math.floor(r.x * sx));
    const y0 = Math.max(0, Math.floor(r.y * sy));
    const x1 = Math.min(el.width, Math.ceil((r.x + r.width) * sx));
    const y1 = Math.min(el.height, Math.ceil((r.y + r.height) * sy));
    if (x1 <= x0 || y1 <= y0) return 0;
    const data = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let n = 0;
    for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 0) >= minAlpha) n++;
    return n;
  }, { region: opts.region, minAlpha: opts.minAlpha ?? 1 });
}

/** a short fingerprint of a canvas bitmap, to tell whether two drawings are identical */
export async function fingerprint(canvas: Locator): Promise<string> {
  return canvas.evaluate((el) => {
    if (!(el instanceof HTMLCanvasElement)) throw new Error('not a canvas');
    const ctx = el.getContext('2d');
    if (!ctx || el.width === 0 || el.height === 0) return `${el.width}x${el.height}:empty`;
    const data = ctx.getImageData(0, 0, el.width, el.height).data;
    let h = 0x811c9dc5;
    for (let i = 0; i < data.length; i++) h = Math.imul(h ^ (data[i] ?? 0), 0x01000193);
    return `${el.width}x${el.height}:${(h >>> 0).toString(16)}`;
  });
}

/** the swarm light draws fully opaque glyphs; moths never exceed alpha ~0.8 until lit */
export async function lightAround(page: Page, x: number, y: number, radius = 120): Promise<number> {
  return ink(page.locator('#swarm'), {
    region: { x: x - radius, y: y - radius, width: radius * 2, height: radius * 2 },
    minAlpha: 255,
  });
}

/** fully opaque pixels anywhere on the swarm. With the lamp off, the only thing the swarm draws at
 *  full opacity is the idle moth on its way to a word (wanderers are at most ~0.8 alpha), so this is
 *  the moment the idle moth sets off. */
export async function idleMothFlying(page: Page): Promise<boolean> {
  return (await ink(page.locator('#swarm'), { minAlpha: 255 })) > 0;
}

/** How the home page's ascii art looks, by numbers, for one piece of art (see artLuminance). */
export interface ArtLook {
  /** alpha-weighted mean luminance per pixel of canvas: sum of alpha x Rec.709 luminance (both 0..1)
   *  over the pixel count. Pixel-count normalised, so it compares across sizes and pixel ratios */
  mean: number;
  /** 95th percentile of the luminance shown (alpha x luminance) over the inked pixels (alpha >= 16):
   *  how bright the highlights get */
  p95: number;
  /** share of all pixels shown brighter than 0.25 */
  bright: number;
  /** mean chroma shown (alpha x (max - min of r, g, b), 0..1) over the inked pixels */
  chroma: number;
}

/**
 * How the home page's ascii art looks: `moth` is the three hero canvases together, `word` the
 * wordmark without its transparent `pad` (css px) a side.
 */
export async function artLook(page: Page, pad: number): Promise<{ moth: ArtLook; word: ArtLook }> {
  return page.evaluate((padCss) => {
    function pixels(cv: HTMLCanvasElement, inset: number): Uint8ClampedArray[] {
      const ctx = cv.getContext('2d');
      if (!ctx || cv.width === 0 || cv.height === 0) return [];
      const p = Math.round(inset * (cv.width / (cv.clientWidth || cv.width)));
      const [w, h] = [cv.width - 2 * p, cv.height - 2 * p];
      return w > 0 && h > 0 ? [ctx.getImageData(p, p, w, h).data] : [];
    }
    function look(all: Uint8ClampedArray[]) {
      let n = 0, sum = 0, bright = 0, chroma = 0;
      const inked: number[] = [];
      for (const d of all) {
        n += d.length / 4;
        for (let i = 0; i < d.length; i += 4) {
          const [r, g, b, a] = [d[i] ?? 0, d[i + 1] ?? 0, d[i + 2] ?? 0, d[i + 3] ?? 0];
          if (!a) continue;
          const y = (a / 255) * (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
          sum += y;
          if (y > 0.25) bright++;
          if (a >= 16) {
            inked.push(y);
            chroma += (a / 255) * (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
          }
        }
      }
      inked.sort((x, y) => x - y);
      return { mean: n ? sum / n : 0, p95: inked[Math.floor(inked.length * 0.95)] ?? 0, bright: n ? bright / n : 0, chroma: inked.length ? chroma / inked.length : 0 };
    }
    const moth = [...document.querySelectorAll<HTMLCanvasElement>('#orbit canvas')].flatMap((cv) => pixels(cv, 0));
    const wordCv = document.querySelector<HTMLCanvasElement>('.title canvas.word');
    return { moth: look(moth), word: look(wordCv ? pixels(wordCv, padCss) : []) };
  }, pad);
}
