/**
 * TypeScript port of the parser in ans2js.py, the original Python converter (its output for
 * test/fixtures/sample.ans is the golden reference in the tests): reads 24-bit colour .ans text
 * (SGR 38;2;r;g;b foreground, 48;2 background ignored, 0 or empty resets) into rows and
 * per-glyph colours, then trims like ans2js: blank lines at both ends, trailing spaces on
 * every line, and the indent all lines share.
 *
 * Two deliberate differences, both for input ans2js would turn into broken or odd output:
 *   - a non-space glyph with no colour (before any SGR, or after a reset) is an error, since
 *     the compact format gives every glyph a colour (ans2js left it uncoloured);
 *   - characters outside the BMP and colour components above 255 are errors.
 */
import { encodeArt } from '../src/index.ts';
import type { CompactArt } from '../src/index.ts';

type Cell = readonly [ch: string, color: string | null];

const SGR = /\x1b\[([0-9;]*)m/g;

export interface ParsedAns {
  readonly rows: string[];
  /** Colour ("#rrggbb") of every cell, null where there was none. Same shape as rows. */
  readonly colors: (string | null)[][];
}

function component(value: string | undefined): string {
  if (value === undefined || value === '') throw new Error('ascii-art: empty colour component in SGR 38;2');
  const n = parseInt(value, 10);
  if (n > 255) throw new Error(`ascii-art: colour component ${n} is above 255`);
  return n.toString(16).padStart(2, '0');
}

function isBlank(line: readonly Cell[]): boolean {
  return line.every(([ch]) => ch === ' ');
}

function leadingSpaces(line: readonly Cell[]): number {
  let n = 0;
  while (n < line.length && line[n]?.[0] === ' ') n++;
  return n;
}

export function parseAns(src: string): ParsedAns {
  let color: string | null = null;
  let lines: Cell[][] = [[]];

  function put(text: string): void {
    for (const ch of text) {
      if (ch.length > 1) throw new Error(`ascii-art: character U+${(ch.codePointAt(0) ?? 0).toString(16)} is outside the BMP`);
      if (ch === '\n') lines.push([]);
      else if (ch !== '\r') lines[lines.length - 1]?.push([ch, color]);
    }
  }

  let pos = 0;
  for (const m of src.matchAll(SGR)) {
    put(src.slice(pos, m.index));
    pos = m.index + m[0].length;
    const p = (m[1] ?? '').split(';');
    let i = 0;
    while (i < p.length) {
      if (p[i] === '0' || p[i] === '') { color = null; i += 1; }
      else if (p[i] === '38' && i + 4 < p.length && p[i + 1] === '2') {
        color = '#' + component(p[i + 2]) + component(p[i + 3]) + component(p[i + 4]);
        i += 5;
      } else if (p[i] === '48' && i + 4 < p.length && p[i + 1] === '2') i += 5;
      else i += 1;
    }
  }
  put(src.slice(pos));

  while (lines.length && isBlank(lines[0] ?? [])) lines.shift();
  while (lines.length && isBlank(lines[lines.length - 1] ?? [])) lines.pop();
  for (const line of lines) while (line.length && line[line.length - 1]?.[0] === ' ') line.pop();
  const nonEmpty = lines.filter((line) => line.length > 0);
  if (nonEmpty.length === 0) throw new Error('ascii-art: the .ans file has no visible characters');
  const indent = Math.min(...nonEmpty.map(leadingSpaces));
  lines = lines.map((line) => line.slice(indent));

  return {
    rows: lines.map((line) => line.map(([ch]) => ch).join('')),
    colors: lines.map((line) => line.map(([, col]) => col)),
  };
}

/** .ans text -> compact JSON form. */
export function ansToCompact(src: string): CompactArt {
  const { rows, colors } = parseAns(src);
  return encodeArt(rows, (r, c) => colors[r]?.[c] ?? undefined);
}
