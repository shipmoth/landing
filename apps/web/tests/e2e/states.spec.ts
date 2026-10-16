/**
 * States CSS draws by itself: hover colours and the text selection. (Keyboard focus rings:
 * a11y/keyboard.spec.ts; the crew card's moth lighting up on hover: crew.spec.ts.)
 *
 * Each state is entered for real (the pointer moves over the element, text is selected), and its
 * computed colours are compared with the design tokens in support/expected.ts. Reduced motion
 * keeps the swarm out of the way; it changes none of these styles.
 */
import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { COLOURS, PAGE_NAMES, type PageName } from '../support/expected';

test.use({ reducedMotion: 'reduce' });

interface Hover {
  page: PageName;
  label: string;
  selector: string;
  /** computed styles of `styled` (default: the element itself) at rest and under the pointer */
  styled?: string;
  rest: Record<string, string>;
  hover: Record<string, string>;
}

const HOVERS: Hover[] = [
  {
    page: 'index',
    label: 'product link (lwatch)',
    selector: 'main .go >> nth=1',
    rest: { color: COLOURS.v, 'background-color': 'rgba(0, 0, 0, 0)' },
    // the product's colour turns into a block behind black text
    hover: { color: COLOURS.bg, 'background-color': COLOURS.v },
  },
  {
    page: 'index',
    label: 'copy button',
    selector: '#copy',
    rest: { color: COLOURS.fg, 'text-decoration-line': 'none' },
    hover: { color: COLOURS.w, 'text-decoration-line': 'underline' },
  },
  {
    page: 'index',
    label: 'subscribe button',
    selector: 'form#form button',
    rest: { color: COLOURS.g, 'text-decoration-line': 'none' },
    hover: { color: COLOURS.w, 'text-decoration-line': 'underline' },
  },
  {
    page: 'index',
    label: 'nav link to the other page',
    selector: 'header .nav a >> nth=1',
    rest: { color: COLOURS.dim },
    hover: { color: COLOURS.y },
  },
  {
    page: 'about',
    label: 'crew card (alan)',
    selector: 'main .mate[data-name="alan"]',
    styled: 'main .mate[data-name="alan"] > .ab',
    // its ascii frame takes the person's colour
    rest: { color: 'rgba(245, 182, 58, 0.55)' },
    hover: { color: COLOURS.y },
  },
];

/** runs in the page: colour values as the rgba a canvas paints them with (browsers serialise
 *  color-mix() results differently, so the strings cannot be compared as they are) */
function paintColours(values: Record<string, string>): Record<string, string> {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const g = cv.getContext('2d', { willReadFrequently: true });
  const paint = (v: string) => {
    if (!g) return v;
    g.clearRect(0, 0, 1, 1);
    g.fillStyle = v;
    g.fillRect(0, 0, 1, 1);
    return `rgba(${[...g.getImageData(0, 0, 1, 1).data].join(', ')})`;
  };
  return Object.fromEntries(Object.entries(values).map(([p, v]) => [p, p.endsWith('color') ? paint(v) : v]));
}

/** computed styles of the first match, colours painted */
async function styles(page: Page, selector: string, props: string[]): Promise<Record<string, string>> {
  const raw = await page.locator(selector).first().evaluate((el, ps) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(ps.map((p) => [p, cs.getPropertyValue(p)]));
  }, props);
  return page.evaluate(paintColours, raw);
}

for (const h of HOVERS) {
  test(`${h.page}: hovering the ${h.label} changes its colours`, async ({ site, page }) => {
    await site.open(h.page);
    const target = page.locator(h.selector);
    await target.scrollIntoViewIfNeeded();
    await page.mouse.move(1, 1);
    await site.advance(100);
    const styled = h.styled ?? h.selector;
    const [rest, hover] = [await page.evaluate(paintColours, h.rest), await page.evaluate(paintColours, h.hover)];
    expect(await styles(page, styled, Object.keys(rest)), 'at rest').toEqual(rest);
    await target.hover();
    await site.advance(100);
    expect(await target.evaluate((el) => el.matches(':hover')), 'hovered').toBe(true);
    expect(await styles(page, styled, Object.keys(hover)), 'hovered').toEqual(hover);
    await page.mouse.move(1, 1);
    await site.advance(100);
    expect(await styles(page, styled, Object.keys(rest)), 'after the pointer left').toEqual(rest);
  });
}

for (const name of PAGE_NAMES) {
  test(`${name}: selected text is black on light grey, coloured runs included`, async ({ site, page }) => {
    await site.open(name);
    // the intro paragraphs, selected for real (on the index page the second one has coloured <i> runs)
    const selected = await page.evaluate(() => {
      const paras = [...document.querySelectorAll('main section > p')].filter((el) => (el.textContent ?? '').length > 80);
      const [first, second] = paras;
      if (!first || !second) throw new Error('no two intro paragraphs');
      const range = document.createRange();
      range.setStartBefore(first);
      range.setEndAfter(second);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(range);
      return String(getSelection()).length;
    });
    expect(selected).toBeGreaterThan(160);
    const colours = await page.evaluate(() =>
      [...document.querySelectorAll('main section > p, main section > p i')]
        .filter((el) => getSelection()?.containsNode(el, true))
        .map((el) => {
          const cs = getComputedStyle(el, '::selection');
          return { el: el.tagName.toLowerCase(), color: cs.color, background: cs.backgroundColor, own: getComputedStyle(el).color };
        }),
    );
    expect(colours.length).toBeGreaterThan(1);
    if (name === 'index') expect(colours.some((c) => c.el === 'i' && c.own !== c.color), 'a coloured run is selected').toBe(true);
    for (const c of colours) expect({ el: c.el, color: c.color, background: c.background }).toEqual({ el: c.el, color: COLOURS.bg, background: COLOURS.fg });
  });
}
