import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { decodeArt, encodeArt, nearestXterm256, renderArtForTerminal, stripAnsi, visibleWidth, xterm256Rgb } from '../src/index.ts';
import type { Art, CompactArt, TerminalOptions } from '../src/index.ts';

const PACKAGE = fileURLToPath(new URL('..', import.meta.url));
const load = (name: string): Art => decodeArt(JSON.parse(readFileSync(join(PACKAGE, 'src', 'data', `${name}.json`), 'utf8')) as CompactArt);
const ARTS = { hero: load('hero'), wordmark: load('wordmark') };

const MODES = ['glyphs', 'blocks'] as const;
const COLOURS = [256, 'truecolor'] as const;
const ESC = '\x1b';
const RESET = `${ESC}[0m`;

/** Art from rows and a colour per cell (by row and column). */
const artOf = (rows: string[], colour: (r: number, c: number) => string): Art => decodeArt(encodeArt(rows, colour));

/* ---------- stripAnsi / visibleWidth ---------- */

test('stripAnsi and visibleWidth on handcrafted strings', () => {
  const cases: [input: string, text: string, width: number][] = [
    ['', '', 0],
    ['plain', 'plain', 5],
    [`${ESC}[38;5;196mab${RESET}`, 'ab', 2],
    [`${ESC}[38;2;1;2;3;48;2;4;5;6m▀▄█${RESET}`, '▀▄█', 3],
    [`${ESC}[mx${ESC}[0m`, 'x', 1],                                   // SGR with no parameters
    [`${ESC}[2K${ESC}[1;31mhi${ESC}[10D`, 'hi', 2],                    // other CSI sequences go too
    [`${ESC}]8;;https://shipmoth.com${ESC}\\link${ESC}]8;;\x07`, 'link', 4],   // OSC 8 hyperlink, ST and BEL
    ['[31m red', '[31m red', 8],                                       // no ESC: just text
    ['\u{1F319}a', '\u{1F319}a', 2],                                   // a surrogate pair is one code point
    [`a ${ESC}[0m `, 'a  ', 3],                                        // spaces count
  ];
  for (const [input, text, width] of cases) {
    assert.equal(stripAnsi(input), text, JSON.stringify(input));
    assert.equal(visibleWidth(input), width, JSON.stringify(input));
  }
});

/* ---------- xterm-256 ---------- */

test('xterm256Rgb: the cube and the grey ramp', () => {
  assert.deepEqual(xterm256Rgb(16), [0, 0, 0]);
  assert.deepEqual(xterm256Rgb(196), [255, 0, 0]);      // 16 + 36*5
  assert.deepEqual(xterm256Rgb(64), [95, 135, 0]);      // 16 + 36*1 + 6*2
  assert.deepEqual(xterm256Rgb(215), [255, 175, 95]);   // 16 + 36*5 + 6*3 + 1
  assert.deepEqual(xterm256Rgb(231), [255, 255, 255]);
  assert.deepEqual(xterm256Rgb(232), [8, 8, 8]);
  assert.deepEqual(xterm256Rgb(244), [128, 128, 128]);
  assert.deepEqual(xterm256Rgb(255), [238, 238, 238]);
  assert.throws(() => xterm256Rgb(15), RangeError);
  assert.throws(() => xterm256Rgb(256), RangeError);
});

