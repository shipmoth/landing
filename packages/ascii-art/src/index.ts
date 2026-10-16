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

/* ---------- terminal rendering ---------- */

/**
 * How renderArtForTerminal draws the art.
 *
 *   width    the most columns a line may take (escape codes excluded); the art is scaled down to
 *            min(width, its own width) columns and never up
 *   mode     'glyphs': one ascii glyph per cell, picked from the site's density ramp by how much
 *            ink its block of the source holds. 'blocks': half-block pixels (U+2580 / U+2584 /
 *            U+2588), two pixels per cell, one above the other.
 *   colours  256: the nearest xterm-256 colour (see nearestXterm256). 'truecolor': 24-bit SGR
 *            (38;2 / 48;2).
 */
export interface TerminalOptions {
  readonly width: number;
  readonly mode: 'glyphs' | 'blocks';
  readonly colours: 256 | 'truecolor';
}

/** A source row is this many columns tall: the site draws rows at 1.05 em, columns ~0.6 em apart. */
const SOURCE_ASPECT = 1.75;
/** A terminal cell is about this many columns tall (Cascadia Mono, Consolas, Menlo… at their usual line height). */
const TERMINAL_ASPECT = 2;

/** The site's density ramp (hero-moth.ts), thinnest to inkiest; also the glyphs 'glyphs' mode draws. */
const INK_RAMP = " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
/** Ink of a glyph that is not on the ramp. */
const UNKNOWN_INK = 0.5;

/** A glyph cell whose block holds less ink than this (1 = a block full of '$') is left blank. */
const GLYPH_MIN_INK = 0.12;
/** A pixel holding less ink than this is left blank (the terminal's own background shows). */
const PIXEL_MIN_INK = 0.08;
/** A pixel this dark after shading (Rec. 709 luminance, 0..255) is left blank too. */
const PIXEL_MIN_LUMINANCE = 6;

const UPPER_HALF = '▀';
const LOWER_HALF = '▄';
const FULL_BLOCK = '█';

/** sRGB channel (0..255) -> linear light (0..1). */
const LINEAR = Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

/** Linear light -> sRGB channel, rounded and clamped. */
function srgb(linear: number): number {
  const c = linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
}

type Triple = readonly [number, number, number];

