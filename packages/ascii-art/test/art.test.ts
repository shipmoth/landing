import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { colorAt, decodeArt, encodeArt, glyphAt, NO_COLOR } from '../src/index.ts';
import type { Art, CompactArt } from '../src/index.ts';
import { ansToCompact, parseAns } from '../tools/ans.ts';
import { formatCompact } from '../tools/json.ts';

const PACKAGE = fileURLToPath(new URL('..', import.meta.url));
const FIXTURES = join(PACKAGE, 'test', 'fixtures');

const readJson = (path: string): CompactArt => JSON.parse(readFileSync(path, 'utf8')) as CompactArt;

/* ---------- the committed art ---------- */

for (const name of ['hero', 'wordmark']) {
  const path = join(PACKAGE, 'src', 'data', `${name}.json`);

  test(`src/data/${name}.json is in canonical form: re-encoding what it decodes to gives the same bytes`, () => {
    // Any other encoding of the same art (palette out of luminance order, an unused or repeated
    // colour, an escape where a delta fits, a wrong w, other formatting) differs from this one.
    const bytes = readFileSync(path, 'utf8');
    const art = decodeArt(JSON.parse(bytes) as CompactArt);
    const again = encodeArt(art.rows, (r, c) => colorAt(art, r, c)?.hex);
    assert.equal(formatCompact(again), bytes);
  });

  test(`src/data/${name}.json is trimmed like tools/ans2json.ts output`, () => {
    const { rows } = readJson(path);
    assert.ok(rows.length > 0);
    assert.notEqual(rows[0]?.trim(), '', 'blank first row');
    assert.notEqual(rows[rows.length - 1]?.trim(), '', 'blank last row');
    assert.ok(rows.some((row) => row.length > 0 && row[0] !== ' '), 'every row shares an indent');
    rows.forEach((row, r) => {
      assert.ok(!row.endsWith(' '), `row ${r} has trailing spaces`);
      assert.doesNotMatch(row, /[\x00-\x1f\x7f]/, `row ${r} has a control character`);
    });
  });
}

/* ---------- the .ans converter ---------- */

/**
 * Reads the output of the original Python converter, ans2js.py (`window.NAME={"w","h","html"}`,
 * one line of `<i style="color:#rrggbb">` runs per art row, text escaped like html.escape),
 * into the art it describes. Independent of the code under test: it is the oracle.
 */
