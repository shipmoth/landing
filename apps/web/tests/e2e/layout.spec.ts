/**
 * Layout across widths.
 *
 *   - Nothing is cut off at the screen edge, at widths from 300 to 1920px (320px is the narrowest
 *     screen supported, README "Browsers"; 300 is checked too). html clips sideways overflow, so a
 *     spilled box does not scroll: it is cut off, which is worse.
 *   - The home hero is centred on the text column: the moth's stage, the wordmark's art and the
 *     tagline, and the wordmark's letters stay inside the column (its canvas is wider: the
 *     transparent room around the art may spill into the page gutter, the letters may not). The
 *     bug this guards: the laid-out wordmark canvas is wider than the column, and as a grid item
 *     with min-width:auto it held the hero's track open, so the centred moth and tagline sat right
 *     of centre (12px at 1280px, 35px at 390px, where the tagline lost its last 20px).
 *   - Each CSS breakpoint switches its layout exactly at its width: one side at width + 1, the
 *     other at width and width - 1: loaded at width + 1, resized across it and back again.
 *     The breakpoints are read from the built stylesheet and must be exactly the ones listed here,
 *     so a new or moved breakpoint has to come with its expected layout (or be listed as inert).
 *
 * (A resized page is compared with a fresh load in resize-fit.spec.ts.)
 */
import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { PAGE_NAMES, type PageName } from '../support/expected';

const HEIGHT = 800;
const SETTLE = 300; // re-layouts are debounced by 120ms

/** the wordmark canvas's drawing margin (PAD in features/wordmark.ts): the art is the canvas less this */
const WORDMARK_PAD = 70;
/** how far off the column's centre line a centred part of the hero may sit (sub-pixel layout) */
const CENTRE_TOLERANCE = 1;

interface Spill {
  /** what is cut off: a text run's parent, a frame edge, or a drawing */
  what: string;
  left: number;
  right: number;
}

/**
 * Everything a visitor sees must sit within the viewport: returns what does not. Checked are the
 * things that draw: every text run, the ascii frame edges, and the drawings (the hero moth's box,
 * the wordmark's art, the crew orbit). Boxes as such are not: an empty margin past the edge is
 * harmless (the hero's wing canvases even tilt past it while they flap, and the wordmark canvas's
 * transparent PAD spills into the gutter).
 */