test('nearestXterm256 on hand-picked colours', () => {
  const cases: [rgb: [number, number, number], index: number, why: string][] = [
    [[255, 0, 0], 196, 'pure red is a cube corner'],
    [[0, 0, 255], 21, 'pure blue is a cube corner'],
    [[95, 135, 0], 64, 'an exact cube colour'],
    [[0, 0, 0], 16, 'black: the cube, not system colour 0'],
    [[255, 255, 255], 231, 'white: the cube (the grey ramp stops at 238)'],
    [[128, 128, 128], 244, 'grey 128 is on the ramp (8 + 10*12); the nearest cube grey is 135'],
    [[18, 18, 18], 233, 'grey 18 is on the ramp'],
    [[100, 100, 100], 241, 'grey 100: ramp 98 beats cube 95'],
    [[238, 238, 238], 255, 'the last ramp grey'],
    [[5, 5, 5], 232, 'near black: ramp 8 beats cube 0'],
    // The site's amber (--y). Channel by channel the nearest cube levels are 255, 175, 95: index
    // 215, #ffaf5f, which a plain RGB distance picks. But raising blue from 58 to 95 turns the
    // amber pink (OKLab a 0.026 -> 0.059, b 0.148 -> 0.121, dE^2 0.0018), while dropping it to 0
    // only makes it a little more saturated (a 0.042, b 0.165, dE^2 0.0005): 214, #ffaf00.
    [[0xf5, 0xb6, 0x3a], 214, '#f5b63a, the amber'],
  ];
  for (const [rgb, index, why] of cases) assert.equal(nearestXterm256(...rgb), index, why);
});

/* ---------- exact output on tiny arts ---------- */

const RED = 'ff0000', GREEN = '5f8700', BLUE = '0000ff';

test('blocks: a tiny art gives exactly the expected cells (fg over bg, the cheaper half, bg back to default)', () => {
  // 14 x 4 drawn 8 columns wide: each output column takes 1.75 source columns, and a pixel is
  // 1.75 * 2/1.75 / 2 = 1 source row tall, so output columns 0-3 are source columns 0-6, 4-7 are
  // 7-13, and each pixel row is one source row: every pixel is all '$' or all blank.
  const rows = ['$$$$$$$$$$$$$$', '$$$$$$$', '       $$$$$$$', '$$$$$$$$$$$$$$'];
  const colour = (r: number, c: number): string => [[RED, BLUE], [GREEN, ''], ['', RED], [BLUE, BLUE]][r]?.[c < 7 ? 0 : 1] ?? '';
  const art = artOf(rows, colour);
  // row 0: upper red / lower green (both new: upper half), then upper blue over the default background.
  // row 1: lower blue, then red over blue: the lower half keeps the blue foreground, so only the
  // background changes.
  assert.deepEqual(renderArtForTerminal(art, { width: 8, mode: 'blocks', colours: 'truecolor' }), [
    `${ESC}[38;2;255;0;0;48;2;95;135;0m▀▀▀▀${ESC}[38;2;0;0;255;49m▀▀▀▀${RESET}`,
    `${ESC}[38;2;0;0;255m▄▄▄▄${ESC}[48;2;255;0;0m▄▄▄▄${RESET}`,
  ]);
  assert.deepEqual(renderArtForTerminal(art, { width: 8, mode: 'blocks', colours: 256 }), [
    `${ESC}[38;5;196;48;5;64m▀▀▀▀${ESC}[38;5;21;49m▀▀▀▀${RESET}`,
    `${ESC}[38;5;21m▄▄▄▄${ESC}[48;5;196m▄▄▄▄${RESET}`,
  ]);
});

test('blocks: a pixel mixes its cells in linear light', () => {
  // 2 x 8 drawn 1 column wide: a pixel is 2 * 2/1.75 / 2 = 8/7 rows, so 7 pixels, all half red,
  // half blue. Linear 0.5 is sRGB 187.5 -> 188 (an sRGB mean would give 128).
  const art = artOf(Array<string>(8).fill('$$'), (_, c) => (c === 0 ? RED : BLUE));
  const full = `${ESC}[38;2;188;0;188m█${RESET}`;
  assert.deepEqual(renderArtForTerminal(art, { width: 1, mode: 'blocks', colours: 'truecolor' }), [full, full, full, `${ESC}[38;2;188;0;188m▀${RESET}`]);
});

