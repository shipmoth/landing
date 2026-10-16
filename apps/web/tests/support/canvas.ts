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
