/**
 * Compact storage format for 24-bit colour ASCII art (the JSON in src/data).
 *
 *   rows     the text of each line, trailing spaces trimmed. Spaces are uncoloured;
 *            every other character has exactly one colour.
 *   palette  the distinct colours, concatenated 6-digit lowercase hex ("250407a8c0ff…").
 *            The encoder orders it by luminance so neighbouring glyphs get nearby indices.
 *   colors   one code per non-space glyph, in reading order, from the base64url alphabet:
 *              A..-  (0..62)  zigzag delta from the previous glyph's palette index
 *                             (0 same, 1 -1, 2 +1, 3 -2, …)
 *              _     (63)     escape: the next two symbols are the absolute index, high digit first
 *            The index before the first glyph counts as 0.
 *
 * Compared with one `<i style="color:#…">` HTML span per colour run (what the original
 * ans2js.py converter wrote) this is ~8x smaller raw and ~25-35% smaller gzipped/brotlied, and
 * it decodes without an HTML parser.
 */
export interface CompactArt {
  /** Format version, currently 1. */
  readonly v: number;
  readonly w: number;
  readonly h: number;
  readonly rows: readonly string[];
  readonly palette: string;
  readonly colors: string;
}

export const FORMAT_VERSION = 1;

/** A palette colour. `hex` is "#rrggbb", ready for canvas fillStyle or CSS. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly hex: string;
}

/** Decoded art: a w x h grid of glyphs, each non-space glyph with a palette colour. */
export interface Art {
  readonly w: number;
  readonly h: number;
  /** Text of each row; a row may be shorter than w (the rest is blank). */
  readonly rows: readonly string[];
  readonly palette: readonly Rgb[];
  /** Palette index of every cell, row-major (r * w + c); NO_COLOR for blank cells. */
  readonly color: Uint16Array;
}

/** Perceived brightness of a colour, 0..255 (Rec. 709 weights). */
export function luminance(rgb: { readonly r: number; readonly g: number; readonly b: number }): number {
  return 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
}

/** Marks a blank (space or past-the-end) cell in Art.color. */
export const NO_COLOR = 0xffff;

/** base64url digits used by the `colors` stream. */
const DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
/** Digit value that introduces an absolute two-digit index. */
const ESCAPE = 63;
/** Largest palette an encoding can address (two base64 digits). */
const MAX_PALETTE = 64 * 64;

/* ---------- decoding ---------- */

const SPACE = 32;

/** Char code -> digit value, -1 for characters outside the alphabet. */
const DIGIT_VALUE = new Int8Array(128).fill(-1);
for (let i = 0; i < DIGITS.length; i++) DIGIT_VALUE[DIGITS.charCodeAt(i)] = i;

const HEX_PALETTE = /^(?:[0-9a-f]{6})*$/;

function fail(message: string): never {
  throw new Error(`ascii-art: ${message}`);
}

function digitAt(colors: string, k: number): number {
  const code = colors.charCodeAt(k);
  const value = code < 128 ? (DIGIT_VALUE[code] ?? -1) : -1;
  if (value < 0) fail(k < colors.length ? `bad colour code at ${k}` : 'colour stream ended early');
  return value;
}

/** "rrggbb" -> its channels. */
function rgbOf(hex6: string): Rgb {
  const n = parseInt(hex6, 16);
  return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, hex: '#' + hex6 };
}

function parsePalette(palette: string): Rgb[] {
  if (!HEX_PALETTE.test(palette)) fail('palette must be concatenated 6-digit lowercase hex');
  const out: Rgb[] = [];
  for (let i = 0; i < palette.length; i += 6) out.push(rgbOf(palette.slice(i, i + 6)));
  return out;
}