test('glyphs: a tiny art gives exactly the expected cells (ink picks the glyph and shades the colour)', () => {
  // 7 x 6 drawn 4 columns wide: a glyph row is 1.75 * 2/1.75 = 2 source rows. The ramp has 70
  // glyphs, ' ' (ink 0) to '$' (ink 69/69).
  // - top block: half '$', half blank: ink 0.5 of the inkiest block, ramp index
  //   round(0.5 * 69) = 35, 'n', at half the light (linear 0.5: 188)
  // - middle block: all 'l', ramp index 10: ink 10/69 = 0.145, so 'l' again, its blue at linear
  //   0.145: 1.055 * 0.145^(1/2.4) - 0.055 = 0.4167 -> 106
  // - bottom block: all '$': '$' in its own colour
  const rows = ['$$$$$$$', '', 'lllllll', 'lllllll', '$$$$$$$', '$$$$$$$'];
  const art = artOf(rows, (r) => [RED, '', BLUE, BLUE, GREEN, GREEN][r] ?? '');
  assert.deepEqual(renderArtForTerminal(art, { width: 4, mode: 'glyphs', colours: 'truecolor' }), [
    `${ESC}[38;2;188;0;0mnnnn${RESET}`,
    `${ESC}[38;2;0;0;106mllll${RESET}`,
    `${ESC}[38;2;95;135;0m$$$$${RESET}`,
  ]);
});

test('glyphs: the ramp is stretched so the inkiest block of the art is drawn as "$"', () => {
  // all 'l' (ink 10/69): every block is the inkiest, so '$', in blue shaded by the real ink (106)
  const art = artOf(['lllllll', 'lllllll'], () => BLUE);
  assert.deepEqual(renderArtForTerminal(art, { width: 4, mode: 'glyphs', colours: 'truecolor' }), [`${ESC}[38;2;0;0;106m$$$$${RESET}`]);
});

test('glyphs: a block with too little ink is blank, and a gap needs no colour codes', () => {
  // 21 x 6 drawn 12 columns wide: 1.75 source columns a cell, so the thirds 0-6, 7-13 and 14-20
  // map to cells 0-3, 4-7 and 8-11, and a glyph row is 2 source rows.
  // - rows 0-1: red, a gap, red: the gap is plain spaces, the red is set once
  // - rows 2-3: ':' (ink 7/69 = 0.10, under the 0.12 a glyph needs): an empty line
  // - rows 4-5: green across
  const rows = ['$$$$$$$       $$$$$$$', '$$$$$$$       $$$$$$$', ':::::::', ':::::::', '$'.repeat(21), '$'.repeat(21)];
  const art = artOf(rows, (r) => [RED, RED, BLUE, BLUE, GREEN, GREEN][r] ?? '');
  assert.deepEqual(renderArtForTerminal(art, { width: 12, mode: 'glyphs', colours: 'truecolor' }), [
    `${ESC}[38;2;255;0;0m$$$$    $$$$${RESET}`,
    '',
    `${ESC}[38;2;95;135;0m${'$'.repeat(12)}${RESET}`,
  ]);
});

test('proportions: a source row is 1.75 columns tall, a terminal row 2, and art is never scaled up', () => {
  const art = artOf(Array<string>(40).fill('$'.repeat(70)), () => 'ffffff');
  const line = (ch: string, n: number): string => `${ESC}[38;2;255;255;255m${ch.repeat(n)}${RESET}`;
  // 70 columns at width 35: 2 source columns a cell, 40 * 1.75 / (2 * 2) = 17.5 -> 18 rows
  assert.deepEqual(renderArtForTerminal(art, { width: 35, mode: 'glyphs', colours: 'truecolor' }), Array<string>(18).fill(line('$', 35)));
  // blocks: 35 pixel rows, so 17 full rows and an upper half
  assert.deepEqual(renderArtForTerminal(art, { width: 35, mode: 'blocks', colours: 'truecolor' }), [...Array<string>(17).fill(line('█', 35)), line('▀', 35)]);
  // wider than the art: 70 columns, 40 * 1.75 / 2 = 35 rows
  assert.deepEqual(renderArtForTerminal(art, { width: 200, mode: 'glyphs', colours: 'truecolor' }), Array<string>(35).fill(line('$', 70)));
});

