/* Small helpers shared by the canvas features (hero moth, wordmark, swarm, crew orbit). */

/** The pixel ratio every canvas renders at: the screen's, capped at 2 to keep big canvases cheap. */
export function canvasDpr(): number {
  return Math.min(devicePixelRatio || 1, 2);
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
