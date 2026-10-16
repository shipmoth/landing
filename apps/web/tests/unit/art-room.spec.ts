/**
 * The room global.css keeps for the hero moth and the wordmark before their scripts draw them
 * (#orbit:empty, .title .word:not([style])) is worked out from the art's size: W, H columns and
 * rows, 0.6 a monospace column per px of font size and 1.05 the line height. New art from
 * tools/ans2json.ts with another size needs those numbers updated, or the page jumps when it
 * draws (README, "Without JavaScript / slow connections").
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';

const require = createRequire(import.meta.url);
const size = (entry: string): { w: number; h: number } => JSON.parse(readFileSync(require.resolve(entry), 'utf8')) as { w: number; h: number };
const css = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8');

/** the declarations of the rule with exactly this selector */
function rule(selector: string): string {
  const at = css.indexOf(`\n${selector}{`);
  expect(at, `no rule for ${selector} in global.css`).toBeGreaterThanOrEqual(0);
  return css.slice(at + selector.length + 2, css.indexOf('}', at));
}

test('#orbit:empty is as tall as the hero art will be: width * H * 1.05 / (W * 0.6)', () => {
  const { w, h } = size('@shipmoth/ascii-art/hero');
  const m = /min-height:calc\(min\(1100px,100vw - 40px\) \* ([\d.]+) \/ ([\d.]+)\)/.exec(rule('#orbit:empty'));
  expect(m, 'min-height: calc(<#orbit width> * a / b)').not.toBeNull();
  expect(Number(m?.[1]) / Number(m?.[2])).toBeCloseTo((h * 1.05) / (w * 0.6), 6);
});

test('the wordmark placeholder has the art\'s aspect ratio: W * 0.6 / (H * 1.05)', () => {
  const { w, h } = size('@shipmoth/ascii-art/wordmark');
  const m = /aspect-ratio:([\d.]+)\/([\d.]+)/.exec(rule('.title .word:not([style])'));
  expect(m, 'aspect-ratio: a/b').not.toBeNull();
  expect(Number(m?.[1]) / Number(m?.[2])).toBeCloseTo((w * 0.6) / (h * 1.05), 6);
});
