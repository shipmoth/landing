import { expect, test } from '@playwright/test';
import { drawLightField, heat } from '../../src/scripts/lib/ascii-light';
import { seedRandom } from './seeded-random';

test('heat() lands exactly on each colour stop', () => {
  expect(heat(0)).toBe('rgb(70,18,8)');
  expect(heat(0.3)).toBe('rgb(170,70,25)');
  expect(heat(0.55)).toBe('rgb(245,182,58)');
  expect(heat(0.8)).toBe('rgb(255,222,150)');
  expect(heat(1)).toBe('rgb(255,248,230)');
});

test('heat() blends linearly between stops and rounds each channel', () => {
  // 0.15 is half way from 0 to 0.3: (70+170)/2, (18+70)/2, (8+25)/2 = 16.5 -> 17
  expect(heat(0.15)).toBe('rgb(120,44,17)');
  // 0.4 is 40% of the way from 0.3 to 0.55: 170+75*0.4, 70+112*0.4 = 114.8, 25+33*0.4 = 38.2
  expect(heat(0.4)).toBe('rgb(200,115,38)');
  // 0.7 is 60% of the way from 0.55 to 0.8: 245+10*0.6, 182+40*0.6, 58+92*0.6 = 113.2
  expect(heat(0.7)).toBe('rgb(251,206,113)');
  // 0.9 is half way from 0.8 to 1: 255, 222+13, 150+40
  expect(heat(0.9)).toBe('rgb(255,235,190)');
});

test('heat() is pale flame above 1', () => {
  expect(heat(1.5)).toBe('rgb(255,248,230)');
});

/** A stand-in 2d context that records where glyphs are drawn. */
function recorder(): { g: CanvasRenderingContext2D; glyphs: { ch: string; x: number; y: number; fill: unknown }[] } {
  const glyphs: { ch: string; x: number; y: number; fill: unknown }[] = [];
  const g = {
    font: '', textAlign: '', textBaseline: '', globalAlpha: 0, fillStyle: '',
    fillText(ch: string, x: number, y: number): void { glyphs.push({ ch, x, y, fill: this.fillStyle }); },
  };
  return { g: g as unknown as CanvasRenderingContext2D, glyphs };
}

/** Counts Math.random calls made by `fn` (on top of the seeded generator). */
function countRandom(fn: () => void): number {
  const seeded = Math.random;
  let calls = 0;
  Math.random = () => { calls++; return seeded(); };
  try { fn(); } finally { Math.random = seeded; }
  return calls;
}

test.describe('drawLightField', () => {
  let restoreRandom: () => void = () => {};
  test.beforeEach(() => { restoreRandom = seedRandom(99); });
  test.afterEach(() => restoreRandom());

  test('visits every cell within 1.3 radii and draws nothing outside them', () => {
    const { g, glyphs } = recorder();
    const [cx, cy, R] = [200, 150, 80];
    const draws = countRandom(() => drawLightField(g, 'Test Mono', 1.25, cx, cy, R));
    // each visited cell costs exactly one Math.random() (its sparkle), drawn or not, so this counts
    // the visited cells: every 8x13 cell whose centre is within 1.3 R, none clipped off
    let cells = 0;
    for (let r = -100; r < 100; r++) {
      for (let c = -100; c < 100; c++) if (Math.hypot(c * 8 + 4 - cx, r * 13 + 6.5 - cy) / R <= 1.3) cells++;
    }
    expect(draws).toBe(cells);
    expect(glyphs.length).toBeGreaterThan(cells / 3);
    for (const { x, y } of glyphs) expect(Math.hypot(x - cx, y - cy)).toBeLessThanOrEqual(1.3 * R);
    expect(g.font).toBe('12px Test Mono');
  });

  test('with bounds, cells off the viewport are skipped (and cost no random draws)', () => {
    const free = recorder();
    const clipped = recorder();
    const unbounded = countRandom(() => drawLightField(free.g, 'monospace', 2, 10, 10, 120, { power: 0.5 }));
    const bounded = countRandom(() => drawLightField(clipped.g, 'monospace', 2, 10, 10, 120, { power: 0.5, bounds: { width: 300, height: 200 } }));
    expect(free.glyphs.some((d) => d.x < 0 || d.y < 0)).toBe(true);
    // at half power many cells are barely lit: still a glyph, never the blank at the bottom of the ramp
    expect(free.glyphs.some((d) => d.ch === ' ')).toBe(false);
    expect(clipped.glyphs.every((d) => d.x > 0 && d.y > 0 && d.x < 300 + 8 && d.y < 200 + 13)).toBe(true);
    expect(bounded).toBeLessThan(unbounded / 2);
  });
});
