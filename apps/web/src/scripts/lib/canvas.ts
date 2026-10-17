/* Small helpers shared by the canvas features (hero moth, wordmark, swarm, crew orbit). */

/** Device pixels a canvas (or a set of canvases drawn together) may use above 2x: see canvasDpr. */
export const PIXEL_BUDGET = 3_000_000;

/**
 * The pixel ratio a canvas renders at.
 *
 * Without `cssArea`: the screen's, capped at 2 to keep big canvases cheap (the swarm and the crew
 * orbit, which redraw most of themselves every frame).
 *
 * With `cssArea` (the canvas's size in css px², summed over canvases drawn together): up to 2x as
 * before, and above 2x as far as the screen's ratio and PIXEL_BUDGET device pixels allow. So a 3x
 * phone draws the hero moth and wordmark at its native 3x (they are a few hundred thousand css px²
 * there, under 1 Mpx at 3x), while a large canvas on a dense screen stays at (or near) 2x and never
 * below what the plain cap gives.
 */
export function canvasDpr(cssArea?: number): number {
  const screen = devicePixelRatio || 1;
  if (screen <= 2 || cssArea === undefined) return Math.min(screen, 2);
  const fit = cssArea > 0 ? Math.sqrt(PIXEL_BUDGET / cssArea) : screen;
  return Math.max(2, Math.min(screen, fit));
}

/** The page's font stack. Canvas text uses it so the ascii lines up with the html around it. */
export function bodyFont(): string {
  return getComputedStyle(document.body).fontFamily;
}

/** A 2d context for a canvas this script created itself, where a missing context is a bug. */
export function context2d(cv: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('no 2d canvas context');
  return ctx;
}