/** Decodes the compact JSON form. Throws on malformed input. Pure: no DOM needed. */
export function decodeArt(data: CompactArt): Art {
  const { w, h, rows, colors } = data;
  if (data.v !== FORMAT_VERSION) fail(`unsupported format version ${String(data.v)}`);
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 0 || h < 0) fail('w and h must be non-negative integers');
  if (rows.length !== h) fail(`expected ${h} rows, got ${rows.length}`);
  const palette = parsePalette(data.palette);
  const color = new Uint16Array(w * h).fill(NO_COLOR);

  let k = 0;
  let prev = 0;
  for (let r = 0; r < h; r++) {
    const row = rows[r] ?? '';
    if (row.length > w) fail(`row ${r} is wider than ${w}`);
    for (let c = 0; c < row.length; c++) {
      if (row.charCodeAt(c) === SPACE) continue;
      const z = digitAt(colors, k++);
      let index: number;
      if (z === ESCAPE) {
        index = digitAt(colors, k) * 64 + digitAt(colors, k + 1);
        k += 2;
      } else {
        index = prev + ((z >>> 1) ^ -(z & 1));       // undo zigzag
      }
      if (index < 0 || index >= palette.length) fail(`palette index ${index} out of range at row ${r}, column ${c}`);
      color[r * w + c] = index;
      prev = index;
    }
  }
  if (k !== colors.length) fail(`${colors.length - k} unused colour codes`);
  return { w, h, rows, palette, color };
}

/** The glyph at (r, c); ' ' for blank or out-of-range cells. */
export function glyphAt(art: Art, r: number, c: number): string {
  return art.rows[r]?.[c] ?? ' ';
}

/** The colour of the glyph at (r, c); undefined for blank or out-of-range cells. */
export function colorAt(art: Art, r: number, c: number): Rgb | undefined {
  if (r < 0 || r >= art.h || c < 0 || c >= art.w) return undefined;
  const index = art.color[r * art.w + c] ?? NO_COLOR;
  return index === NO_COLOR ? undefined : art.palette[index];
}

/* ---------- encoding ---------- */

const HEX = /^#?([0-9a-fA-F]{6})$/;

/** Returns the "#rrggbb" / "rrggbb" colour of the non-space glyph at (r, c). */
export type ColorOf = (r: number, c: number) => string | undefined;

/**
 * Encodes rows of text plus a colour per non-space glyph into the compact form
 * (described at the top of this file). w is the longest row. Throws if a glyph has no colour.
 */
export function encodeArt(rows: readonly string[], colorOf: ColorOf): CompactArt {
  const glyphColors: string[] = [];
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] === ' ') continue;
      const match = HEX.exec(colorOf(r, c) ?? '');
      if (!match?.[1]) throw new Error(`ascii-art: glyph ${JSON.stringify(row[c])} at row ${r}, column ${c} has no colour`);
      glyphColors.push(match[1].toLowerCase());
    }
  });

  const brightness = (hex: string): number => luminance(rgbOf(hex));
  const palette = [...new Set(glyphColors)].sort((a, b) => brightness(a) - brightness(b) || (a < b ? -1 : 1));
  if (palette.length > MAX_PALETTE) throw new Error(`ascii-art: ${palette.length} colours, at most ${MAX_PALETTE} fit`);
  const indexOf = new Map(palette.map((hex, i) => [hex, i]));

  let colors = '';
  let prev = 0;
  for (const hex of glyphColors) {
    const index = indexOf.get(hex) ?? 0;
    const delta = index - prev;
    const z = delta >= 0 ? delta * 2 : -delta * 2 - 1;
    colors += z < ESCAPE ? DIGITS.charAt(z) : DIGITS.charAt(ESCAPE) + DIGITS.charAt(index >> 6) + DIGITS.charAt(index & 63);
    prev = index;
  }

  return {
    v: FORMAT_VERSION,
    w: rows.reduce((max, row) => Math.max(max, row.length), 0),
    h: rows.length,
    rows: [...rows],
    palette: palette.join(''),
    colors,
  };
}