test('the art is cropped to its glyphs; empty art gives no lines', () => {
  const art = artOf(['', '', '     $$$$$$$', '', '     $$$$$$$', '     $$$$$$$', ''], (r) => (r === 2 ? RED : GREEN));
  assert.deepEqual(renderArtForTerminal(art, { width: 4, mode: 'glyphs', colours: 'truecolor' }), [
    `${ESC}[38;2;188;0;0mnnnn${RESET}`,
    `${ESC}[38;2;95;135;0m$$$$${RESET}`,
  ]);
  assert.deepEqual(renderArtForTerminal(artOf(['', '  '], () => RED), { width: 80, mode: 'blocks', colours: 256 }), []);
});

test('bad options are refused', () => {
  const art = ARTS.wordmark;
  for (const width of [0, -1, 1.5, Number.NaN]) {
    assert.throws(() => renderArtForTerminal(art, { width, mode: 'glyphs', colours: 256 }), RangeError, String(width));
  }
  assert.throws(() => renderArtForTerminal(art, { width: 80, mode: 'pixels', colours: 256 } as unknown as TerminalOptions), RangeError);
  assert.throws(() => renderArtForTerminal(art, { width: 80, mode: 'blocks', colours: 16 } as unknown as TerminalOptions), RangeError);
});

/* ---------- invariants, on the real art and on random art ---------- */

