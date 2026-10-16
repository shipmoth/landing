import { test, expect } from '../support/fixtures';
import type { Page } from '@playwright/test';
import { PAGE_NAMES, type PageName } from '../support/expected';

/** the controls a keyboard user must be able to reach, in this order (others may sit between) */
const REQUIRED: Record<PageName, string[]> = {
  index: [
    'a:shipmoth',
    'a:about',
    'a:[ open lride ]',
    'a:[ open lwatch ]',
    'a:[ open lglow ]',
    'button:[ copy ]',
    'input#email',
    'button:[ subscribe ]',
  ],
  about: ['a:shipmoth', 'a:about', 'button:[ copy ]'],
};

const FOCUS_PROPS = [
  'outline-style',
  'outline-width',
  'outline-color',
  'border-bottom-color',
  'box-shadow',
  'background-color',
  'color',
  'text-decoration-line',
] as const;

interface Stop {
  key: string;
  styles: Record<string, string>;
  inViewport: boolean;
  visibleOutline: boolean;
}

/** describes the focused element and how it looks right now */
async function focused(page: Page): Promise<Stop | null> {
  return page.evaluate((props) => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const tag = el.tagName.toLowerCase();
    const key = tag === 'input' ? `input#${el.id}` : `${tag}:${(el.textContent ?? '').trim()}`;
    const cs = getComputedStyle(el);
    const styles: Record<string, string> = {};
    for (const p of props) styles[p] = cs.getPropertyValue(p);
    const b = el.getBoundingClientRect();
    return {
      key,
      styles,
      inViewport: b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth,
      visibleOutline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0,
    };
  }, FOCUS_PROPS);
}

async function unfocusedStyles(page: Page, key: string): Promise<Record<string, string>> {
  return page.evaluate(
    ({ key, props }) => {
      const all = [...document.querySelectorAll('a, button, input')];
      const el = all.find((e) => {
        const tag = e.tagName.toLowerCase();
        return (tag === 'input' ? `input#${e.id}` : `${tag}:${(e.textContent ?? '').trim()}`) === key;
      });
      if (!el) throw new Error(`no element ${key}`);
      const cs = getComputedStyle(el);
      const styles: Record<string, string> = {};
      for (const p of props) styles[p] = cs.getPropertyValue(p);
      return styles;
    },
    { key, props: FOCUS_PROPS },
  );
}

for (const name of PAGE_NAMES) {
  test(`${name}: Tab reaches every control in order, each with a visible focus indicator`, async ({ site, page }) => {
    await site.open(name);
    await site.advance(500);
    const resting = new Map<string, Record<string, string>>();
    for (const key of REQUIRED[name]) resting.set(key, await unfocusedStyles(page, key));

    const stops: Stop[] = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const stop = await focused(page);
      if (!stop) break; // wrapped past the end of the document
      if (stops.some((s) => s.key === stop.key)) break;
      stops.push(stop);
    }
    const keys = stops.map((s) => s.key);
    const reached = keys.filter((k) => REQUIRED[name].includes(k));
    expect(reached, `tab order was: ${keys.join(' > ')}`).toEqual(REQUIRED[name]);

    for (const stop of stops.filter((s) => REQUIRED[name].includes(s.key))) {
      expect(stop.inViewport, `${stop.key} is scrolled into view when focused`).toBe(true);
      const before = resting.get(stop.key) ?? {};
      const changed = FOCUS_PROPS.filter((p) => before[p] !== stop.styles[p]);
      expect(changed.length, `${stop.key} looks different when focused`).toBeGreaterThan(0);
      if (changed.some((p) => p.startsWith('outline'))) expect(stop.visibleOutline, stop.key).toBe(true);
    }
  });
}