function spills(pad: number): Spill[] {
  const W = document.documentElement.clientWidth;
  const out: Spill[] = [];
  const name = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.classList.length ? '.' + [...el.classList].join('.') : ''}`;
  const check = (what: string, left: number, right: number) => {
    if (right - left > 0 && (left < -0.5 || right > W + 0.5)) out.push({ what, left: Math.round(left), right: Math.round(right) });
  };
  // text (the frames' dash runs are clipped to their edge on purpose: the edges are checked below)
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const parent = n.parentElement;
    if (!parent || !(n as Text).data.trim() || parent.closest('[hidden], script, style, noscript, .sr, .ab')) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) check(`text in ${name(parent)}`, r.left, r.right);
  }
  for (const el of document.querySelectorAll('.ab-t, .ab-b, .ab-l, .ab-r')) {
    if (el.closest('[hidden]')) continue;
    const r = el.getBoundingClientRect();
    check(`frame ${name(el)} of ${name(el.parentElement?.parentElement ?? el)}`, r.left, r.right);
  }
  // drawings, by their layout box (untransformed: the stage tilts and bobs while the moth flies)
  for (const el of document.querySelectorAll<HTMLElement>('#orbit, #crew, .title canvas.word')) {
    let left = 0;
    for (let p: HTMLElement | null = el; p; p = p.offsetParent as HTMLElement | null) left += p.offsetLeft;
    const inset = el.matches('canvas.word') ? pad : 0;
    check(`drawing ${name(el)}`, left + inset - scrollX, left + el.offsetWidth - inset - scrollX);
  }
  return out;
}

async function expectNothingCutOff(page: Page, label: string): Promise<void> {
  expect(await page.evaluate(spills, WORDMARK_PAD), `${label}: cut off at the screen edge`).toEqual([]);
}

interface Span {
  left: number;
  right: number;
}

interface Hero {
  /** the text column: main's content box */
  column: Span;
  /** the moth's stage and the wordmark's art (the canvas less PAD) */
  stage: Span;
  art: Span;
  /** the widest line of the tagline, caret included (it wraps on narrow screens; each line is centred) */
  tagline: Span;
}

/** where the home hero's parts sit, left to right */
function hero(pad: number): Hero {
  // (untransformed, measured to the sub-pixel: the stage's tilt and bob are lifted for a moment)
  const box = (sel: string, inset: number): Span => {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) throw new Error(`no ${sel}`);
    const transform = el.style.transform;
    el.style.transform = 'none';
    const r = el.getBoundingClientRect();
    el.style.transform = transform;
    return { left: r.left + inset, right: r.right - inset };
  };
  const main = document.querySelector('main');
  const line = document.querySelector('.hero .type');
  if (!main || !line || !document.getElementById('typed')?.textContent) throw new Error('no main, or the tagline is not typed yet');
  const cs = getComputedStyle(main), m = main.getBoundingClientRect();
  // the tagline's lines: the typed text and the caret after it, joined per line box
  const range = document.createRange();
  range.selectNodeContents(line);
  const lines: (Span & { top: number; bottom: number })[] = [];
  for (const r of range.getClientRects()) {
    if (!r.width) continue;
    const y = (r.top + r.bottom) / 2;
    const same = lines.find((l) => y >= l.top && y <= l.bottom);
    if (same) Object.assign(same, { left: Math.min(same.left, r.left), right: Math.max(same.right, r.right) });
    else lines.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
  }
  const widest = lines.reduce((a, b) => (b.right - b.left > a.right - a.left ? b : a));
  return {
    column: { left: m.left + parseFloat(cs.paddingLeft), right: m.right - parseFloat(cs.paddingRight) },
    stage: box('#orbit .stage', 0),
    art: box('.title canvas.word', pad),
    tagline: { left: widest.left, right: widest.right },
  };
}

async function expectHeroCentred(page: Page, label: string): Promise<void> {
  const h = await page.evaluate(hero, WORDMARK_PAD);
  const mid = (s: Span) => (s.left + s.right) / 2;
  const at = JSON.stringify(h);
  for (const part of ['stage', 'art', 'tagline'] as const) {
    expect(Math.abs(mid(h[part]) - mid(h.column)), `${label}: the ${part} is centred on the column ${at}`).toBeLessThanOrEqual(CENTRE_TOLERANCE);
  }
  expect(h.art.left, `${label}: the wordmark's letters start inside the column ${at}`).toBeGreaterThanOrEqual(h.column.left - 0.5);
  expect(h.art.right, `${label}: the wordmark's letters end inside the column ${at}`).toBeLessThanOrEqual(h.column.right + 0.5);
}

const WIDTHS = [300, 320, 340, 360, 375, 390, 414, 430, 480, 481, 500, 520, 539, 540, 560, 561, 600, 601, 640, 641, 700, 768, 820, 900, 901, 1024, 1280, 1440, 1680, 1920];

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    // reduced motion: the typewriter's line is there at once and every drawing is drawn whole
    test.use({ viewport: { width, height: HEIGHT }, reducedMotion: 'reduce' });

    test(`nothing is cut off at the screen edge when loaded ${width}px wide, and the hero is centred`, async ({ site, page, twin }) => {
      await site.open('index');
      await expectNothingCutOff(page, 'index');
      await expectHeroCentred(page, 'index');
      await expectNothingCutOff(await twin.open('about'), 'about');
    });
  });
}

test.describe('resized', () => {
  test.use({ viewport: { width: 1280, height: HEIGHT }, reducedMotion: 'reduce' });

  test('index: loaded at 1280 and narrowed to 390, then 320, the hero stays centred and nothing is cut off', async ({ site, page }) => {
    await site.open('index');
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: HEIGHT });
      await site.advance(SETTLE);
      await expectNothingCutOff(page, `resized to ${width}px`);
      await expectHeroCentred(page, `resized to ${width}px`);
    }
  });
});

type Probe = { kind: 'grid tracks' | 'columns'; selector: string };

