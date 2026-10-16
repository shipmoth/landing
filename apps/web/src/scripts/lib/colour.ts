/** Anything with 0..255 red, green and blue channels (the art's palette colours fit). */
export interface RgbLike {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

function mix(from: number, to: number, k: number): number {
  return Math.round(from + (to - from) * k);
}

/** The colour `k` (0..1) of the way from `from` to `to`, as a canvas/CSS `rgb(r,g,b)` string. */
export function mixRgb(from: RgbLike, to: RgbLike, k: number): string {
  return 'rgb(' + mix(from.r, to.r, k) + ',' + mix(from.g, to.g, k) + ',' + mix(from.b, to.b, k) + ')';
}
