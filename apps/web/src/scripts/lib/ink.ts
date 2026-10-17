/* How the hero moth and the wordmark draw an art cell: as its glyph, or, when a cell is too small
   on screen for a glyph's shape to survive, as a bar of light as dense as the glyph.

   The art is written in the characters of a density ramp (RAMP, sparse to dense). Drawn with
   fillText, a glyph needs a few device pixels to keep its shape; below that, antialiasing smears
   it into a faint smudge and the art goes dull (a phone draws the moth at ~2 device px per cell).
   So under BLOCK_BELOW device px per column a cell is drawn as a bar: opaque, in the cell's own
   colour, the cell's full width, centred in it, and as tall as the share of the cell the glyph
   would ink: ink(glyph) (0 for a blank, 1 for the densest glyph) times BLOCK_COVER. Rows of bars
   give the scanline texture the rows of glyphs have, and where a bar fills a pixel row that row
   shows the art's real colour (a translucent wash over the whole cell, tried first, was as bright
   on average but never reached it: flat and muddy). Animations that step a cell through the ramp
   (the moth's entrance burn and flicker) step the bar's height instead.

   Kept DOM-free (no canvas here), so the unit tests can check the curve. */

/** The density ramp the art is written in, sparse to dense. RAMP[0] is the blank. */
export const RAMP = " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";

/**
 * Cells narrower than this many device pixels are drawn as bars, wider ones as glyphs.
 * Between the two sizes it must separate: the desktop moth at 1280px and up (a 1100px column /
 * 314 columns = 3.50 device px at 1x) keeps its glyphs, while a 390px phone at 3x (1.11 css px x 3
 * = 3.34) gets bars. At 3.4 device px a glyph is 3 pixels wide and 6 tall: too few to tell `c`
 * from `z` or `0` from `O`, so the ramp reads as texture either way, and bars keep its density
 * exactly instead of losing it to antialiasing.
 */
export const BLOCK_BELOW = 3.4;

/**
 * Ink curve: ink = (ramp position)^INK_GAMMA. Glyph coverage is not linear in ramp position: even
 * the sparse glyphs are a pixel-wide stroke, so the light end of the ramp carries more ink than its
 * position says. Measured over the ramp in the page's monospace font (Chromium), the best power fit
 * of coverage against position is 0.5 at the desktop moth's 3.5px cells and 0.4 at the desktop
 * wordmark's 1.5px cells; 0.45 sits between them.
 */
export const INK_GAMMA = 0.45;

/**
 * Height of the bar for the densest glyph, as a share of its cell: the share of the cell that
 * glyph's ink covers. Chosen so a bar render is as bright on average (alpha-weighted luminance
 * per pixel) as the desktop glyph render: within ~6% for both the moth (against its 1280px glyph
 * render) and the wordmark (against its glyph render before bars existed).
 */
export const BLOCK_COVER = 0.306;

const LAST = RAMP.length - 1;

/** Ink weight of a ramp position, 0 (blank) .. 1 (densest). Out-of-range positions are clamped. */
export function inkAt(index: number): number {
  if (!(index > 0)) return 0;
  return Math.pow(Math.min(index, LAST) / LAST, INK_GAMMA);
}

/** Ink weight of a glyph: from its place on RAMP. A glyph not on the ramp counts as the densest. */
export function ink(glyph: string): number {
  if (glyph === '' || glyph === ' ') return 0;
  const i = RAMP.indexOf(glyph);
  return inkAt(i < 0 ? LAST : i);
}

/** Share of its cell the bar that stands in for a glyph covers (its height / the cell's). */
export function blockCover(glyph: string): number {
  return ink(glyph) * BLOCK_COVER;
}

/** The bar in a cell spanning [y0, y1) (css px, on whole device pixels): [top, height], centred.
 *  Its edges usually fall inside a pixel row; the canvas antialiases that partial row. */
export function bar(y0: number, y1: number, cover: number): [number, number] {
  const h = (y1 - y0) * cover;
  return [y0 + (y1 - y0 - h) / 2, h];
}

/** Whether cells `cellWidth` css px wide, drawn at `dpr` device px per css px, are drawn as bars. */
export function drawsBlocks(cellWidth: number, dpr: number): boolean {
  return cellWidth * dpr < BLOCK_BELOW;
}

/** A position in css px rounded to the nearest device pixel. A block drawn from snap(x0) to snap(x1)
 *  covers whole pixels: neighbours that share an edge round it to the same pixel, so blocks tile
 *  without seams or overlaps, and redrawing one block (clear, then fill) leaves its neighbours alone. */
export function snap(v: number, dpr: number): number {
  return Math.round(v * dpr) / dpr;
}