interface Breakpoint {
  /** the widest width still inside the media query (max-width) */
  width: number;
  page: PageName;
  what: string;
  probe: Probe;
  /** the probe's value at width + 1 and at width (and below) */
  outside: number;
  inside: number;
}

const BREAKPOINTS: Breakpoint[] = [
  // (the lab wall is hidden for now; its computed column count still switches)
  { width: 900, page: 'about', what: 'the lab wall drops to three columns', probe: { kind: 'columns', selector: 'main .wall' }, outside: 4, inside: 3 },
  { width: 640, page: 'index', what: 'the "what we go after" tiles stack', probe: { kind: 'grid tracks', selector: 'main .gofor' }, outside: 3, inside: 1 },
  { width: 640, page: 'about', what: 'the crew cards stack', probe: { kind: 'grid tracks', selector: 'main .crew' }, outside: 2, inside: 1 },
  { width: 600, page: 'about', what: 'the lab wall drops to two columns', probe: { kind: 'columns', selector: 'main .wall' }, outside: 3, inside: 2 },
  { width: 560, page: 'index', what: 'before and after stack in each product', probe: { kind: 'grid tracks', selector: 'main .prod .feat' }, outside: 2, inside: 1 },
];


function measure(page: Page, probe: Probe): Promise<number> {
  return page.evaluate(({ kind, selector }) => {
    const el = document.querySelector(selector);
    if (!el) throw new Error(`no ${selector}`);
    const cs = getComputedStyle(el);
    return kind === 'columns' ? Number(cs.columnCount) : cs.gridTemplateColumns.split(' ').filter(Boolean).length;
  }, probe);
}

/** every width threshold in the page's stylesheets, as "the widest width still inside" (px) */
function stylesheetBreakpoints(): number[] {
  const found = new Set<number>();
  const visit = (rules: CSSRuleList) => {
    for (const rule of rules) {
      if (!(rule instanceof CSSMediaRule)) continue;
      const q = rule.conditionText;
      for (const m of q.matchAll(/max-width\s*:\s*(\d+)px/g)) found.add(Number(m[1]));
      for (const m of q.matchAll(/width\s*<=\s*(\d+)px/g)) found.add(Number(m[1]));
      // min-width: N starts applying at N: the boundary pair is N-1 / N, same as max-width: N-1
      for (const m of q.matchAll(/min-width\s*:\s*(\d+)px/g)) found.add(Number(m[1]) - 1);
      for (const m of q.matchAll(/width\s*>=\s*(\d+)px/g)) found.add(Number(m[1]) - 1);
      visit(rule.cssRules);
    }
  };
  for (const sheet of document.styleSheets) visit(sheet.cssRules);
  return [...found].sort((a, b) => a - b);
}

test.describe('breakpoints', () => {
  for (const name of PAGE_NAMES) {
    test(`${name}: the built stylesheet has exactly the listed breakpoints`, async ({ site, page }) => {
      await site.open(name);
      const listed = [...new Set(BREAKPOINTS.map((b) => b.width))].sort((a, b) => a - b);
      expect(await page.evaluate(stylesheetBreakpoints)).toEqual(listed);
    });
  }

  for (const bp of BREAKPOINTS) {
    test.describe(`${bp.width}px`, () => {
      test.use({ viewport: { width: bp.width + 1, height: HEIGHT } });

      test(`${bp.page}: ${bp.what} at ${bp.width}px and below`, async ({ site, page }) => {
        await site.open(bp.page);
        expect(await measure(page, bp.probe), `loaded at ${bp.width + 1}px`).toBe(bp.outside);
        for (const width of [bp.width, bp.width - 1]) {
          await page.setViewportSize({ width, height: HEIGHT });
          await site.advance(SETTLE);
          expect(await measure(page, bp.probe), `resized to ${width}px`).toBe(bp.inside);
          await expectNothingCutOff(page, `resized to ${width}px`);
        }
        await page.setViewportSize({ width: bp.width + 1, height: HEIGHT });
        await site.advance(SETTLE);
        expect(await measure(page, bp.probe), `back at ${bp.width + 1}px`).toBe(bp.outside);
      });
    });
  }
});