const SGR = /\x1b\[([0-9;]*)m/g;

/**
 * Plays the line like a terminal: checks every escape is a well-formed SGR the options allow,
 * and returns the cells with the background each is drawn on.
 */
function play(line: string, colours: TerminalOptions['colours']): { ch: string; bg: string }[] {
  const leftover = line.replace(SGR, '');
  assert.ok(!leftover.includes(ESC), `an escape that is not SGR: ${JSON.stringify(line)}`);
  assert.doesNotMatch(leftover, /[\x00-\x1f\x7f]/, 'a control character');
  const cells: { ch: string; bg: string }[] = [];
  let bg = '';
  for (const part of line.split(/(\x1b\[[0-9;]*m)/)) {
    const m = /^\x1b\[([0-9;]*)m$/.exec(part);
    if (!m) {
      for (const ch of part) cells.push({ ch, bg });
      continue;
    }
    const p = (m[1] ?? '').split(';').map(Number);
    for (let i = 0; i < p.length; i++) {
      const v = p[i];
      if (v === 0) bg = '';
      else if (v === 39) continue;
      else if (v === 49) bg = '';
      else if (v === 38 || v === 48) {
        const kind = p[i + 1];
        let colour: string;
        if (kind === 5 && colours === 256) {
          const n = p[i + 2] ?? -1;
          assert.ok(Number.isInteger(n) && n >= 16 && n <= 255, `xterm colour ${n}`);
          colour = String(n);
          i += 2;
        } else if (kind === 2 && colours === 'truecolor') {
          const rgb = p.slice(i + 2, i + 5);
          assert.ok(rgb.length === 3 && rgb.every((c) => Number.isInteger(c) && c >= 0 && c <= 255), `rgb ${rgb.join(';')}`);
          colour = rgb.join(';');
          i += 4;
        } else assert.fail(`SGR ${p.join(';')} in ${colours} mode`);
        if (v === 48) bg = colour;
      } else assert.fail(`unexpected SGR parameter ${v} in ${JSON.stringify(part)}`);
    }
  }
  return cells;
}

function checkLines(lines: string[], options: TerminalOptions, label: string): void {
  const allowed = options.mode === 'blocks'
    ? new Set(' ▀▄█')
    : new Set(" .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$");
  assert.ok(lines.length > 0, `${label}: no lines`);
  assert.notEqual(stripAnsi(lines[0] ?? '').trim(), '', `${label}: blank first line`);
  assert.notEqual(stripAnsi(lines[lines.length - 1] ?? '').trim(), '', `${label}: blank last line`);
  lines.forEach((line, i) => {
    const where = `${label}, line ${i}`;
    assert.ok(visibleWidth(line) <= options.width, `${where}: ${visibleWidth(line)} columns`);
    const text = stripAnsi(line);
    assert.equal(text, text.trimEnd(), `${where}: trailing spaces`);
    for (const ch of text) assert.ok(allowed.has(ch), `${where}: glyph ${JSON.stringify(ch)}`);
    const setsColour = SGR.test(line);
    SGR.lastIndex = 0;
    if (setsColour) assert.ok(line.endsWith(RESET), `${where}: no reset at the end`);
    else assert.equal(line, text, `${where}`);
    for (const cell of play(line, options.colours)) {
      if (cell.ch === ' ') assert.equal(cell.bg, '', `${where}: a blank cell on a coloured background`);
    }
  });
}

for (const [name, art] of Object.entries(ARTS)) {
  test(`${name}: every width from 20 to 120, every mode and colour depth: the line rules hold`, () => {
    for (let width = 20; width <= 120; width++) {
      for (const mode of MODES) for (const colours of COLOURS) {
        const options = { width, mode, colours };
        const lines = renderArtForTerminal(art, options);
        checkLines(lines, options, `${name} ${JSON.stringify(options)}`);
        // the art fills the width it is given (its dim edges may drop a column or two)
        assert.ok(Math.max(...lines.map(visibleWidth)) >= width - 3, `${name} ${JSON.stringify(options)}: too narrow`);
      }
    }
  });
}

test('the hero at 80 columns is 16 to 23 rows tall', () => {
  // 314 x 102 cells: 3.925 columns a cell, 102 * 1.75 / (3.925 * 2) = 22.7 -> 23 rows before
  // the blank (too dim) rows at the top and bottom are dropped
  for (const mode of MODES) {
    const lines = renderArtForTerminal(ARTS.hero, { width: 80, mode, colours: 256 });
    assert.ok(lines.length >= 16 && lines.length <= 23, `${mode}: ${lines.length} rows`);
  }
});

test('random art: the line rules hold at every width', () => {
  let seed = 7;
  const random = (): number => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const hex = (n: number): string => n.toString(16).padStart(6, '0');
  for (let k = 0; k < 60; k++) {
    const h = 1 + ((random() * 40) | 0), w = 1 + ((random() * 200) | 0);
    const rows: string[] = [];
    const colours: string[][] = [];
    for (let r = 0; r < h; r++) {
      const len = (random() * (w + 1)) | 0;
      let row = '';
      const rc: string[] = [];
      for (let c = 0; c < len; c++) {
        row += random() < 0.4 ? ' ' : String.fromCharCode(33 + ((random() * 94) | 0));
        rc.push(hex((random() * 0x1000000) | 0));
      }
      rows.push(row.trimEnd());
      colours.push(rc);
    }
    if (!rows.some((row) => row.length > 0)) rows[0] = '@';
    const art = artOf(rows, (r, c) => colours[r]?.[c] ?? 'ffffff');
    for (const width of [1, 2, 3, 7, 20, 33, 80, 120, 250]) {
      for (const mode of MODES) for (const colours of COLOURS) {
        const options = { width, mode, colours };
        const lines = renderArtForTerminal(art, options);
        if (lines.length > 0) checkLines(lines, options, `random art ${k} ${JSON.stringify(options)}`);
      }
    }
  }
});

test('deterministic: the same art and options give the same lines, on any call', () => {
  for (const [name, art] of Object.entries(ARTS)) {
    for (const mode of MODES) for (const colours of COLOURS) {
      const options = { width: 80, mode, colours };
      const first = renderArtForTerminal(art, options);
      renderArtForTerminal(ARTS.hero, { width: 33, mode, colours: 256 });   // anything cached in between
      assert.deepEqual(renderArtForTerminal(load(name === 'hero' ? 'hero' : 'wordmark'), options), first, `${name} ${mode} ${colours}`);
    }
  }
});
