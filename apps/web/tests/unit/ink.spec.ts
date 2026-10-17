/**
 * The ramp -> ink mapping (src/scripts/lib/ink.ts) the hero moth and the wordmark use when a cell is
 * too small on screen for its glyph and is drawn as a bar instead.
 * Expected values are worked out by hand from the curve ink = (position / 69) ^ 0.45, with the
 * ramp written out here again, not imported.
 */
import { expect, test } from '@playwright/test';
import { BLOCK_BELOW, BLOCK_COVER, RAMP, bar, blockCover, drawsBlocks, ink, inkAt, snap } from '../../src/scripts/lib/ink';

/** the 70-character density ramp the art is written in, sparse to dense (blank first) */
const THE_RAMP = ' .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$';

test('the ramp is the 70 glyphs the art is written in, blank first, $ densest', () => {
  expect(RAMP).toBe(THE_RAMP);
  expect(RAMP.length).toBe(70);
  expect(new Set(RAMP).size).toBe(70);
});

test('blank is no ink, the densest glyph is all of it', () => {
  expect(ink(' ')).toBe(0);
  expect(ink('')).toBe(0);
  expect(inkAt(0)).toBe(0);
  expect(ink('$')).toBe(1);
  expect(inkAt(69)).toBe(1);
});

test('ink rises strictly along the ramp', () => {
  const inks = [...THE_RAMP].map((g) => ink(g));
  for (let i = 1; i < inks.length; i++) expect(inks[i], `${THE_RAMP[i - 1]} -> ${THE_RAMP[i]}`).toBeGreaterThan(inks[i - 1] ?? 1);
});

test('hand-worked points on the curve (position / 69) ^ 0.45', () => {
  // '.' is position 1: (1/69)^0.45 = exp(0.45 * ln(1/69)) = exp(0.45 * -4.2341) = exp(-1.9053) = 0.1488
  expect(ink('.')).toBeCloseTo(0.1488, 3);
  // 'l' is position 10: (10/69)^0.45 = exp(0.45 * -1.9315) = exp(-0.8692) = 0.4193
  expect(ink('l')).toBeCloseTo(0.4193, 3);
  // 'v' is position 37: (37/69)^0.45 = exp(0.45 * -0.6232) = exp(-0.2804) = 0.7555
  expect(ink('v')).toBeCloseTo(0.7555, 3);
  // '*' is position 60: (60/69)^0.45 = exp(0.45 * -0.1398) = exp(-0.0629) = 0.9390
  expect(ink('*')).toBeCloseTo(0.9390, 3);
  // half way up the ramp carries more than half the ink (the light end is compressed)
  expect(inkAt(35)).toBeCloseTo(0.7368, 3);
});

test('a glyph off the ramp counts as the densest; positions past the end clamp', () => {
  expect(ink('█')).toBe(1);
  expect(inkAt(500)).toBe(1);
  expect(inkAt(-3)).toBe(0);
  expect(inkAt(Number.NaN)).toBe(0);
});

test('the bar for the densest glyph covers the share of the cell that glyph inks, not all of it', () => {
  expect(BLOCK_COVER).toBeGreaterThan(0.2);
  expect(BLOCK_COVER).toBeLessThan(0.5);
  expect(blockCover('$')).toBe(BLOCK_COVER);
  expect(blockCover(' ')).toBe(0);
  expect(blockCover('v')).toBeCloseTo(0.7555 * BLOCK_COVER, 3);
});

test('a bar is centred in its cell, as tall as its cover', () => {
  // a 4px cell from y=10, half covered: 2px tall, from 11 to 13
  expect(bar(10, 14, 0.5)).toEqual([11, 2]);
  // nothing for a blank, the whole cell at full cover
  expect(bar(10, 14, 0)).toEqual([12, 0]);
  expect(bar(10, 14, 1)).toEqual([10, 4]);
  // a 2.5px cell (css px at 2x), 0.3 covered: 0.75 tall, centred at 3 + 1.25
  const [top, h] = bar(3, 5.5, 0.3);
  expect(h).toBeCloseTo(0.75, 10);
  expect(top + h / 2).toBeCloseTo(4.25, 10);
});

test('bars below the threshold in device pixels per column, glyphs at and above it', () => {
  // the desktop moth: 1100px column / 314 columns at 1x = 3.50 device px -> glyphs
  expect(drawsBlocks(1100 / 314, 1)).toBe(false);
  // a 390px phone (350px column) at 3x: 3.34 device px -> bars; at 2x even more so
  expect(drawsBlocks(350 / 314, 3)).toBe(true);
  expect(drawsBlocks(350 / 314, 2)).toBe(true);
  // the desktop wordmark at 1x (1.49px cells) -> bars; a desktop moth at 2x -> glyphs
  expect(drawsBlocks(1.49, 1)).toBe(true);
  expect(drawsBlocks(1100 / 314, 2)).toBe(false);
  // the same wordmark on a 3x screen: 4.5 device px -> glyphs
  expect(drawsBlocks(1.49, 3)).toBe(false);
  expect(drawsBlocks(BLOCK_BELOW, 1)).toBe(false);
});

test('snap rounds to whole device pixels', () => {
  expect(snap(1.11, 2)).toBe(1);
  expect(snap(1.3, 2)).toBe(1.5);
  expect(snap(10.2, 3) * 3).toBe(31);
});
