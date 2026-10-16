/* The ascii light: a glowing, swirling blob of characters. Shared by the swarm (a lamp that
   blooms wherever you press) and the about page's crew canvas (a fixed lamp the moths circle). */

import { mixRgb } from './colour';
import type { RgbLike } from './colour';

export interface Size {
  width: number;
  height: number;
}

export interface LightFieldOptions {
  /** 0..1 strength of the lamp: dims the glow and shrinks the hot core. 1 (the default) is full. */
  power?: number;
  /** Viewport size. When given, only cells inside it are visited (the cell range is clamped). */
  bounds?: Size;
}

const CELL_W = 8;
const CELL_H = 13;
const RAMP = ' .·:;~+*oO0@';

/** The heat scale: brightness `at` (0..1) maps to colour `rgb`, linearly in between. */
interface HeatStop {
  at: number;
  rgb: RgbLike;
}

const STOPS: readonly HeatStop[] = [
  { at: 0, rgb: { r: 70, g: 18, b: 8 } },
  { at: 0.3, rgb: { r: 170, g: 70, b: 25 } },
  { at: 0.55, rgb: { r: 245, g: 182, b: 58 } },
  { at: 0.8, rgb: { r: 255, g: 222, b: 150 } },
  { at: 1, rgb: { r: 255, g: 248, b: 230 } },
];

/** Maps a brightness (0..1) to an `rgb(r,g,b)` colour, dark ember to pale flame. */
export function heat(v: number): string {
  for (let i = 1; i < STOPS.length; i++) {
    const a = STOPS[i - 1];
    const b = STOPS[i];
    if (a && b && v <= b.at) return mixRgb(a.rgb, b.rgb, (v - a.at) / (b.at - a.at));
  }
  return 'rgb(255,248,230)';
}

/** The grid columns/rows a light of radius `radius` can touch, clamped to `0..extent` when given. */
function cellRange(centre: number, radius: number, cell: number, extent: number | undefined): [number, number] {
  let first = Math.floor((centre - radius * 1.3) / cell);
  let last = Math.ceil((centre + radius * 1.3) / cell);
  if (extent !== undefined) {
    first = Math.max(0, first);
    last = Math.min(Math.ceil(extent / cell), last);
  }
  return [first, last];
}

/** Brightness (roughly 0..1) of one cell. `d` is the distance from the centre in radii, `th` its angle. */
function cellBrightness(x: number, y: number, d: number, th: number, t: number, power: number): number {
  // domain-warped swirl: the field flows and curls around the centre
  const wx = x * 0.018 + Math.sin(y * 0.021 + t * 0.9) * 1.4;
  const wy = y * 0.018 + Math.sin(x * 0.017 - t * 0.7) * 1.4;
  const n = Math.sin(wx + t * 1.3) * 0.5 + Math.sin(wy - t * 1.1) * 0.5; // -1..1
  const rays = Math.sin(th * 5 + t * 0.8 + d * 4) * 0.5 + 0.5; // soft rotating rays
  const edge = d * (1 + n * 0.22 - rays * 0.12);
  let v = Math.pow(Math.max(0, 1 - edge), 1.5) * (0.85 + 0.15 * n) * (0.6 + 0.4 * power);
  v += Math.exp(-d * d * 9) * 0.55 * power; // hot core
  v += (Math.random() - 0.5) * 0.04; // sparkle
  return v;
}

/**
 * Draws the light centred on (cx, cy) with radius `R` at time `t` (seconds).
 * With the default power of 1 the formulas reduce exactly to the unscaled field
 * (x * 1 is exact, and 0.6 + 0.4 * 1 is exactly 1).
 */
export function drawLightField(
  g: CanvasRenderingContext2D,
  fontFamily: string,
  t: number,
  cx: number,
  cy: number,
  R: number,
  { power = 1, bounds }: LightFieldOptions = {},
): void {
  const [c0, c1] = cellRange(cx, R, CELL_W, bounds?.width);
  const [r0, r1] = cellRange(cy, R, CELL_H, bounds?.height);
  g.font = '12px ' + fontFamily;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.globalAlpha = 1;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const x = c * CELL_W + CELL_W / 2;
      const y = r * CELL_H + CELL_H / 2;
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy) / R;
      if (d > 1.3) continue;
      const v = cellBrightness(x, y, d, Math.atan2(dy, dx), t, power);
      if (v < 0.04) continue;
      g.fillStyle = heat(Math.min(1, v * 1.15));
      g.fillText(RAMP[Math.min(RAMP.length - 1, Math.max(1, Math.round(v * (RAMP.length - 1))))] ?? ' ', x, y);
    }
  }
}