/** sRGB 0..255 -> OKLab (Björn Ottosson's matrices). */
function oklab(r: number, g: number, b: number): Triple {
  const R = LINEAR[r] ?? 0, G = LINEAR[g] ?? 0, B = LINEAR[b] ?? 0;
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** The levels of each channel in the xterm 6x6x6 colour cube (indices 16..231). */
const CUBE_LEVELS = [0, 95, 135, 175, 215, 255] as const;

/** sRGB of xterm-256 colour `index`, 16..255: the cube, then the greys 8, 18, …, 238 (232..255). */
export function xterm256Rgb(index: number): Triple {
  if (!Number.isInteger(index) || index < 16 || index > 255) throw new RangeError(`ascii-art: no fixed xterm colour ${index}`);
  if (index >= 232) {
    const v = 8 + 10 * (index - 232);
    return [v, v, v];
  }
  const k = index - 16;
  return [CUBE_LEVELS[Math.floor(k / 36)] ?? 0, CUBE_LEVELS[Math.floor(k / 6) % 6] ?? 0, CUBE_LEVELS[k % 6] ?? 0];
}

let xtermLab: Triple[] | undefined;
/** Chroma (a, b) counts this much more than lightness: the cube is coarse in the darks, and a dark red that stays red reads better than a grey. */
const CHROMA_WEIGHT = 2;

/**
 * The xterm-256 colour nearest to an sRGB colour: the smallest Euclidean distance in OKLab (a
 * simple, perceptually even space) among the cube (16..231) and the grey ramp (232..255); the
 * lower index on a tie. The 16 system colours (0..15) are left out: terminals theme them, so they
 * would not show the colour asked for.
 */
export function nearestXterm256(r: number, g: number, b: number): number {
  const table = (xtermLab ??= Array.from({ length: 240 }, (_, i) => oklab(...xterm256Rgb(16 + i))));
  const [L, A, B] = oklab(r, g, b);
  let best = 0, bestDistance = Infinity;
  table.forEach(([l, a, bb], i) => {
    const d = (L - l) ** 2 + CHROMA_WEIGHT * ((A - a) ** 2 + (B - bb) ** 2);
    if (d < bestDistance) { bestDistance = d; best = i; }
  });
  return 16 + best;
}

/** CSI … final byte (so SGR and every other control sequence) and OSC … BEL / ST. */
const ANSI_SEQUENCE = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

/** The text of `s` without its ANSI escape sequences (CSI, which includes SGR, and OSC). */
export function stripAnsi(s: string): string {
  return s.replace(ANSI_SEQUENCE, '');
}

/**
 * Columns `s` takes in a terminal: its code points once escape sequences are stripped. Every
 * glyph renderArtForTerminal emits is one column wide; wide (CJK, emoji) and combining
 * characters are not accounted for.
 */
export function visibleWidth(s: string): number {
  let n = 0;
  for (const _ of stripAnsi(s)) n++;
  return n;
}

/** What one block of the source holds. */
interface Block {
  /** Ink per unit of area: 1 = the block is all '$'. */
  readonly ink: number;
  /** Ink-weighted mean colour in linear light; undefined when the block holds no ink. */
  readonly linear: Triple | undefined;
}

/** Area sampling of an art: per-cell ink and linear colour, and the box around its glyphs. */
function sampler(art: Art) {
  const { w, h } = art;
  const ink = new Float64Array(w * h);
  const linear = new Float64Array(w * h * 3);
  let top = h, bottom = 0, left = w, right = 0;
  for (let r = 0; r < h; r++) {
    const row = art.rows[r] ?? '';
    for (let c = 0; c < row.length; c++) {
      const rgb = art.palette[art.color[r * w + c] ?? NO_COLOR];
      if (!rgb) continue;
      const id = r * w + c, at = INK_RAMP.indexOf(row.charAt(c));
      ink[id] = at < 0 ? UNKNOWN_INK : at / (INK_RAMP.length - 1);
      linear[id * 3] = LINEAR[rgb.r] ?? 0;
      linear[id * 3 + 1] = LINEAR[rgb.g] ?? 0;
      linear[id * 3 + 2] = LINEAR[rgb.b] ?? 0;
      top = Math.min(top, r);
      bottom = Math.max(bottom, r + 1);
      left = Math.min(left, c);
      right = Math.max(right, c + 1);
    }
  }
  /** The source box [x0, x1) x [y0, y1) in cells; partly covered cells count by their overlap. */
  const block = (x0: number, x1: number, y0: number, y1: number): Block => {
    let sum = 0, r = 0, g = 0, b = 0;
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
      const dy = Math.min(y1, y + 1) - Math.max(y0, y);
      for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
        const id = y * w + x, d = ink[id] ?? 0;
        if (d === 0) continue;
        const weight = dy * (Math.min(x1, x + 1) - Math.max(x0, x)) * d;
        sum += weight;
        r += weight * (linear[id * 3] ?? 0);
        g += weight * (linear[id * 3 + 1] ?? 0);
        b += weight * (linear[id * 3 + 2] ?? 0);
      }
    }
    return { ink: sum / ((x1 - x0) * (y1 - y0)), linear: sum > 0 ? [r / sum, g / sum, b / sum] : undefined };
  };
  return { top, bottom, left, right, block };
}

/** One output cell. fg / bg: the SGR colour after 38 / 48 ("5;n" or "2;r;g;b"), '' for the default. */
interface TermCell {
  readonly ch: string;
  readonly fg: string;
  readonly bg: string;
}

const BLANK: TermCell = { ch: ' ', fg: '', bg: '' };

/** Cells -> a line: the fewest SGR changes, trailing blanks dropped, a reset at the end if it set a colour. */
function writeLine(cells: readonly TermCell[]): string {
  let end = cells.length;
  while (end > 0 && cells[end - 1]?.ch === ' ' && cells[end - 1]?.bg === '') end--;
  let out = '', fg = '', bg = '', coloured = false;
  for (let i = 0; i < end; i++) {
    const cell = cells[i] ?? BLANK;
    const wantFg = cell.ch === ' ' ? fg : cell.fg;           // a space shows no foreground
    const params: string[] = [];
    if (wantFg !== fg) params.push(wantFg === '' ? '39' : '38;' + wantFg);
    if (cell.bg !== bg) params.push(cell.bg === '' ? '49' : '48;' + cell.bg);
    if (params.length > 0) {
      out += `\x1b[${params.join(';')}m`;
      coloured = true;
    }
    fg = wantFg;
    bg = cell.bg;
    out += cell.ch;
  }
  return coloured ? out + '\x1b[0m' : out;
}

/**
 * Draws an art for a terminal: lines of text with SGR colour codes, each at most
 * `options.width` columns wide (see TerminalOptions). The art is cropped to its glyphs and scaled
 * down keeping its proportions (a source row is SOURCE_ASPECT columns tall, a terminal row
 * TERMINAL_ASPECT, a half-block pixel half that). Each output cell or pixel area-samples its block
 * of the source: its ink is the glyphs' density on the site's ramp, its colour the ink-weighted
 * mean in linear light, shaded by that ink (a block half full of '$' shows at half the light), so
 * thin edges fade as they do on the site.
 *
 * Lines have no trailing blanks; a line that sets a colour ends with a reset (ESC[0m); only SGR
 * sequences are emitted; empty cells and pixels keep the terminal's own background; blank lines
 * at the top and bottom are dropped. Lines start at the art's left edge: to centre the art, pad
 * every line with the same number of spaces. Pure and deterministic.
 */
