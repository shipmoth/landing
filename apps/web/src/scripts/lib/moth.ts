/** The moth's wingbeat, one frame per step: wings out, half, up, half. Used wherever a small moth flies. */
export const MOTH_FRAMES = ['}o{', ')o(', '|o|', ')o('] as const;

/**
 * The frame at `index`, or the first frame when `index` is out of range.
 *
 * The first animation frame's timestamp can be earlier than the `performance.now()` taken at init,
 * so a phase can briefly go negative. The swarm's `(phase * 4) | 0` and the crew orbit's
 * `Math.floor(phase) % 4` then give -1..-3, and indexing MOTH_FRAMES with that would draw the text
 * "undefined" for a frame (tests/e2e/canvas-glyphs.spec.ts). Every in-range index (including -0,
 * which is index 0) returns its own frame. The idea line's stamp moth indexes MOTH_FRAMES directly
 * with `Date.now()`, which is never negative.
 */
export function mothFrame(index: number): string {
  return MOTH_FRAMES[index] ?? MOTH_FRAMES[0];
}