function readAns2jsOutput(source: string): { w: number; h: number; rows: string[]; colors: (string | undefined)[][] } {
  const m = /^window\.\w+=(.*);\r?\n?$/s.exec(source);
  assert.ok(m?.[1], 'not an ans2js.py output file');
  const { w, h, html } = JSON.parse(m[1]) as { w: number; h: number; html: string };
  const entities: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'" };
  const rows: string[] = [];
  const colors: (string | undefined)[][] = [];
  for (const line of html.split('\n')) {
    let row = '';
    const rowColors: (string | undefined)[] = [];
    for (const run of line.matchAll(/<i style="color:(#[0-9a-f]{6})">([^<]*)<\/i>|([^<]+)/g)) {
      const text = (run[2] ?? run[3] ?? '').replace(/&(?:amp|lt|gt|quot|#x27);/g, (e) => entities[e] ?? e);
      row += text;
      for (const ch of text) rowColors.push(ch === ' ' ? undefined : run[1]);
    }
    rows.push(row);
    colors.push(rowColors);
  }
  return { w, h, rows, colors };
}

test('tools/ans2json.ts converts sample.ans to what the original ans2js.py made of it', () => {
  const expected = readAns2jsOutput(readFileSync(join(FIXTURES, 'sample.ans2js.js'), 'utf8'));
  const dir = mkdtempSync(join(tmpdir(), 'ascii-art-'));
  try {
    const out = join(dir, 'sample.json');
    execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(PACKAGE, 'tools', 'ans2json.ts'), join(FIXTURES, 'sample.ans'), out]);
    const bytes = readFileSync(out, 'utf8');
    const art = decodeArt(JSON.parse(bytes) as CompactArt);
    assert.equal(art.w, expected.w);
    assert.equal(art.h, expected.h);
    assert.deepEqual(art.rows, expected.rows);
    const cells = (a: Art): (string | undefined)[][] => a.rows.map((row, r) => [...row].map((_, c) => colorAt(a, r, c)?.hex));
    assert.deepEqual(cells(art), expected.colors);
    // and it is written in the committed files' layout (one art row per line)
    assert.equal(bytes, formatCompact(JSON.parse(bytes) as CompactArt));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the .ans converter refuses what the compact format cannot hold', () => {
  assert.throws(() => ansToCompact('ab'), /no colour/);                               // uncoloured glyphs
  assert.throws(() => ansToCompact('\x1b[38;2;1;2;3ma\x1b[0mb'), /no colour/);        // ...after a reset
  assert.throws(() => ansToCompact('\x1b[38;2;1;2;3ma\x1b[mb'), /no colour/);         // ...after an empty one
  assert.throws(() => ansToCompact('\x1b[38;2;1;2;3m\u{1F98B}'), /outside the BMP/);
  assert.throws(() => ansToCompact('\x1b[38;2;300;2;3mx'), /above 255/);
  assert.throws(() => ansToCompact('\x1b[38;2;;2;3mx'), /empty colour component/);
  assert.throws(() => parseAns(' \n  \n'), /no visible characters/);
});

/* ---------- the codec ---------- */

test('decoded cells: glyphs, colours and blanks', () => {
  const art = decodeArt(ansToCompact('\x1b[38;2;37;4;7m^^  \x1b[38;2;10;2;7m.\n  \x1b[38;2;255;226;170mx'));
  assert.equal(art.w, 5);
  assert.equal(art.h, 2);
  assert.deepEqual(art.rows, ['^^  .', '  x']);
  assert.deepEqual(colorAt(art, 0, 1), { r: 37, g: 4, b: 7, hex: '#250407' });
  assert.equal(colorAt(art, 0, 4)?.hex, '#0a0207');
  assert.equal(colorAt(art, 1, 2)?.hex, '#ffe2aa');
  assert.equal(colorAt(art, 0, 2), undefined);                    // space
  assert.equal(colorAt(art, 1, 4), undefined);                    // past the end of a short row
  assert.equal(colorAt(art, 0, 7), undefined);                    // past w (not row 1, column 2)
  assert.equal(art.color[1 * art.w + 3], NO_COLOR);
  assert.equal(glyphAt(art, 1, 4), ' ');
  assert.equal(glyphAt(art, 1, 2), 'x');
});

test('encode -> decode round-trips random art, including far palette jumps', () => {
  let seed = 7;
  const random = (): number => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const hex = (n: number): string => n.toString(16).padStart(6, '0');
  const rows: string[] = [];
  const colors: string[][] = [];
  for (let r = 0; r < 40; r++) {
    let row = '';
    const rowColors: string[] = [];
    const width = (random() * 120) | 0;
    for (let c = 0; c < width; c++) {
      const blank = random() < 0.3;
      row += blank ? ' ' : String.fromCharCode(33 + ((random() * 94) | 0));
      rowColors.push(hex((random() * 3000 | 0) * 5591));             // up to 3000 distinct colours
    }
    rows.push(row);
    colors.push(rowColors);
  }
  const compact = encodeArt(rows, (r, c) => colors[r]?.[c]);
  assert.ok(compact.colors.includes('_'), 'expected some escaped (absolute) indices');
  const art = decodeArt(JSON.parse(JSON.stringify(compact)) as CompactArt);
  rows.forEach((row, r) => {
    for (let c = 0; c < compact.w; c++) {
      const glyph = row[c] ?? ' ';
      assert.equal(glyphAt(art, r, c), glyph);
      assert.equal(colorAt(art, r, c)?.hex, glyph === ' ' ? undefined : '#' + colors[r]?.[c]);
    }
  });
});

test('decodeArt rejects malformed data', () => {
  // palette [#010203, #fafafa]; colours A A C: index 0, same, +1
  const good = ansToCompact('\x1b[38;2;1;2;3mab\x1b[38;2;250;250;250mc');
  assert.doesNotThrow(() => decodeArt(good));
  // (each with the message of its own check, so one check cannot stand in for another)
  const bad: [string, Partial<CompactArt>, RegExp][] = [
    ['version', { v: 2 }, /unsupported format version 2/],
    ['size not an integer', { w: 3.5 }, /non-negative integers/],
    ['row count', { h: 2 }, /expected 2 rows, got 1/],
    ['row width', { w: 2 }, /row 0 is wider than 2/],
    ['palette', { palette: good.palette + 'abc' }, /6-digit lowercase hex/],
    ['short colour stream', { colors: good.colors.slice(0, -1) }, /colour stream ended early/],
    ['long colour stream', { colors: good.colors + 'A' }, /1 unused colour codes/],
    ['bad digit', { colors: '*' + good.colors.slice(1) }, /bad colour code at 0/],
    ['index out of range', { colors: good.colors.slice(0, -1) + 'E' }, /palette index 2 out of range at row 0, column 2/],
    ['negative index', { colors: 'B' + good.colors.slice(1) }, /palette index -1 out of range/],
    ['escaped index out of range', { colors: good.colors.slice(0, -1) + '_AC' }, /palette index 2 out of range/],
  ];
  for (const [what, patch, message] of bad) assert.throws(() => decodeArt({ ...good, ...patch }), message, what);
});