export function renderArtForTerminal(art: Art, options: TerminalOptions): string[] {
  const { width, mode, colours } = options;
  if (!Number.isInteger(width) || width < 1) throw new RangeError(`ascii-art: width must be a positive integer, got ${width}`);
  if (mode !== 'glyphs' && mode !== 'blocks') throw new RangeError(`ascii-art: unknown mode ${String(mode)}`);
  if (colours !== 256 && colours !== 'truecolor') throw new RangeError(`ascii-art: unknown colours ${String(colours)}`);

  const source = sampler(art);
  if (source.bottom <= source.top) return [];
  const artW = source.right - source.left, artH = source.bottom - source.top;
  const cols = Math.min(width, artW);
  const sx = artW / cols;                                      // source columns per output column
  const stacked = mode === 'blocks' ? 2 : 1;                   // samples per terminal row
  const samples = Math.max(1, Math.round((artH * SOURCE_ASPECT * stacked) / (sx * TERMINAL_ASPECT)));
  const sy = artH / samples;                                   // source rows per sample

  const grid: Block[][] = [];
  let maxInk = 0;
  for (let y = 0; y < samples; y++) {
    const line: Block[] = [];
    for (let x = 0; x < cols; x++) {
      const b = source.block(source.left + x * sx, source.left + (x + 1) * sx, source.top + y * sy, source.top + (y + 1) * sy);
      maxInk = Math.max(maxInk, b.ink);
      line.push(b);
    }
    grid.push(line);
  }

  const codes = new Map<number, string>();
  /** A block's colour shaded by its ink: its SGR colour and its luminance. */
  const shade = (b: Block): { readonly code: string; readonly luminance: number } | undefined => {
    if (!b.linear) return undefined;
    const k = Math.min(1, b.ink);
    const r = srgb(b.linear[0] * k), g = srgb(b.linear[1] * k), bl = srgb(b.linear[2] * k);
    const key = (r << 16) | (g << 8) | bl;
    let code = codes.get(key);
    if (code === undefined) {
      code = colours === 'truecolor' ? `2;${r};${g};${bl}` : `5;${nearestXterm256(r, g, bl)}`;
      codes.set(key, code);
    }
    return { code, luminance: luminance({ r, g, b: bl }) };
  };

  const lines: string[] = [];
  if (mode === 'glyphs') {
    const last = INK_RAMP.length - 1;
    for (const row of grid) {
      lines.push(writeLine(row.map((b): TermCell => {
        const colour = b.ink >= GLYPH_MIN_INK ? shade(b) : undefined;
        if (!colour) return BLANK;
        // the inkiest block of the art gets '$'; the rest climb the ramp in proportion
        return { ch: INK_RAMP.charAt(Math.max(1, Math.round((b.ink / maxInk) * last))), fg: colour.code, bg: '' };
      })));
    }
  } else {
    const pixel = (b: Block | undefined): string => {
      if (!b || b.ink < PIXEL_MIN_INK) return '';
      const colour = shade(b);
      return colour && colour.luminance >= PIXEL_MIN_LUMINANCE ? colour.code : '';
    };
    for (let y = 0; y < samples; y += 2) {
      const upper = grid[y] ?? [], lower = grid[y + 1];
      let fg = '', bg = '';                                    // what the line has set so far
      const cells = upper.map((b, x): TermCell => {
        const top = pixel(b), bottom = pixel(lower?.[x]);
        let cell: TermCell;
        if (!top && !bottom) cell = BLANK;
        else if (!bottom) cell = { ch: UPPER_HALF, fg: top, bg: '' };
        else if (!top) cell = { ch: LOWER_HALF, fg: bottom, bg: '' };
        else if (top === bottom) cell = { ch: FULL_BLOCK, fg: top, bg };   // any background: it is covered
        else {
          // two colours: the upper half over the lower or the lower over the upper, whichever
          // changes fewer of the colours already set
          const changes = (f: string, k: string): number => (f === fg ? 0 : 1) + (k === bg ? 0 : 1);
          cell = changes(bottom, top) < changes(top, bottom)
            ? { ch: LOWER_HALF, fg: bottom, bg: top }
            : { ch: UPPER_HALF, fg: top, bg: bottom };
        }
        if (cell.ch !== ' ') fg = cell.fg;
        bg = cell.bg;
        return cell;
      });
      lines.push(writeLine(cells));
    }
  }
  while (lines.length > 0 && lines[0] === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}
